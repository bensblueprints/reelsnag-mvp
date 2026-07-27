'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const dl = require('./src/lib/download');
const ffmpeg = require('./src/lib/ffmpeg');
const ytdlp = require('./src/lib/ytdlp');
const { JobQueue } = require('./src/lib/queue');
const { Settings, History } = require('./src/lib/store');
const { gateLicense, registerLicenseIpc } = require('./license-gate');

const SMOKE = process.argv.includes('--smoke');

let win = null;
let dataDir = null;
let settings = null;
let history = null;
let queue = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function defaultOutDir() {
  return path.join(app.getPath('videos'), 'Reelsnag');
}

/** The real per-job runner wired into JobQueue: probe (if needed) -> download -> trim -> done. */
async function runJob(job, { onProgress, signal }) {
  const binPath = dl.ytdlpBinaryPath(dataDir);
  if (!binPath) throw new Error('yt-dlp is not installed yet — open Settings and click "Update yt-dlp".');

  const ffmpegBin = ffmpeg.ffmpegPath();
  const outDir = settings.get().outDir || defaultOutDir();
  fs.mkdirSync(outDir, { recursive: true });
  const template = settings.get().template || '%(title)s [%(id)s].%(ext)s';
  const outTemplate = path.join(outDir, template);

  onProgress({ status: 'downloading', progress: 0 });
  const cookieArgs = ytdlp.buildCookieArgs(settings.get());
  const args = ytdlp.buildDownloadArgs(job, { outTemplate, ffmpegBin, cookieArgs });
  const result = await ytdlp.download(binPath, args, {
    signal,
    onProgress: (p) => onProgress({ progress: Math.round(p.percent), speed: p.speed, eta: p.eta }),
    onLine: (line) => send('job:line', { id: job.id, line })
  });

  let finalPath = result.filePath;

  if (job.trim && finalPath && fs.existsSync(finalPath)) {
    onProgress({ status: 'processing', progress: 99 });
    const trimmedPath = finalPath.replace(/(\.[^.]+)$/, '.trimmed$1');
    await ffmpeg.trim(finalPath, trimmedPath, job.trim.start, job.trim.end);
    finalPath = trimmedPath;
  }

  onProgress({ filePath: finalPath, progress: 100 });

  history.add({
    id: job.id,
    url: job.url,
    title: (job.meta && job.meta.title) || path.basename(finalPath || job.url),
    filePath: finalPath,
    formatLabel: job.audioOnly ? `MP3${job.audioBitrate ? ' ' + job.audioBitrate + 'kbps' : ''}` : (job.formatId || 'best'),
    bytes: finalPath && fs.existsSync(finalPath) ? fs.statSync(finalPath).size : null,
    finishedAt: new Date().toISOString()
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    title: 'Reelsnag',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (SMOKE) {
    win.webContents.once('did-finish-load', () => {
      console.log('[smoke] renderer loaded OK');
      setTimeout(() => app.exit(0), 500);
    });
  }
}

app.whenReady().then(async () => {
  if (!(await gateLicense())) return; // quit already requested
  registerLicenseIpc();

  dataDir = app.getPath('userData');
  settings = new Settings(dataDir);
  history = new History(dataDir);
  queue = new JobQueue({ dataDir, concurrency: settings.get().concurrency || 1, runner: runJob });
  queue.on('update', (job) => send('job:update', job));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------- IPC ---------------- */

ipcMain.handle('binaries:status', () => {
  const binPath = dl.ytdlpBinaryPath(dataDir);
  return {
    ytdlpInstalled: !!binPath,
    ytdlpVersion: binPath ? dl.getYtdlpVersion(binPath) : null,
    ffmpegPath: ffmpeg.ffmpegPath(),
    dataDir
  };
});

ipcMain.handle('binaries:ensure', async () => {
  const onProgress = (p) => send('binaries:progress', {
    stage: p.stage,
    received: p.received,
    total: p.total,
    pct: p.total ? Math.round((p.received / p.total) * 100) : null
  });
  const binPath = await dl.ensureYtdlp(dataDir, onProgress);
  send('binaries:progress', { stage: 'done' });
  return { binPath, version: dl.getYtdlpVersion(binPath) };
});

ipcMain.handle('binaries:update', async () => {
  const onProgress = (p) => send('binaries:progress', {
    stage: p.stage,
    received: p.received,
    total: p.total,
    pct: p.total ? Math.round((p.received / p.total) * 100) : null
  });
  const binPath = await dl.updateYtdlp(dataDir, onProgress);
  send('binaries:progress', { stage: 'done' });
  return { binPath, version: dl.getYtdlpVersion(binPath) };
});

ipcMain.handle('probe:url', async (_e, url) => {
  const binPath = await dl.ensureYtdlp(dataDir, (p) => send('binaries:progress', {
    stage: p.stage, received: p.received, total: p.total,
    pct: p.total ? Math.round((p.received / p.total) * 100) : null
  }));
  const cookieArgs = ytdlp.buildCookieArgs(settings.get());
  return ytdlp.probe(binPath, url, { cookieArgs });
});

ipcMain.handle('queue:enqueue', (_e, jobSpec) => queue.enqueue(jobSpec));
ipcMain.handle('queue:enqueueBatch', (_e, { urls, defaults }) => queue.enqueueBatch(urls, defaults));
ipcMain.handle('queue:cancel', (_e, id) => queue.cancel(id));
ipcMain.handle('queue:retry', (_e, id) => queue.retry(id));
ipcMain.handle('queue:remove', (_e, id) => queue.removeJob(id));
ipcMain.handle('queue:list', () => queue.list());

ipcMain.handle('settings:get', () => Object.assign({}, settings.get(), { outDir: settings.get().outDir || defaultOutDir() }));
ipcMain.handle('settings:set', (_e, patch) => {
  const updated = settings.set(patch);
  if (typeof patch.concurrency === 'number') queue.setConcurrency(patch.concurrency);
  return updated;
});

ipcMain.handle('history:list', () => history.list());
ipcMain.handle('history:clear', () => { history.clear(); return history.list(); });

ipcMain.handle('dialog:chooseFolder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('dialog:chooseCookiesFile', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Cookies (Netscape format)', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }]
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('dialog:openTxtBatchFile', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (res.canceled) return [];
  const text = fs.readFileSync(res.filePaths[0], 'utf8');
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
});

ipcMain.handle('shell:openInFolder', (_e, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});
