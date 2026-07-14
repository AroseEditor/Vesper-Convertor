'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close:    () => ipcRenderer.send('win:close'),

  // File dialog
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openFilesDialog: () => ipcRenderer.invoke('dialog:openFiles'),

  // File detection (includes probe data for video/audio)
  detectFile: (filePath) => ipcRenderer.invoke('file:detect', filePath),

  // Conversion
  convertFile: (params) => ipcRenderer.invoke('file:convert', params),
  bulkConvert: (params) => ipcRenderer.invoke('file:bulkConvert', params),

  // Operation tools (crop, trim, merge, split, page numbers, …)
  runTool: (params) => ipcRenderer.invoke('tool:op', params),

  // Photo Editor export
  editorExport: (params) => ipcRenderer.invoke('editor:export', params),

  // Clipboard
  clipboardSaveFile: (params) => ipcRenderer.invoke('clipboard:saveFile', params),

  // Progress / error events
  onProgress: (cb) => ipcRenderer.on('convert:progress', (_e, d) => cb(d)),
  onError:    (cb) => ipcRenderer.on('convert:error',    (_e, d) => cb(d)),
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('convert:progress');
    ipcRenderer.removeAllListeners('convert:error');
  },

  // Shell actions
  openFile:     (p) => ipcRenderer.invoke('shell:open',       p),
  showInFolder: (p) => ipcRenderer.invoke('shell:showFolder', p),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Download
  selectDownloadFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  downloadUrl: (params) => ipcRenderer.invoke('download:start', params),
  cancelDownload: () => ipcRenderer.send('download:cancel'),
  onDownloadProgress: (cb) => ipcRenderer.on('download:progress', (_e, d) => cb(d)),
  removeDownloadListener: () => {
    ipcRenderer.removeAllListeners('download:progress');
  },

  // Background removal
  bgLoadImage: (params) => ipcRenderer.invoke('bg:loadImage', params),
  bgDetectSubject: (params) => ipcRenderer.invoke('bg:detectSubject', params),
  bgApply: (params) => ipcRenderer.invoke('bg:apply', params),
  bgApplyWithRefine: (params) => ipcRenderer.invoke('bg:applyWithRefine', params),

  // Settings persistence
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.send('settings:save', data),

  // Auto-update
  getVersion: () => ipcRenderer.invoke('app:version'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, pct) => cb(pct)),
  onUpdateReady: (cb) => ipcRenderer.on('update:ready', (_e, installerPath) => cb(installerPath)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update:not-available', () => cb()),
  onUpdateError: (cb) => ipcRenderer.on('update:error', (_e, msg) => cb(msg)),
  checkForUpdates: () => ipcRenderer.send('update:check'),
  downloadUpdate: (url) => ipcRenderer.send('update:download', url),
  installUpdate: (path) => ipcRenderer.send('update:install', path),

  // Denoising
  denoiseFile: (filePath) => ipcRenderer.invoke('post-process-denoise', filePath),
  onDenoiseInstallProgress: (cb) => ipcRenderer.on('denoise-install-progress', (_e, d) => cb(d)),
  removeDenoiseInstallListener: () => {
    ipcRenderer.removeAllListeners('denoise-install-progress');
  },

  // Multi-image → PDF
  imagesToPdf: (params) => ipcRenderer.invoke('images:toPdf', params),

  // Text-to-Speech
  ttsFile: (filePath) => ipcRenderer.invoke('file:tts', filePath),
  onTtsInstallProgress: (cb) => ipcRenderer.on('tts-install-progress', (_e, d) => cb(d)),
  removeTtsInstallListener: () => {
    ipcRenderer.removeAllListeners('tts-install-progress');
  },

  // Context menu file open
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, filePath) => cb(filePath)),
});
