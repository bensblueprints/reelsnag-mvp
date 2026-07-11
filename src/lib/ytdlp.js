'use strict';
/**
 * Thin wrapper around the downloaded yt-dlp binary: metadata probing and the
 * actual download, with progress parsed from stdout via progress.js.
 */
const { spawn } = require('child_process');
const { parseProgressLine } = require('./progress');

function mapProbe(data) {
  const formats = (data.formats || [])
    .filter((f) => f.vcodec !== 'none' || f.acodec !== 'none')
    .map((f) => ({
      formatId: f.format_id,
      ext: f.ext,
      resolution: f.resolution || (f.height ? `${f.height}p` : (f.vcodec === 'none' ? 'audio only' : 'unknown')),
      fps: f.fps || null,
      vcodec: f.vcodec,
      acodec: f.acodec,
      filesize: f.filesize || f.filesize_approx || null,
      note: f.format_note || ''
    }));
  const subtitles = Object.keys(data.subtitles || {});
  const autoCaptions = Object.keys(data.automatic_captions || {});
  return {
    title: data.title || 'Untitled',
    thumbnail: data.thumbnail || null,
    duration: data.duration || null,
    uploader: data.uploader || data.channel || 'Unknown',
    webpageUrl: data.webpage_url || null,
    formats,
    subtitles,
    autoCaptions
  };
}

/**
 * Build the yt-dlp cookie args from settings, so login-gated pages (Facebook,
 * Instagram, etc.) can be read the same way a logged-in browser tab would see
 * them. 'browser' extracts live from an installed browser's cookie jar;
 * 'file' points at a previously exported cookies.txt (Netscape format).
 */
function buildCookieArgs(settings) {
  if (!settings) return [];
  if (settings.cookiesMode === 'browser' && settings.cookiesBrowser) {
    return ['--cookies-from-browser', settings.cookiesBrowser];
  }
  if (settings.cookiesMode === 'file' && settings.cookiesFile) {
    return ['--cookies', settings.cookiesFile];
  }
  return [];
}

/** Probe a URL's metadata via `yt-dlp -J` without downloading anything. */
function probe(binPath, url, { timeoutMs = 30000, cookieArgs = [] } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-J', '--no-playlist', '--no-warnings', ...cookieArgs, url];
    const child = spawn(binPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) { /* ignore */ }
      reject(new Error('Probe timed out'));
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error('yt-dlp probe failed: ' + (stderr.trim().slice(-500) || `exit code ${code}`)));
      }
      try {
        resolve(mapProbe(JSON.parse(stdout)));
      } catch (err) {
        reject(new Error('Failed to parse yt-dlp metadata: ' + err.message));
      }
    });
  });
}

/**
 * Some sites (Facebook reels/posts especially) put the entire caption in
 * "title", which combined with --restrict-filenames can blow past Windows'
 * 260-char MAX_PATH and fail with "unable to open for writing: No such file
 * or directory". --trim-filenames caps each templated field so the final
 * path stays well under the limit regardless of output folder depth.
 */
const TRIM_FILENAMES_LENGTH = 100;

/** Build the yt-dlp CLI args for a queued job. */
function buildDownloadArgs(job, { outTemplate, ffmpegBin, cookieArgs = [] }) {
  const args = ['--newline', '--no-playlist', '--no-warnings', '--ffmpeg-location', ffmpegBin, '-o', outTemplate, '--restrict-filenames', '--trim-filenames', String(TRIM_FILENAMES_LENGTH), ...cookieArgs];
  if (job.audioOnly) {
    args.push('-x', '--audio-format', 'mp3');
    if (job.audioBitrate) args.push('--audio-quality', String(job.audioBitrate));
  } else {
    args.push('-f', job.formatId || 'bv*+ba/best');
    args.push('--merge-output-format', 'mp4');
  }
  if (job.subs && job.subs.length) {
    args.push('--write-subs', '--sub-langs', job.subs.join(','), '--convert-subs', 'srt');
  }
  args.push(job.url);
  return args;
}

/** Run a yt-dlp download, streaming parsed progress via onProgress. */
function download(binPath, args, { onProgress, onLine, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { windowsHide: true });
    let stderr = '';
    let destination = null;

    const onAbort = () => { try { child.kill(); } catch (_) { /* ignore */ } };
    if (signal) {
      if (signal.aborted) { onAbort(); reject(new Error('Cancelled')); return; }
      signal.addEventListener('abort', onAbort);
    }

    child.stdout.on('data', (d) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (!line) continue;
        if (onLine) onLine(line);
        const destMatch = line.match(/Destination:\s*(.+)$/) || line.match(/\[download\]\s+(.+)\s+has already been downloaded/);
        if (destMatch) destination = destMatch[1].trim();
        const mergeMatch = line.match(/\[Merger\]\s+Merging formats into\s+"(.+)"/);
        if (mergeMatch) destination = mergeMatch[1];
        const progress = parseProgressLine(line);
        if (progress && onProgress) onProgress(progress);
      }
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (signal && signal.aborted) return reject(new Error('Cancelled'));
      if (code !== 0) return reject(new Error('yt-dlp failed: ' + (stderr.trim().slice(-800) || `exit code ${code}`)));
      resolve({ filePath: destination });
    });
  });
}

module.exports = { probe, buildDownloadArgs, download, mapProbe, buildCookieArgs };
