'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Binaries (yt-dlp + ffmpeg)
  binaryStatus: () => ipcRenderer.invoke('binaries:status'),
  ensureBinaries: () => ipcRenderer.invoke('binaries:ensure'),
  updateYtdlp: () => ipcRenderer.invoke('binaries:update'),
  onBinariesProgress: (cb) => ipcRenderer.on('binaries:progress', (_e, p) => cb(p)),

  // Probe
  probe: (url) => ipcRenderer.invoke('probe:url', url),

  // Queue
  enqueue: (jobSpec) => ipcRenderer.invoke('queue:enqueue', jobSpec),
  enqueueBatch: (urls, defaults) => ipcRenderer.invoke('queue:enqueueBatch', { urls, defaults }),
  cancel: (id) => ipcRenderer.invoke('queue:cancel', id),
  retry: (id) => ipcRenderer.invoke('queue:retry', id),
  removeJob: (id) => ipcRenderer.invoke('queue:remove', id),
  listJobs: () => ipcRenderer.invoke('queue:list'),
  onJobUpdate: (cb) => ipcRenderer.on('job:update', (_e, job) => cb(job)),
  onJobLine: (cb) => ipcRenderer.on('job:line', (_e, p) => cb(p)),

  // Settings + history
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getHistory: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Filesystem helpers
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  openTxtBatchFile: () => ipcRenderer.invoke('dialog:openTxtBatchFile'),
  openInFolder: (filePath) => ipcRenderer.invoke('shell:openInFolder', filePath)
});
