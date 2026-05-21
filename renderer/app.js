'use strict';

// --------------------------- State ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const state = {
  currentFile: null,
  selectedFormat: null,
  converting: false,
  downloading: false,
  downloadMode: false,
  threads: 4,
  ytdlpQuality: '1080',
  history: [],
  bulkFiles: [],  // array of file info objects for bulk mode
};

// --------------------------- DOM ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const dropzone        = $('dropzone');
const fileInfoSection = $('file-info-section');
const fileTypeBadge   = $('file-type-badge');
const fileNameEl      = $('file-name');
const fileDetailsEl   = $('file-details');
const fileClearBtn    = $('file-clear-btn');
const sourceMeta      = $('source-meta');
const srcRes          = $('src-res');
const srcFps          = $('src-fps');
const srcBr           = $('src-br');
const formatSection   = $('format-section');
const formatDropdown  = $('format-dropdown');
const formatToggle    = $('format-toggle');
const formatToggleText= $('format-toggle-text');
const formatMenu      = $('format-menu');
const formatSearch    = $('format-search');
const formatOptions   = $('format-options');
const optionsSection  = $('options-section');
const optionsToggle   = $('options-toggle');
const optionsBody     = $('options-body');
const optImage        = $('opt-image');
const optVideo        = $('opt-video');
const optAudio        = $('opt-audio');
const qualitySlider   = $('opt-quality');
const qualityDisplay  = $('quality-display');
const qualitySliderRow = $('quality-slider-row');
const imgPresetSel    = $('opt-quality-preset-img');
const vidPresetSel    = $('opt-quality-preset-vid');
const optFix          = $('opt-fix');
const fixPlatformSel  = $('opt-fix-platform');
const convertSection  = $('convert-section');
const convertBtn      = $('convert-btn');
const progressSection = $('progress-section');
const progressBar     = $('progress-bar');
const progressLabel   = $('progress-label');
const progressPct     = $('progress-pct');
const cancelBtn       = $('cancel-btn');
const historyList     = $('history-list');
const historyClearBtn = $('history-clear-btn');

// Settings
const settingsOverlay = $('settings-overlay');
const settingsCloseBtn= $('settings-close-btn');
const settingsBtn     = $('btn-settings');
const threadSlider    = $('thread-slider');
const threadCount     = $('thread-count');
const githubLink      = $('github-link');

// Download mode
const downloadHint    = $('download-link-hint');
const downloadSection = $('download-section');
const downloadUrl     = $('download-url');
const downloadGoBtn   = $('download-go-btn');
const downloadBack    = $('download-back');
const dlProgressSection = $('download-progress-section');
const dlProgressBar   = $('dl-progress-bar');
const dlProgressLabel = $('dl-progress-label');
const dlSpeed         = $('dl-speed');
const dlProgressPct   = $('dl-progress-pct');
const dlDownloaded    = $('dl-downloaded');
const dlCancelBtn     = $('dl-cancel-btn');
const ytdlpQuality    = $('ytdlp-quality');
const downloadSource  = $('download-source');

// --------------------------- Window controls ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
$('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
$('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
$('btn-close').addEventListener('click',    () => window.electronAPI.close());

// Populate version in Settings
if (window.electronAPI.getVersion) {
  window.electronAPI.getVersion().then(v => {
    const el = $('settings-app-version');
    if (el) el.textContent = `Current version: v${v}`;
  });
}

// --------------------------- Clear history ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
historyClearBtn.addEventListener('click', () => {
  state.history = [];
  historyList.innerHTML = '<li class="history-empty">No conversions yet ... drop a file to get started</li>';
});

// --------------------------- Settings panel ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
settingsBtn.addEventListener('click', () => {
  settingsOverlay.classList.add('open');
});

settingsCloseBtn.addEventListener('click', () => {
  settingsOverlay.classList.remove('open');
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
});

threadSlider.addEventListener('input', () => {
  state.threads = parseInt(threadSlider.value);
  threadCount.textContent = threadSlider.value;
  if (window.electronAPI.saveSettings) window.electronAPI.saveSettings({ threads: state.threads });
});

githubLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.electronAPI.openExternal('https://github.com/AroseEditor/');
});

ytdlpQuality.addEventListener('change', () => {
  state.ytdlpQuality = ytdlpQuality.value;
  if (window.electronAPI.saveSettings) window.electronAPI.saveSettings({ ytdlpQuality: state.ytdlpQuality });
});

// Divide pages toggle persistence
const dividePagesToggle = $('opt-divide-pages');
if (dividePagesToggle) {
  dividePagesToggle.addEventListener('change', () => {
    if (window.electronAPI.saveSettings) window.electronAPI.saveSettings({ dividePages: dividePagesToggle.checked });
  });
}

// OCR images toggle persistence
const ocrImagesToggle = $('opt-ocr-images');
if (ocrImagesToggle) {
  ocrImagesToggle.addEventListener('change', () => {
    if (window.electronAPI.saveSettings) window.electronAPI.saveSettings({ ocrImages: ocrImagesToggle.checked });
  });
}

// Load saved settings on startup
if (window.electronAPI.loadSettings) {
  window.electronAPI.loadSettings().then(s => {
    if (s.threads != null) {
      state.threads = s.threads;
      threadSlider.value = s.threads;
      threadCount.textContent = s.threads;
    }
    if (s.ytdlpQuality != null) {
      state.ytdlpQuality = s.ytdlpQuality;
      ytdlpQuality.value = s.ytdlpQuality;
    }
    if (s.dividePages != null && dividePagesToggle) {
      dividePagesToggle.checked = s.dividePages;
    }
    if (s.ocrImages != null && ocrImagesToggle) {
      ocrImagesToggle.checked = s.ocrImages;
    }
  });
}

// --------------------------- Download mode toggle ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
downloadHint.addEventListener('click', () => {
  state.downloadMode = true;
  dropzone.style.display = 'none';
  downloadHint.style.display = 'none';
  show(downloadSection);
  downloadSource.innerHTML = '';
  downloadUrl.focus();
});

downloadUrl.addEventListener('input', () => {
  const url = downloadUrl.value.trim();
  downloadSource.innerHTML = url ? detectSourceHtml(url) : '';
});

downloadBack.addEventListener('click', () => {
  state.downloadMode = false;
  dropzone.style.display = '';
  downloadHint.style.display = '';
  hide(downloadSection);
  hide(dlProgressSection);
  downloadUrl.value = '';
});

// --------------------------- Download handler ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
downloadGoBtn.addEventListener('click', startDownload);
downloadUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') startDownload(); });

async function startDownload() {
  const url = downloadUrl.value.trim();
  if (!url || state.downloading) return;

  // Ask where to save
  const savePath = await window.electronAPI.selectDownloadFolder();
  if (!savePath) return;

  state.downloading = true;
  show(dlProgressSection);
  dlProgressBar.style.width = '0%';
  dlProgressLabel.textContent = 'Starting download...';
  dlSpeed.textContent = '0 MB/s';
  dlProgressPct.textContent = '0%';
  dlDownloaded.textContent = '0 MB / ?';

  window.electronAPI.onDownloadProgress(({ percent, speed, downloaded, total, message }) => {
    const pct = Math.min(Math.max(percent || 0, 0), 100);
    dlProgressBar.style.width = pct + '%';
    dlProgressPct.textContent = Math.round(pct) + '%';
    dlProgressLabel.textContent = message || 'Downloading...';
    if (speed !== undefined) dlSpeed.textContent = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';
    if (downloaded !== undefined && total !== undefined) {
      dlDownloaded.textContent = fmtBytes(downloaded) + ' / ' + fmtBytes(total);
    } else if (downloaded !== undefined) {
      dlDownloaded.textContent = fmtBytes(downloaded);
    }
  });

  try {
    const dlFormat = $('download-format')?.value || 'mp4';
    const quality = dlFormat === 'mp3' ? 'audio' : state.ytdlpQuality;
    const result = await window.electronAPI.downloadUrl({ url, savePath, threads: state.threads, quality });
    if (result.error) {
      dlProgressLabel.textContent = '... ' + result.error.slice(0, 80);
      dlSpeed.textContent = 'Error';
      addHistory({ status: 'error', error: result.error, inputName: url.slice(0, 50), outputName: '...' });
    } else {
      dlProgressBar.style.width = '100%';
      dlProgressPct.textContent = '100%';
      dlProgressLabel.textContent = 'Download complete!';
      dlSpeed.textContent = 'Done';
      const outName = result.filePath.split(/[\\/]/).pop();
      addHistory({
        status: 'success',
        inputName: url.length > 50 ? url.slice(0, 47) + '...' : url,
        outputName: outName,
        outputPath: result.filePath,
        sizeBefore: 0,
        sizeAfter: result.fileSize,
      });
      setTimeout(() => hide(dlProgressSection), 3000);
    }
  } catch (err) {
    dlProgressLabel.textContent = '... ' + err.message;
    dlSpeed.textContent = 'Error';
  }

  state.downloading = false;
  window.electronAPI.removeDownloadListener();
}

dlCancelBtn.addEventListener('click', () => {
  window.electronAPI.cancelDownload();
  state.downloading = false;
  hide(dlProgressSection);
  dlProgressLabel.textContent = 'Cancelled';
  window.electronAPI.removeDownloadListener();
});

// --------------------------- Drag events ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', (e) => { if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('drag-over'); });
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const files = [...e.dataTransfer.files];
  if (files.length > 1) {
    enterBulkMode(files.map(f => f.path));
  } else if (files.length === 1) {
    loadFile(files[0].path);
  }
});

// Click / keyboard browse
dropzone.addEventListener('click', async () => { if (!state.converting) { const p = await window.electronAPI.openFileDialog(); if (p) loadFile(p); } });
dropzone.addEventListener('keydown', async (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const p = await window.electronAPI.openFileDialog(); if (p) loadFile(p); } });

// Right-click for bulk file selection
dropzone.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  if (state.converting) return;
  const paths = await window.electronAPI.openFilesDialog();
  if (paths && paths.length > 1) {
    enterBulkMode(paths);
  } else if (paths && paths.length === 1) {
    loadFile(paths[0]);
  }
});

fileClearBtn.addEventListener('click', (e) => { e.stopPropagation(); resetUI(); });

// --------------------------- Clipboard paste --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
document.addEventListener('paste', async (e) => {
  if (state.converting || state.downloadMode) return;
  // Check for files in clipboard
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === 'file') {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      // For files pasted from explorer (have a path)
      if (file.path) {
        loadFile(file.path);
        return;
      }
      // For images copied to clipboard (screenshots, copied images)
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          const tmpPath = await window.electronAPI.clipboardSaveFile({ base64, mimeType: file.type });
          if (tmpPath) loadFile(tmpPath);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }
});

// --------------------------- Load / detect file ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function loadFile(filePath) {
  resetUI(false);
  try {
    const info = await window.electronAPI.detectFile(filePath);
    if (info.error) { showError('Could not read file: ' + info.error); return; }
    state.currentFile = info;
    renderFileInfo(info);
    populateDropdown(info);
    applySourceDefaults(info);
    show(fileInfoSection); show(formatSection); show(convertSection);
  } catch (err) { showError('Detection failed: ' + err.message); }
}

// --------------------------- Render file info ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function renderFileInfo(info) {
  fileTypeBadge.textContent = info.ext.toUpperCase().slice(0, 5);
  fileNameEl.textContent = info.name;
  const sizeMB = (info.size / (1024 * 1024)).toFixed(1);
  fileDetailsEl.textContent = `${info.mime} | ${sizeMB} MB`;
  dropzone.classList.add('file-loaded');

  // Source media info
  if (info.probe && (info.probe.video || info.probe.audio)) {
    sourceMeta.style.display = 'flex';
    if (info.probe.video) {
      srcRes.textContent = `${info.probe.video.width}x${info.probe.video.height}`;
      srcFps.textContent = info.probe.video.fps ? `${info.probe.video.fps} fps` : '';
      srcBr.textContent = info.probe.bitrate ? `${info.probe.bitrate} kbps` : '';
    } else if (info.probe.audio) {
      srcRes.textContent = info.probe.audio.codec || '';
      srcFps.textContent = `${info.probe.audio.sampleRate || '?'} Hz`;
      srcBr.textContent = info.probe.audio.bitrate ? `${info.probe.audio.bitrate} kbps` : '';
    }
  } else {
    sourceMeta.style.display = 'none';
  }
}

function applySourceDefaults(p) {
  if (!p.probe) return;
  if (p.probe.video) {
    if (p.probe.video.width)  $('opt-vid-width').placeholder  = `${p.probe.video.width} (source)`;
    if (p.probe.video.height) $('opt-vid-height').placeholder = `${p.probe.video.height} (source)`;
    if (p.probe.video.fps)    $('opt-framerate').placeholder  = `${p.probe.video.fps} (source)`;
  }
  if (p.probe.audio && p.probe.audio.bitrate) {
    const src = p.probe.audio.bitrate;
    const thresholds = [64, 128, 192, 256, 320];
    const closest = thresholds.reduce((a, b) => Math.abs(b - src) < Math.abs(a - src) ? b : a);
    const sel = $('opt-bitrate');
    const opt = [...sel.options].find(o => parseInt(o.value) >= closest);
    if (opt) sel.value = opt.value;
    else sel.value = '320k';
  }
}

// --------------------------- Format descriptions for dropdown ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const FORMAT_DESC = {
  // Image
  jpg:  'JPEG image', png:  'Lossless image', webp: 'Web image', avif: 'AV1 image',
  gif:  'Animated image', tiff: 'TIFF image', bmp:  'Bitmap image', ico:  'Icon file',
  // Video
  mp4:  'H.264 video', webm: 'VP9 video', mov:  'QuickTime', avi:  'Legacy video',
  mkv:  'Matroska video',
  // Audio
  mp3:  'MPEG audio', wav:  'Lossless PCM', ogg:  'Vorbis audio', flac: 'Lossless audio',
  aac:  'AAC audio', opus: 'Opus audio',
  // Document
  txt:  'Plain text', html: 'Web page', pdf:  'PDF document',
  // Data
  json: 'JSON data', csv:  'CSV spreadsheet', xml:  'XML data', yaml: 'YAML config',
  xlsx: 'Excel sheet',
  // Config
  toml: 'TOML config', env:  'Dotenv file',
  // 3D
  glb:  'glTF binary', obj:  'Wavefront OBJ', fbx:  'FBX model',
  // Special
  fix:         'Platform compatibility fix',
  'extract-text':   'Extract text content',
  'extract-images': 'Extract images from PDF',
  'extract-fonts':  'Extract embedded fonts',
  'extract':        'Extract archive contents',
  'remove-bg':      'AI background removal',
  'watermark-pdf':  'Watermark PDF',
  'denoise':        'BG Noise Removal (2-pass AI+FFmpeg)',
};

// --------------------------- Dropdown ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function populateDropdown(info) {
  formatOptions.innerHTML = '';
  state.selectedFormat = null;
  formatToggleText.textContent = 'Select output format...';
  formatToggleText.classList.remove('has-value');
  updateConvertBtn();

  if (!info.outputFormats || !info.outputFormats.length) {
    formatOptions.innerHTML = '<li class="format-option-divider">No conversions available</li>';
    return;
  }

  // Group formats by type
  const groups = {};
  info.outputFormats.forEach(fmt => {
    let group = 'Conversion';
    if (fmt.startsWith('extract')) group = 'Extraction';
    else if (fmt === 'fix') group = 'Fix';
    else if (['json','yaml','csv','xml','toml','env','xlsx'].includes(fmt)) group = 'Data / Config';
    else if (['glb','obj','fbx'].includes(fmt)) group = '3D Models';
    else if (['mp4','webm','mov','avi','mkv','gif'].includes(fmt)) group = 'Video';
    else if (['mp3','wav','ogg','flac','aac','opus'].includes(fmt)) group = 'Audio';
    else if (['jpg','png','webp','avif','tiff','bmp','ico'].includes(fmt)) group = 'Image';
    else if (['txt','html','pdf'].includes(fmt)) group = 'Document';
    else if (fmt === 'remove-bg') group = 'Image';
    else if (fmt === 'watermark-pdf') group = 'Document';
    else if (fmt === 'denoise') group = 'Post Process';
    if (!groups[group]) groups[group] = [];
    groups[group].push(fmt);
  });

  // Render groups
  for (const [groupName, fmts] of Object.entries(groups)) {
    const divider = document.createElement('li');
    divider.className = 'format-option-divider';
    divider.textContent = groupName;
    formatOptions.appendChild(divider);

    fmts.forEach(fmt => {
      const li = document.createElement('li');
      li.className = 'format-option';
      li.dataset.format = fmt;
      li.dataset.search = `${fmt} ${FORMAT_DESC[fmt] || ''} ${groupName}`.toLowerCase();
      li.innerHTML = `
        <span class="format-option-label">${fmt.toUpperCase()}</span>
        <span class="format-option-desc">${FORMAT_DESC[fmt] || ''}</span>
      `;
      li.addEventListener('click', () => selectFormat(fmt, info.category, info.probe));
      formatOptions.appendChild(li);
    });
  }
}

// Toggle dropdown
formatToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = formatDropdown.classList.toggle('open');
  if (isOpen) {
    formatSearch.value = '';
    filterDropdown('');
    setTimeout(() => formatSearch.focus(), 50);
  }
});

// Search filter
formatSearch.addEventListener('input', () => filterDropdown(formatSearch.value));

function filterDropdown(query) {
  const q = query.toLowerCase().trim();
  formatOptions.querySelectorAll('.format-option').forEach(opt => {
    opt.classList.toggle('hidden', q && !opt.dataset.search.includes(q));
  });
  // Hide dividers with no visible children after them
  formatOptions.querySelectorAll('.format-option-divider').forEach(div => {
    let next = div.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('format-option-divider')) {
      if (!next.classList.contains('hidden')) hasVisible = true;
      next = next.nextElementSibling;
    }
    div.style.display = hasVisible ? '' : 'none';
  });
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!formatDropdown.contains(e.target)) {
    formatDropdown.classList.remove('open');
  }
});

// Keyboard nav
formatSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    formatDropdown.classList.remove('open');
  } else if (e.key === 'Enter') {
    const visible = [...formatOptions.querySelectorAll('.format-option:not(.hidden)')];
    if (visible.length === 1) visible[0].click();
  }
});

function selectFormat(fmt, category, probe) {
  // Update dropdown display
  formatOptions.querySelectorAll('.format-option').forEach(o => o.classList.remove('selected'));
  const opt = formatOptions.querySelector(`[data-format="${fmt}"]`);
  if (opt) opt.classList.add('selected');

  formatToggleText.textContent = `${fmt.toUpperCase()} - ${FORMAT_DESC[fmt] || fmt}`;
  formatToggleText.classList.add('has-value');
  formatDropdown.classList.remove('open');

  state.selectedFormat = fmt;

  // Special: open mask editor for background removal
  if (fmt === 'remove-bg' && state.currentFile) {
    openMaskEditor(state.currentFile.path);
    return;
  }

  updateOptionsPanel(category, fmt, probe);
  updateConvertBtn();
}

// --------------------------- Options panel ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
optionsToggle.addEventListener('click', () => {
  const open = optionsBody.classList.toggle('open');
  optionsToggle.setAttribute('aria-expanded', open);
});

function updateOptionsPanel(category, format, probe) {
  show(optionsSection);
  optImage.style.display = 'none';
  optVideo.style.display = 'none';
  optAudio.style.display = 'none';
  optFix.style.display   = 'none';
  const optExtract = $('opt-extract');
  if (optExtract) optExtract.style.display = 'none';
  const optWatermark = $('opt-watermark');
  if (optWatermark) optWatermark.style.display = 'none';
  const optDenoise = $('opt-denoise');
  if (optDenoise) optDenoise.style.display = 'none';

  const audioOnlyFmt = ['mp3','wav','ogg','flac','aac','opus'];

  if (format === 'denoise') {
    if (optDenoise) optDenoise.style.display = 'flex';
    const statusText = $('denoise-status-text');
    if (statusText) statusText.textContent = 'Ready. Select "CONVERT" to start background noise removal.';
  } else if (format === 'watermark-pdf') {
    if (optWatermark) optWatermark.style.display = 'flex';
  } else if (format === 'fix') {
    optFix.style.display = 'flex';
  } else if (format === 'extract-text') {
    // Show Divide Pages option for text extraction
    const optExtract = $('opt-extract');
    if (optExtract) optExtract.style.display = 'flex';
  } else if (format.startsWith('extract')) {
    // No special options for image/font extraction
    hide(optionsSection);
  } else if (['json','yaml','csv','xml','toml','env','xlsx'].includes(format)) {
    // No special options for data/config conversion
    hide(optionsSection);
  } else if (['glb','obj','fbx'].includes(format)) {
    // No special options for 3D
    hide(optionsSection);
  } else if (category === 'image') {
    optImage.style.display = 'flex';
    imgPresetSel.value = 'lossless';
    qualitySliderRow.style.display = 'none';
  } else if (category === 'video') {
    if (audioOnlyFmt.includes(format)) {
      optAudio.style.display = 'flex';
      $('audio-lossless-hint').style.display = (format === 'flac' || format === 'wav') ? 'block' : 'none';
    } else {
      optVideo.style.display = 'flex';
      vidPresetSel.value = 'lossless';
    }
  } else if (category === 'audio') {
    optAudio.style.display = 'flex';
    $('audio-lossless-hint').style.display = (format === 'flac' || format === 'wav') ? 'block' : 'none';
  } else {
    hide(optionsSection);
  }
}

// Quality preset --------- slider
if (imgPresetSel) {
  imgPresetSel.addEventListener('change', () => {
    qualitySliderRow.style.display = imgPresetSel.value === 'custom' ? 'flex' : 'none';
  });
}
if (qualitySlider) {
  qualitySlider.addEventListener('input', () => { qualityDisplay.textContent = qualitySlider.value; });
}

// Watermark opacity slider
const wmOpacitySlider = $('opt-watermark-opacity');
const wmOpacityDisplay = $('watermark-opacity-display');
if (wmOpacitySlider) {
  wmOpacitySlider.addEventListener('input', () => {
    wmOpacityDisplay.textContent = (wmOpacitySlider.value / 100).toFixed(2);
  });
}

// --------------------------- Convert ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
convertBtn.addEventListener('click', async () => {
  if (state.bulkFiles.length > 1) return; // bulk handler takes over
  if (!state.currentFile || !state.selectedFormat || state.converting) return;
  state.converting = true;
  updateConvertBtn();
  show(progressSection);
  setProgress(0, 'Starting...');

  const options = gatherOptions();

  window.electronAPI.onProgress(({ percent, message }) => setProgress(percent, message));
  if (state.selectedFormat === 'denoise') {
    window.electronAPI.onDenoiseInstallProgress((msg) => {
      const statusText = $('denoise-status-text');
      if (statusText) statusText.textContent = msg;
      setProgress(0, msg);
    });
  }

  try {
    const result = await window.electronAPI.convertFile({
      filePath: state.currentFile.path,
      outputFormat: state.selectedFormat,
      options,
    });

    if (result.error) {
      showError(result.error);
      addHistory({ status: 'error', error: result.error,
        inputName: state.currentFile.name,
        outputName: '...', sizeBefore: state.currentFile.size });
    } else {
      setProgress(100, 'Done!');
      flashSuccess();
      const outName = result.outputPath.split(/[\\/]/).pop();
      addHistory({
        status: 'success',
        inputName: state.currentFile.name,
        outputName: outName,
        outputPath: result.outputPath,
        sizeBefore: state.currentFile.size,
        sizeAfter: result.outputSize,
      });
      setTimeout(() => hide(progressSection), 2000);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    state.converting = false;
    updateConvertBtn();
    window.electronAPI.removeProgressListener();
    if (state.selectedFormat === 'denoise') {
      window.electronAPI.removeDenoiseInstallListener();
    }
  }
});

function gatherOptions() {
  const o = {};
  // Image
  o.width  = $('opt-img-width').value || null;
  o.height = $('opt-img-height').value || null;
  o.qualityPreset = imgPresetSel.value;
  o.quality = qualitySlider.value;
  // Video
  o.vidWidth  = $('opt-vid-width').value || null;
  o.vidHeight = $('opt-vid-height').value || null;
  o.framerate = $('opt-framerate').value || null;
  o.qualityPreset = vidPresetSel.value || imgPresetSel.value;
  // Audio
  o.bitrate = $('opt-bitrate').value;
  if (state.currentFile && state.currentFile.probe && state.currentFile.probe.audio) {
    o.sourceBitrate = state.currentFile.probe.audio.bitrate;
  }
  // Fix
  o.fixPlatform = fixPlatformSel.value;
  // Extraction
  o.dividePages = $('opt-divide-pages')?.checked || false;
  o.ocrImages = $('opt-ocr-images')?.checked || false;
  // Watermark
  o.watermarkText = $('opt-watermark-text')?.value || '';
  o.watermarkOpacity = ($('opt-watermark-opacity')?.value || 15) / 100;
  return o;
}

// --------------------------- Bulk mode -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function enterBulkMode(filePaths) {
  resetUI(false);
  state.bulkFiles = [];

  // Detect all files
  const detected = [];
  for (const fp of filePaths) {
    try {
      const info = await window.electronAPI.detectFile(fp);
      if (!info.error) detected.push(info);
    } catch {}
  }
  if (!detected.length) { showError('No valid files detected'); return; }

  state.bulkFiles = detected;
  // Use first file as reference for format dropdown
  state.currentFile = detected[0];

  // Render bulk file info
  fileTypeBadge.textContent = 'BULK';
  fileNameEl.textContent = `${detected.length} files selected`;

  // Count categories
  const cats = {};
  detected.forEach(f => { cats[f.category] = (cats[f.category] || 0) + 1; });
  const catSummary = Object.entries(cats).map(([c, n]) => `${n} ${c}`).join(', ');
  fileDetailsEl.textContent = catSummary;
  dropzone.classList.add('file-loaded');
  sourceMeta.style.display = 'none';

  // Find common output formats (intersection of all files' formats)
  let commonFormats = [...(detected[0].outputFormats || [])];
  for (let i = 1; i < detected.length; i++) {
    const fmts = new Set(detected[i].outputFormats || []);
    commonFormats = commonFormats.filter(f => fmts.has(f));
  }
  // If no common formats, use first file's formats
  if (!commonFormats.length) commonFormats = detected[0].outputFormats || [];

  // Override the info with common formats for dropdown
  const bulkInfo = { ...detected[0], outputFormats: commonFormats, name: `${detected.length} files` };
  populateDropdown(bulkInfo);

  show(fileInfoSection); show(formatSection); show(convertSection);
  updateConvertBtn();
}

// Override convert button to handle bulk mode
const _origConvertClick = convertBtn.onclick;
convertBtn.addEventListener('click', async () => {
  // Only intercept if bulk mode
  if (!state.bulkFiles.length || !state.selectedFormat || state.converting) return;

  // Prevent double-fire: the original click handler checks state.currentFile
  // In bulk mode we handle it here
  if (state.bulkFiles.length <= 1) return; // let single-file handler take over

  state.converting = true;
  updateConvertBtn();
  show(progressSection);
  setProgress(0, 'Starting bulk conversion...');

  const options = gatherOptions();
  const filePaths = state.bulkFiles.map(f => f.path);

  window.electronAPI.onProgress(({ percent, message }) => setProgress(percent, message));
  if (state.selectedFormat === 'denoise') {
    window.electronAPI.onDenoiseInstallProgress((msg) => {
      const statusText = $('denoise-status-text');
      if (statusText) statusText.textContent = msg;
      setProgress(0, msg);
    });
  }

  try {
    const results = await window.electronAPI.bulkConvert({
      filePaths,
      outputFormat: state.selectedFormat,
      options,
    });

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    setProgress(100, `Done! ${successes.length}/${results.length} converted`);
    flashSuccess();

    // Add each result to history
    for (const r of results) {
      if (r.success) {
        const outName = r.outputPath.split(/[\\/]/).pop();
        addHistory({ status: 'success', inputName: r.inputName, outputName: outName, outputPath: r.outputPath, sizeBefore: 0, sizeAfter: r.outputSize });
      } else {
        addHistory({ status: 'error', error: r.error, inputName: r.inputName, outputName: '...' });
      }
    }

    if (failures.length) {
      setTimeout(() => showError(`${failures.length} file(s) failed`), 1000);
    }
    setTimeout(() => hide(progressSection), 3000);
  } catch (err) {
    showError(err.message);
  } finally {
    state.converting = false;
    state.bulkFiles = [];
    updateConvertBtn();
    window.electronAPI.removeProgressListener();
    if (state.selectedFormat === 'denoise') {
      window.electronAPI.removeDenoiseInstallListener();
    }
  }
}, true); // useCapture to fire before the original handler

// --------------------------- History ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function addHistory(item) {
  state.history.unshift(item);
  if (state.history.length > 10) state.history.pop();

  // Remove empty message
  const empty = historyList.querySelector('.history-empty');
  if (empty) empty.remove();

  const li = document.createElement('li');
  li.className = 'history-item';

  const icon = item.status === 'success'
    ? `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 5.5L4 7.5L8 3"/></svg>`
    : `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5"/></svg>`;

  const detail = item.status === 'success' && item.sizeAfter && item.sizeBefore
    ? `${fmtBytes(item.sizeBefore)} -> ${fmtBytes(item.sizeAfter)}`
    : (item.error ? item.error.slice(0, 60) : '');

  li.innerHTML = `
    <div class="history-status ${item.status}">${icon}</div>
    <div class="history-names">
      <div class="history-conversion">${esc(item.inputName || '?')} -> <strong>${esc(item.outputName || '?')}</strong></div>
      <div class="history-meta">${detail}</div>
    </div>
    ${item.status === 'success' && item.outputPath ? `
    <div class="history-actions">
      <button class="history-action-btn" data-path="${esc(item.outputPath)}" data-action="open">Open</button>
      <button class="history-action-btn" data-path="${esc(item.outputPath)}" data-action="folder">Folder</button>
    </div>` : ''}
  `;

  li.querySelectorAll('.history-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'open') window.electronAPI.openFile(btn.dataset.path);
      else window.electronAPI.showInFolder(btn.dataset.path);
    });
  });

  historyList.prepend(li);
  while (historyList.children.length > 10) historyList.removeChild(historyList.lastChild);
}

// --------------------------- UI helpers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function show(el) { el.classList.add('visible'); }
function hide(el) { el.classList.remove('visible'); }

function updateConvertBtn() {
  convertBtn.disabled = !(state.currentFile && state.selectedFormat && !state.converting);
}

function resetUI(clearFile = true) {
  if (clearFile) { state.currentFile = null; state.selectedFormat = null; state.bulkFiles = []; }
  state.converting = false;
  dropzone.classList.remove('drag-over','file-loaded','success-flash');
  hide(fileInfoSection); hide(formatSection); hide(optionsSection); hide(progressSection);
  optionsBody.classList.remove('open');
  formatOptions.innerHTML = '';
  formatToggleText.textContent = 'Select output format...';
  formatToggleText.classList.remove('has-value');
  formatDropdown.classList.remove('open');
  setProgress(0, 'Converting...');
  updateConvertBtn();
  window.electronAPI.removeProgressListener();
}

function showError(msg) {
  console.error('[CC]', msg);
  progressLabel.textContent = '... ' + msg.slice(0, 80);
  progressPct.textContent = 'Error';
  show(progressSection);
  setTimeout(() => hide(progressSection), 5000);
}

function setProgress(pct, msg) {
  const c = Math.min(Math.max(pct, 0), 100);
  progressBar.style.width = c + '%';
  progressLabel.textContent = msg || 'Converting...';
  progressPct.textContent = Math.round(c) + '%';
}

function flashSuccess() {
  dropzone.classList.add('success-flash');
  setTimeout(() => dropzone.classList.remove('success-flash'), 1600);
}

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function detectSourceHtml(url) {
  const sources = [
    { pattern: /youtube\.com|youtu\.be/i,   name: 'YouTube',   method: 'yt-dlp' },
    { pattern: /instagram\.com/i,           name: 'Instagram', method: 'yt-dlp' },
    { pattern: /t\.me|telegram\./i,         name: 'Telegram',  method: 'yt-dlp' },
    { pattern: /tiktok\.com/i,              name: 'TikTok',    method: 'yt-dlp' },
    { pattern: /twitter\.com|x\.com/i,      name: 'Twitter/X', method: 'yt-dlp' },
    { pattern: /facebook\.com|fb\.watch/i,  name: 'Facebook',  method: 'yt-dlp' },
    { pattern: /twitch\.tv/i,               name: 'Twitch',    method: 'yt-dlp' },
    { pattern: /reddit\.com/i,              name: 'Reddit',    method: 'yt-dlp' },
    { pattern: /vimeo\.com/i,               name: 'Vimeo',     method: 'yt-dlp' },
    { pattern: /soundcloud\.com/i,          name: 'SoundCloud', method: 'yt-dlp' },
  ];

  const match = sources.find(s => s.pattern.test(url));
  let html = '';

  if (match) {
    html += `<span class="download-source-tag">${match.name}</span>`;
    html += `<span class="download-source-tag">via ${match.method}</span>`;
    const q = state.ytdlpQuality;
    const qLabel = q === 'best' ? 'Lossless' : q === 'audio' ? 'Audio Only' : q + 'p';
    html += `<span class="download-source-tag">${qLabel}</span>`;
  } else {
    // Detect file type from extension
    try {
      const u = new URL(url);
      const ext = u.pathname.split('.').pop().toLowerCase();
      const types = {
        mp4: 'Video', mkv: 'Video', avi: 'Video', mov: 'Video', webm: 'Video',
        mp3: 'Audio', flac: 'Audio', wav: 'Audio', ogg: 'Audio', aac: 'Audio',
        jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', webp: 'Image', svg: 'Image',
        zip: 'Archive', rar: 'Archive', '7z': 'Archive', tar: 'Archive',
        pdf: 'Document', exe: 'Executable', apk: 'Android App',
      };
      const type = types[ext];
      html += `<span class="download-source-tag">Direct Link</span>`;
      if (type) html += `<span class="download-source-tag">${type}</span>`;
      if (ext) html += `<span class="download-source-tag">.${ext}</span>`;
    } catch {
      html += `<span class="download-source-tag">Direct Link</span>`;
    }
    html += `<span class="download-source-tag">${state.threads} thread${state.threads > 1 ? 's' : ''}</span>`;
  }

  return html;
}


// ---------------------------------------------------------
//  MASK EDITOR - remove.bg / Photoshop-quality BG removal
// ---------------------------------------------------------

// -- DOM refs --
const maskOverlay     = $('mask-editor-overlay');
const maskCanvas      = $('mask-canvas');
const maskCtx         = maskCanvas.getContext('2d');
const maskLoading     = $('mask-loading');
const maskLoadTxt     = $('mask-loading-text');
const maskBox         = $('mask-canvas-container');
const maskWorkspace   = $('mask-workspace');
const maskToolbar     = $('mask-tools');
const maskHint        = $('mask-canvas-hint');
const maskFooterInfo  = $('mask-footer-info');

const btnBrush        = $('mask-brush-btn');
const btnEraser       = $('mask-eraser-btn');
const btnAuto         = $('mask-auto-btn');
const btnUndo         = $('mask-undo-btn');
const btnRedo         = $('mask-redo-btn');
const btnSelectAll    = $('mask-select-all-btn');
const btnInvert       = $('mask-invert-btn');
const btnClear        = $('mask-clear-btn');
const btnApply        = $('mask-apply-btn');
const btnCancel       = $('mask-cancel-btn');
const btnClose        = $('mask-editor-close');

const btnPrevOverlay  = $('mask-preview-overlay');
const btnPrevChecker  = $('mask-preview-checker');
const btnPrevBlack    = $('mask-preview-black');
const btnPrevWhite    = $('mask-preview-white');

const sliderSize      = $('mask-brush-size');
const labelSize       = $('mask-brush-size-val');
const sliderOpacity   = $('mask-stroke-opacity');
const labelOpacity    = $('mask-stroke-opacity-val');
const sliderTolerance = $('mask-tolerance');
const labelTolerance  = $('mask-tolerance-val');
const chkAutoGrow     = $('mask-auto-grow');
const sliderFeather   = $('mask-feather');
const labelFeather    = $('mask-feather-val');
const sliderSmooth    = $('mask-smooth');
const labelSmooth     = $('mask-smooth-val');
const sliderShiftEdge = $('mask-shift-edge');
const labelShiftEdge  = $('mask-shift-edge-val');
const selectModel     = $('mask-model');

// -- Offscreen mask canvas (true size of displayed image) --
const mOff    = document.createElement('canvas');
const mOffCtx = mOff.getContext('2d');

// -- Undo/Redo --
const undoStack  = [];
const redoStack  = [];
const MAX_HISTORY = 30;

// -- Persistent settings --
const savedMask = JSON.parse(localStorage.getItem('maskSettings') || '{}');

// -- Main state object --
const R = {
  path: null, img: null,
  tool: 'brush',
  down: false, lx: 0, ly: 0,
  zoom: 1, ox: 0, oy: 0,
  panning: false, px: 0, py: 0,
  iw: 0, ih: 0,
  mx: -1, my: -1,
  size:        savedMask.size        || 25,
  alpha:       savedMask.alpha       || 0.45,
  tolerance:   savedMask.tolerance   || 32,
  autoGrow:    savedMask.autoGrow    || false,
  previewMode: savedMask.previewMode || 'overlay',
  feather:     savedMask.feather     || 0,
  smooth:      savedMask.smooth      || 0,
  shiftEdge:   savedMask.shiftEdge   || 0,
  aiModel:     savedMask.aiModel     || 'medium',
  aiMask:      null,
  dirty:       false,
  srcPixels:   null,
  hasContent:  false,
};

// -- Apply saved settings to UI --
sliderSize.value      = R.size;       labelSize.textContent      = R.size;
sliderOpacity.value   = Math.round(R.alpha * 100);
labelOpacity.textContent = Math.round(R.alpha * 100) + '%';
sliderTolerance.value = R.tolerance;  labelTolerance.textContent = R.tolerance;
chkAutoGrow.checked   = R.autoGrow;
sliderFeather.value   = R.feather;    labelFeather.textContent   = R.feather;
sliderSmooth.value    = R.smooth;     labelSmooth.textContent    = R.smooth;
sliderShiftEdge.value = R.shiftEdge;  labelShiftEdge.textContent = R.shiftEdge;
selectModel.value     = R.aiModel;
setPreviewMode(R.previewMode);

function saveMaskSettings() {
  localStorage.setItem('maskSettings', JSON.stringify({
    size: R.size, alpha: R.alpha, tolerance: R.tolerance, autoGrow: R.autoGrow,
    previewMode: R.previewMode, feather: R.feather, smooth: R.smooth,
    shiftEdge: R.shiftEdge, aiModel: R.aiModel,
  }));
}

// -- Preview mode --
function setPreviewMode(mode) {
  R.previewMode = mode;
  btnPrevOverlay.classList.toggle('active', mode === 'overlay');
  btnPrevChecker.classList.toggle('active', mode === 'checker');
  btnPrevBlack.classList.toggle('active',   mode === 'black');
  btnPrevWhite.classList.toggle('active',   mode === 'white');
  maskBox.classList.toggle('checker-bg',    mode === 'checker');
  R.dirty = true;
  saveMaskSettings();
}
btnPrevOverlay.addEventListener('click', () => setPreviewMode('overlay'));
btnPrevChecker.addEventListener('click', () => setPreviewMode('checker'));
btnPrevBlack.addEventListener('click',   () => setPreviewMode('black'));
btnPrevWhite.addEventListener('click',   () => setPreviewMode('white'));

// -- Tool selection --
function setTool(tool) {
  R.tool = tool;
  btnBrush.classList.toggle('active',  tool === 'brush');
  btnEraser.classList.toggle('active', tool === 'eraser');
  btnAuto.classList.toggle('active',   tool === 'auto');
  maskCanvas.style.cursor = tool === 'brush' || tool === 'eraser' ? 'none' : 'crosshair';
  updateFooterInfo();
}
btnBrush.addEventListener('click',  () => setTool('brush'));
btnEraser.addEventListener('click', () => setTool('eraser'));
btnAuto.addEventListener('click',   () => setTool('auto'));

// -- Open --
function openMaskEditor(filePath) {
  R.path     = filePath;
  R.down     = false;
  R.aiMask   = null;
  R.zoom     = 1;
  R.ox       = 0;
  R.oy       = 0;
  R.hasContent = false;
  undoStack.length = 0;
  redoStack.length = 0;

  maskOverlay.classList.add('open');
  maskLoading.classList.add('visible');
  maskWorkspace.style.display = 'none';
  maskHint.classList.remove('hidden');
  maskLoadTxt.textContent = 'Loading image...';

  window.electronAPI.bgLoadImage({ imagePath: filePath })
    .then(res => {
      if (res.error) { maskLoadTxt.textContent = 'Error: ' + res.error; return; }
      const mime = res.mime || 'image/png';
      const img  = new Image();
      img.onload = () => { R.img = img; boot(); };
      img.onerror = () => { maskLoadTxt.textContent = 'Cannot decode image'; };
      img.src = 'data:' + mime + ';base64,' + res.base64;
    })
    .catch(e => { maskLoadTxt.textContent = 'IPC error: ' + e.message; });
}

// -- Boot canvas --
function boot() {
  maskLoading.classList.remove('visible');
  maskWorkspace.style.display = 'flex';

  function setupCanvas() {
    const bw = maskBox.clientWidth;
    const bh = maskBox.clientHeight;

    if (bw < 50 || bh < 50) return false;

    maskCanvas.width  = bw;
    maskCanvas.height = bh;

    const pad = 20;
    const sc  = Math.min((bw - pad * 2) / R.img.naturalWidth, (bh - pad * 2) / R.img.naturalHeight);
    R.iw   = Math.round(R.img.naturalWidth  * sc);
    R.ih   = Math.round(R.img.naturalHeight * sc);
    R.zoom = 1;
    R.ox   = Math.round((bw - R.iw) / 2);
    R.oy   = Math.round((bh - R.ih) / 2);

    mOff.width  = R.iw;
    mOff.height = R.ih;
    mOffCtx.clearRect(0, 0, R.iw, R.ih);

    const srcCvs = document.createElement('canvas');
    srcCvs.width = R.iw; srcCvs.height = R.ih;
    const srcCtx = srcCvs.getContext('2d');
    srcCtx.drawImage(R.img, 0, 0, R.iw, R.ih);
    R.srcPixels = srcCtx.getImageData(0, 0, R.iw, R.ih);

    maskHint.classList.add('hidden');
    R.dirty = true;
    updateFooterInfo();
    return true;
  }

  // Try at 300ms, retry at 600ms if container not ready
  setTimeout(() => {
    if (!setupCanvas()) {
      setTimeout(() => {
        if (!setupCanvas()) {
          setFooterInfo('Error: canvas area too small');
        }
      }, 300);
    }
  }, 300);
}

// -- 60fps render loop --
(function loop() {
  if (R.dirty && R.img) draw();
  requestAnimationFrame(loop);
})();

// -- Main draw --
let _olCvs = null, _olCtx = null;
let _bgCvs = null, _bgCtx = null;
let _edCvs = null, _edCtx = null;

function draw() {
  try {
    const ctx = maskCtx;
    const cw  = maskCanvas.width;
    const ch  = maskCanvas.height;

    // Clear canvas - use a visible-enough background
    if (R.previewMode === 'white') {
      ctx.fillStyle = '#e8e8e8';
    } else if (R.previewMode === 'black') {
      ctx.fillStyle = '#111';
    } else {
      ctx.fillStyle = '#120008';
    }
    ctx.fillRect(0, 0, cw, ch);

    // Compute image position on canvas (no transforms, direct coords)
    const ix = R.ox;
    const iy = R.oy;
    const iw = Math.round(R.iw * R.zoom);
    const ih = Math.round(R.ih * R.zoom);

    if (R.previewMode === 'overlay') {
      // Draw original image directly
      ctx.drawImage(R.img, ix, iy, iw, ih);

      // Red overlay on selected pixels
      if (R.hasContent) {
        ctx.globalAlpha = R.alpha;
        ctx.drawImage(buildOverlay(), ix, iy, iw, ih);
        ctx.globalAlpha = 1;

        // Darken unselected area
        ctx.globalAlpha = 0.5;
        ctx.drawImage(buildDarkOverlay(), ix, iy, iw, ih);
        ctx.globalAlpha = 1;
      }
    } else {
      // Checker/Black/White mode
      ctx.drawImage(buildTransparencyPreview(), ix, iy, iw, ih);
    }

    // Edge outline
    if (_edCvs) ctx.drawImage(_edCvs, ix, iy, iw, ih);

    // Brush cursor
    if (R.mx >= 0 && R.tool !== 'auto') {
      const cr = (R.size / 2) * R.zoom;
      const cx = ix + R.mx * R.zoom;
      const cy = iy + R.my * R.zoom;
      ctx.strokeStyle = R.tool === 'eraser' ? 'rgba(255,100,100,0.8)' : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } catch (err) {
    console.error('[MASK] draw error:', err);
  }

  R.dirty = false;
}

// Purple overlay (selected pixels)
function buildOverlay() {
  if (!_olCvs || _olCvs.width !== R.iw || _olCvs.height !== R.ih) {
    _olCvs = document.createElement('canvas');
    _olCvs.width = R.iw; _olCvs.height = R.ih;
    _olCtx = _olCvs.getContext('2d');
  }
  _olCtx.clearRect(0, 0, R.iw, R.ih);
  _olCtx.fillStyle = 'rgba(204,0,0,1)';
  _olCtx.fillRect(0, 0, R.iw, R.ih);
  _olCtx.globalCompositeOperation = 'destination-in';
  _olCtx.drawImage(mOff, 0, 0);
  _olCtx.globalCompositeOperation = 'source-over';
  return _olCvs;
}

// Dark vignette on UNselected area
function buildDarkOverlay() {
  const c = document.createElement('canvas');
  c.width = R.iw; c.height = R.ih;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,1)';
  x.fillRect(0, 0, R.iw, R.ih);
  x.globalCompositeOperation = 'destination-out';
  x.drawImage(mOff, 0, 0);
  x.globalCompositeOperation = 'source-over';
  return c;
}

// Transparent result preview
function buildTransparencyPreview() {
  if (!_bgCvs || _bgCvs.width !== R.iw || _bgCvs.height !== R.ih) {
    _bgCvs = document.createElement('canvas');
    _bgCvs.width = R.iw; _bgCvs.height = R.ih;
    _bgCtx = _bgCvs.getContext('2d');
  }
  _bgCtx.clearRect(0, 0, R.iw, R.ih);

  if (!R.hasContent) {
    // Nothing selected yet: show full image
    _bgCtx.drawImage(R.img, 0, 0, R.iw, R.ih);
  } else {
    _bgCtx.drawImage(R.img, 0, 0, R.iw, R.ih);
    _bgCtx.globalCompositeOperation = 'destination-in';
    _bgCtx.drawImage(mOff, 0, 0);
    _bgCtx.globalCompositeOperation = 'source-over';
  }
  return _bgCvs;
}

// Edge outline
function rebuildEdge() {
  if (!R.iw || !R.ih) return;
  if (!_edCvs || _edCvs.width !== R.iw || _edCvs.height !== R.ih) {
    _edCvs = document.createElement('canvas');
    _edCvs.width = R.iw; _edCvs.height = R.ih;
    _edCtx = _edCvs.getContext('2d');
  }
  _edCtx.clearRect(0, 0, R.iw, R.ih);
  const src = mOffCtx.getImageData(0, 0, R.iw, R.ih).data;
  const dst = _edCtx.createImageData(R.iw, R.ih);
  const d   = dst.data;
  const w   = R.iw;

  for (let y = 1; y < R.ih - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i  = (y * w + x) * 4;
      const a  = src[i + 3];
      const al = src[i - 4  + 3];
      const ar = src[i + 4  + 3];
      const au = src[i - w * 4 + 3];
      const ad = src[i + w * 4 + 3];
      if (a > 128 && (al < 128 || ar < 128 || au < 128 || ad < 128)) {
        d[i] = 255; d[i+1] = 26; d[i+2] = 26; d[i+3] = 255;
      }
    }
  }
  _edCtx.putImageData(dst, 0, 0);
  R.dirty = true;
}

// -- Coord transform --
function toImg(e) {
  const rect = maskCanvas.getBoundingClientRect();
  return [
    (e.clientX - rect.left - R.ox) / R.zoom,
    (e.clientY - rect.top  - R.oy) / R.zoom,
  ];
}
function inBounds(x, y) { return x >= 0 && y >= 0 && x < R.iw && y < R.ih; }

// -- Paint: color-snapping brush --
function paint(x, y) {
  if (!R.srcPixels) return;
  const sz  = R.size / R.zoom;
  const rad = sz / 2;
  const w   = R.iw, h = R.ih;
  const src = R.srcPixels.data;
  const tol = R.tolerance;

  const cx = Math.round(x), cy = Math.round(y);
  if (!inBounds(cx, cy)) return;

  const si = (cy * w + cx) * 4;
  const sr = src[si], sg = src[si + 1], sb = src[si + 2];

  const x0 = Math.max(0, Math.floor(x - rad));
  const y0 = Math.max(0, Math.floor(y - rad));
  const x1 = Math.min(w - 1, Math.ceil(x + rad));
  const y1 = Math.min(h - 1, Math.ceil(y + rad));

  const maskData = mOffCtx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const d  = maskData.data;
  const mw = x1 - x0 + 1;
  const r2 = rad * rad;

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, dy = py - y;
      if (dx * dx + dy * dy > r2) continue;

      const pi   = (py * w + px) * 4;
      const dr   = src[pi] - sr, dg = src[pi + 1] - sg, db = src[pi + 2] - sb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (tol === 0 || dist <= tol) {
        const mi = ((py - y0) * mw + (px - x0)) * 4;
        if (R.tool === 'brush') {
          d[mi] = d[mi+1] = d[mi+2] = 255; d[mi+3] = 255;
        } else {
          d[mi] = d[mi+1] = d[mi+2] = d[mi+3] = 0;
        }
      }
    }
  }
  mOffCtx.putImageData(maskData, x0, y0);
}

function line(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / Math.max(1, R.size / R.zoom / 3)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    paint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}

// -- BFS region grow (Smart Expand) --
function regionGrow(aiAlpha) {
  if (!R.srcPixels) return;
  const w   = R.iw, h = R.ih;
  const src = R.srcPixels.data;
  const tol = R.tolerance;
  const maskData = mOffCtx.getImageData(0, 0, w, h);
  const d   = maskData.data;

  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  const visited = new Uint8Array(w * h);
  const seeds   = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const i   = idx * 4;
      if (d[i + 3] > 128) {
        visited[idx] = 1;
        sumR += src[i]; sumG += src[i + 1]; sumB += src[i + 2];
        count++;
        const l = x > 0     && d[((y) * w + (x - 1)) * 4 + 3] < 128;
        const r = x < w - 1 && d[((y) * w + (x + 1)) * 4 + 3] < 128;
        const u = y > 0     && d[((y - 1) * w + x) * 4 + 3] < 128;
        const dn= y < h - 1 && d[((y + 1) * w + x) * 4 + 3] < 128;
        if (l || r || u || dn) seeds.push(idx);
      }
    }
  }
  if (count === 0) return;

  const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count;
  const queue = seeds.slice();
  let qi = 0;

  while (qi < queue.length) {
    const idx = queue[qi++];
    const nx  = idx % w, ny = (idx - nx) / w;
    const neighbors = [
      nx > 0     ? idx - 1 : -1,
      nx < w - 1 ? idx + 1 : -1,
      ny > 0     ? idx - w : -1,
      ny < h - 1 ? idx + w : -1,
    ];
    for (const ni of neighbors) {
      if (ni < 0 || visited[ni]) continue;
      if (aiAlpha && aiAlpha[ni * 4 + 3] < 30) continue;
      visited[ni] = 1;
      const pi = ni * 4;
      const dr = src[pi] - avgR, dg = src[pi + 1] - avgG, db = src[pi + 2] - avgB;
      if (Math.sqrt(dr*dr + dg*dg + db*db) <= tol) {
        d[pi] = d[pi+1] = d[pi+2] = 255; d[pi+3] = 255;
        queue.push(ni);
      }
    }
  }
  mOffCtx.putImageData(maskData, 0, 0);
}

// -- Object Select (click-to-select) --
let clickSelectRunning = false;

async function clickSelectObject(imgX, imgY) {
  if (clickSelectRunning || !R.path) return;
  clickSelectRunning = true;

  setFooterInfo('Detecting object at click...');
  maskLoadTxt.textContent = 'Analyzing region...';
  maskLoading.classList.add('visible');

  try {
    if (!R.aiMask) {
      const res = await window.electronAPI.bgDetectSubject({ imagePath: R.path, model: R.aiModel });
      if (res.error) throw new Error(res.error);
      const aiImg = new Image();
      await new Promise((resolve, reject) => {
        aiImg.onload = resolve; aiImg.onerror = reject;
        aiImg.src = 'data:image/png;base64,' + res.maskBase64;
      });
      const tmp = document.createElement('canvas');
      tmp.width = R.iw; tmp.height = R.ih;
      const tCtx = tmp.getContext('2d');
      tCtx.drawImage(aiImg, 0, 0, R.iw, R.ih);
      R.aiMask = tCtx.getImageData(0, 0, R.iw, R.ih).data;
    }

    pushUndo();

    const cx = Math.round(Math.max(0, Math.min(R.iw - 1, imgX)));
    const cy = Math.round(Math.max(0, Math.min(R.ih - 1, imgY)));
    const aiAlphaAtClick = R.aiMask[(cy * R.iw + cx) * 4 + 3];

    if (aiAlphaAtClick > 30) {
      const maskData = mOffCtx.getImageData(0, 0, R.iw, R.ih);
      const d = maskData.data;
      for (let i = 0; i < R.aiMask.length; i += 4) {
        if (R.aiMask[i + 3] > 30) {
          d[i] = d[i+1] = d[i+2] = 255; d[i+3] = 255;
        }
      }
      mOffCtx.putImageData(maskData, 0, 0);
    } else {
      const maskData = mOffCtx.getImageData(0, 0, R.iw, R.ih);
      const d = maskData.data;
      const src = R.srcPixels.data;
      const w = R.iw, h = R.ih;
      const si = (cy * w + cx) * 4;
      const seedR = src[si], seedG = src[si+1], seedB = src[si+2];
      const tol = Math.max(R.tolerance, 40);
      const visited = new Uint8Array(w * h);
      const queue = [cy * w + cx];
      visited[cy * w + cx] = 1;
      let qi = 0;
      while (qi < queue.length) {
        const idx = queue[qi++];
        const nx = idx % w, ny = (idx - nx) / w;
        d[idx*4] = d[idx*4+1] = d[idx*4+2] = 255; d[idx*4+3] = 255;
        const neighbors = [nx>0?idx-1:-1, nx<w-1?idx+1:-1, ny>0?idx-w:-1, ny<h-1?idx+w:-1];
        for (const ni of neighbors) {
          if (ni < 0 || visited[ni]) continue;
          visited[ni] = 1;
          const pi = ni * 4;
          const dr = src[pi]-seedR, dg = src[pi+1]-seedG, db = src[pi+2]-seedB;
          if (Math.sqrt(dr*dr+dg*dg+db*db) <= tol) queue.push(ni);
        }
      }
      mOffCtx.putImageData(maskData, 0, 0);
    }

    R.hasContent = true;
    maskHint.classList.add('hidden');
    rebuildEdge();
    R.dirty = true;
    setFooterInfo('Object selected. Paint to refine.');
  } catch (err) {
    setFooterInfo('Object select failed: ' + err.message);
  } finally {
    maskLoading.classList.remove('visible');
    clickSelectRunning = false;
  }
}

// -- AI Auto-detect (full image) --
let autoDetectRunning = false;

async function runAutoDetect() {
  if (autoDetectRunning || !R.path) return;
  autoDetectRunning = true;

  maskLoadTxt.textContent = 'Running AI subject detection...';
  maskLoading.classList.add('visible');
  setFooterInfo('AI analyzing image...');

  try {
    const res = await window.electronAPI.bgDetectSubject({ imagePath: R.path, model: R.aiModel });
    if (res.error) throw new Error(res.error);

    const aiImg = new Image();
    await new Promise((resolve, reject) => {
      aiImg.onload = resolve; aiImg.onerror = reject;
      aiImg.src = 'data:image/png;base64,' + res.maskBase64;
    });

    const tmp = document.createElement('canvas');
    tmp.width = R.iw; tmp.height = R.ih;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(aiImg, 0, 0, R.iw, R.ih);
    const aiData = tCtx.getImageData(0, 0, R.iw, R.ih).data;
    R.aiMask = aiData;

    pushUndo();
    const maskData = mOffCtx.getImageData(0, 0, R.iw, R.ih);
    const d = maskData.data;
    for (let i = 0; i < aiData.length; i += 4) {
      if (aiData[i + 3] > 30) {
        d[i] = d[i+1] = d[i+2] = 255; d[i+3] = 255;
      }
    }
    mOffCtx.putImageData(maskData, 0, 0);

    R.hasContent = true;
    maskHint.classList.add('hidden');
    rebuildEdge();
    R.dirty = true;
    setFooterInfo('Subject detected. Paint to refine edges.');
  } catch (err) {
    setFooterInfo('AI detection failed: ' + err.message);
  } finally {
    maskLoading.classList.remove('visible');
    autoDetectRunning = false;
  }
}

// -- Header button actions --
btnSelectAll.addEventListener('click', runAutoDetect);

btnInvert.addEventListener('click', () => {
  if (!R.iw) return;
  pushUndo();
  const maskData = mOffCtx.getImageData(0, 0, R.iw, R.ih);
  const d = maskData.data;
  for (let i = 0; i < d.length; i += 4) {
    const wasSelected = d[i+3] > 128;
    d[i] = d[i+1] = d[i+2] = 255;
    d[i+3] = wasSelected ? 0 : 255;
  }
  mOffCtx.putImageData(maskData, 0, 0);
  rebuildEdge();
  R.dirty = true;
  setFooterInfo('Selection inverted.');
});

btnClear.addEventListener('click', () => {
  if (!R.iw) return;
  pushUndo();
  mOffCtx.clearRect(0, 0, R.iw, R.ih);
  _edCvs = null;
  R.hasContent = false;
  R.dirty = true;
  maskHint.classList.remove('hidden');
  setFooterInfo('Selection cleared.');
});

// -- Mouse events --
maskCanvas.addEventListener('mousedown', e => {
  if (!R.img) return;

  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    R.panning = true;
    R.px = e.clientX - R.ox;
    R.py = e.clientY - R.oy;
    maskCanvas.style.cursor = 'grab';
    return;
  }

  const [x, y] = toImg(e);

  if (R.tool === 'auto') {
    clickSelectObject(x, y);
    return;
  }

  pushUndo();
  R.down = true;
  R.lx = x; R.ly = y;
  paint(x, y);
  R.hasContent = true;
  maskHint.classList.add('hidden');
  R.dirty = true;
});

maskCanvas.addEventListener('mousemove', e => {
  const [imgX, imgY] = toImg(e);
  R.mx = imgX; R.my = imgY;

  if (R.panning) {
    R.ox = e.clientX - R.px;
    R.oy = e.clientY - R.py;
    R.dirty = true;
    return;
  }
  if (R.down) {
    line(R.lx, R.ly, imgX, imgY);
    R.lx = imgX; R.ly = imgY;
  }
  R.dirty = true;
});

maskCanvas.addEventListener('mouseup', async () => {
  if (R.down) {
    if (R.autoGrow && R.tool === 'brush') {
      if (!R.aiMask) {
        maskLoadTxt.textContent = 'Initializing smart expand...';
        maskLoading.classList.add('visible');
        try {
          const res = await window.electronAPI.bgDetectSubject({ imagePath: R.path, model: R.aiModel });
          if (!res.error) {
            const aiImg = new Image();
            await new Promise((resolve, reject) => { aiImg.onload = resolve; aiImg.onerror = reject; aiImg.src = 'data:image/png;base64,' + res.maskBase64; });
            const tmp = document.createElement('canvas');
            tmp.width = R.iw; tmp.height = R.ih;
            const tCtx = tmp.getContext('2d');
            tCtx.drawImage(aiImg, 0, 0, R.iw, R.ih);
            R.aiMask = tCtx.getImageData(0, 0, R.iw, R.ih).data;
          }
        } catch (_) {}
        maskLoading.classList.remove('visible');
      }
      regionGrow(R.aiMask);
    }
    rebuildEdge();
  }
  R.down = false; R.panning = false;
  maskCanvas.style.cursor = R.tool === 'auto' ? 'crosshair' : 'none';
});

maskCanvas.addEventListener('mouseleave', () => {
  if (R.down) rebuildEdge();
  R.down = false; R.panning = false;
  R.mx = -1; R.my = -1;
  R.dirty = true;
  maskCanvas.style.cursor = 'crosshair';
});

maskCanvas.addEventListener('mouseenter', () => {
  maskCanvas.style.cursor = R.tool === 'auto' ? 'crosshair' : 'none';
});

// -- Scroll zoom --
maskCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = maskCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const z0 = R.zoom;
  R.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
  R.zoom  = Math.max(0.1, Math.min(16, R.zoom));
  R.ox    = mx - (mx - R.ox) * (R.zoom / z0);
  R.oy    = my - (my - R.oy) * (R.zoom / z0);
  R.dirty = true;
}, { passive: false });

// -- Sliders --
sliderSize.addEventListener('input', () => {
  R.size = +sliderSize.value; labelSize.textContent = R.size; saveMaskSettings();
});
sliderOpacity.addEventListener('input', () => {
  R.alpha = +sliderOpacity.value / 100;
  labelOpacity.textContent = sliderOpacity.value + '%';
  R.dirty = true; saveMaskSettings();
});
sliderTolerance.addEventListener('input', () => {
  R.tolerance = +sliderTolerance.value; labelTolerance.textContent = R.tolerance; saveMaskSettings();
});
chkAutoGrow.addEventListener('change', () => { R.autoGrow = chkAutoGrow.checked; saveMaskSettings(); });
sliderFeather.addEventListener('input', () => { R.feather = +sliderFeather.value; labelFeather.textContent = R.feather; saveMaskSettings(); });
sliderSmooth.addEventListener('input', () => { R.smooth = +sliderSmooth.value; labelSmooth.textContent = R.smooth; saveMaskSettings(); });
sliderShiftEdge.addEventListener('input', () => { R.shiftEdge = +sliderShiftEdge.value; labelShiftEdge.textContent = R.shiftEdge; saveMaskSettings(); });
selectModel.addEventListener('change', () => { R.aiModel = selectModel.value; R.aiMask = null; saveMaskSettings(); });

// -- Keyboard shortcuts --
document.addEventListener('keydown', e => {
  if (!maskOverlay.classList.contains('open')) return;
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); doUndo(); }
  if (e.ctrlKey && e.key === 'y') { e.preventDefault(); doRedo(); }
  if (!e.ctrlKey) {
    if (e.key === 'b' || e.key === 'B') setTool('brush');
    if (e.key === 'e' || e.key === 'E') setTool('eraser');
    if (e.key === 'a' || e.key === 'A') setTool('auto');
    if (e.key === 'Escape') closeMaskEditor();
    if (e.key === '[') { R.size = Math.max(2, R.size - 5); sliderSize.value = R.size; labelSize.textContent = R.size; }
    if (e.key === ']') { R.size = Math.min(120, R.size + 5); sliderSize.value = R.size; labelSize.textContent = R.size; }
  }
});

// -- Undo / Redo --
function pushUndo() {
  if (!R.iw || !R.ih) return;
  undoStack.push(mOffCtx.getImageData(0, 0, R.iw, R.ih));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}
function doUndo() {
  if (!undoStack.length) return;
  redoStack.push(mOffCtx.getImageData(0, 0, R.iw, R.ih));
  mOffCtx.putImageData(undoStack.pop(), 0, 0);
  rebuildEdge(); R.dirty = true;
}
function doRedo() {
  if (!redoStack.length) return;
  undoStack.push(mOffCtx.getImageData(0, 0, R.iw, R.ih));
  mOffCtx.putImageData(redoStack.pop(), 0, 0);
  rebuildEdge(); R.dirty = true;
}
btnUndo.addEventListener('click', doUndo);
btnRedo.addEventListener('click', doRedo);

// -- Footer info helper --
function setFooterInfo(msg) {
  if (maskFooterInfo) maskFooterInfo.textContent = msg;
}
function updateFooterInfo() {
  const hints = { brush: 'Paint to keep areas  |  [ ] resize brush  |  Alt+drag to pan', eraser: 'Erase to remove areas from selection', auto: 'Click any object to select it' };
  setFooterInfo(hints[R.tool] || '');
}

// -- Close --
function closeMaskEditor() {
  maskOverlay.classList.remove('open');
  maskLoading.classList.remove('visible');
  R.img   = null;
  R.down  = false;
  R.aiMask = null;
}
btnClose.addEventListener('click', closeMaskEditor);
btnCancel.addEventListener('click', closeMaskEditor);

// -- Apply & Export --
btnApply.addEventListener('click', async () => {
  if (!R.path) return;

  maskWorkspace.style.display = 'none';
  maskLoading.classList.add('visible');
  maskLoadTxt.textContent = 'Removing background...';

  const maskDataUrl = mOff.toDataURL('image/png');

  try {
    const hasRefine = R.feather > 0 || R.smooth > 0 || R.shiftEdge !== 0;
    let res;

    if (hasRefine) {
      res = await window.electronAPI.bgApplyWithRefine({
        imagePath: R.path, maskDataUrl,
        feather: R.feather, smooth: R.smooth, shiftEdge: R.shiftEdge,
      });
    } else {
      res = await window.electronAPI.bgApply({ imagePath: R.path, maskDataUrl });
    }

    if (res.error) {
      maskLoadTxt.textContent = 'Error: ' + res.error;
      setTimeout(() => { maskWorkspace.style.display = 'flex'; maskLoading.classList.remove('visible'); }, 3000);
      return;
    }

    closeMaskEditor();
    flashSuccess();
    addHistory({
      status:     'success',
      inputName:  state.currentFile?.name || 'image',
      outputName: res.filePath.split(/[\\/]/).pop(),
      outputPath: res.filePath,
      sizeBefore: state.currentFile?.size || 0,
      sizeAfter:  res.fileSize,
    });
  } catch (err) {
    maskLoadTxt.textContent = 'Failed: ' + err.message;
    setTimeout(() => { maskWorkspace.style.display = 'flex'; maskLoading.classList.remove('visible'); }, 3000);
  }
});

// --------------------------- Auto-Update -----------------------------------------------
(function initAutoUpdate() {
  const popup = $('update-popup');
  const versionEl = $('update-version');
  const installBtn = $('update-install-btn');
  const skipBtn = $('update-skip-btn');
  const restartBtn = $('update-restart-btn');
  const actions = $('update-actions');
  const restartActions = $('update-restart-actions');
  const progressWrap = $('update-progress-wrap');
  const progressFill = $('update-progress-fill');
  const progressText = $('update-progress-text');
  const checkBtn = $('btn-check-updates');
  const checkBtnText = $('btn-check-updates-text');
  const toast = $('update-toast');

  if (!popup || !window.electronAPI?.onUpdateAvailable) return;

  let currentDownloadUrl = '';
  let currentInstallerPath = '';

  window.electronAPI.onUpdateAvailable((info) => {
    versionEl.textContent = `v${info.version}`;
    currentDownloadUrl = info.downloadUrl;
    popup.style.display = 'flex';
    actions.style.display = 'flex';
    restartActions.style.display = 'none';
    progressWrap.style.display = 'none';
    popup.classList.remove('slide-out');
    popup.classList.add('slide-in');
    if (checkBtnText) checkBtnText.textContent = 'Check for Updates';
    if (checkBtn) checkBtn.disabled = false;
  });

  window.electronAPI.onUpdateNotAvailable(() => {
    if (checkBtnText) checkBtnText.textContent = 'Check for Updates';
    if (checkBtn) checkBtn.disabled = false;
    if (toast) {
      toast.style.display = 'flex';
      toast.classList.remove('toast-out');
      toast.classList.add('toast-in');
      setTimeout(() => {
        toast.classList.remove('toast-in');
        toast.classList.add('toast-out');
        setTimeout(() => { toast.style.display = 'none'; }, 400);
      }, 3000);
    }
  });

  if (checkBtn) {
    checkBtn.addEventListener('click', () => {
      checkBtnText.textContent = 'Checking…';
      checkBtn.disabled = true;
      window.electronAPI.checkForUpdates();
    });
  }

  installBtn.addEventListener('click', () => {
    actions.style.display = 'none';
    progressWrap.style.display = 'flex';
    progressText.textContent = 'Starting…';
    window.electronAPI.downloadUpdate(currentDownloadUrl);
  });

  skipBtn.addEventListener('click', () => {
    popup.classList.remove('slide-in');
    popup.classList.add('slide-out');
    setTimeout(() => { popup.style.display = 'none'; popup.classList.remove('slide-out'); }, 400);
  });

  window.electronAPI.onUpdateProgress((pct) => {
    progressFill.style.width = pct + '%';
    progressText.textContent = pct + '%';
  });

  window.electronAPI.onUpdateReady((installerPath) => {
    currentInstallerPath = installerPath;
    progressWrap.style.display = 'none';
    restartActions.style.display = 'flex';
  });

  if (window.electronAPI.onUpdateError) {
    window.electronAPI.onUpdateError(() => {
      progressText.textContent = 'Failed';
      setTimeout(() => {
        popup.classList.remove('slide-in');
        popup.classList.add('slide-out');
        setTimeout(() => { popup.style.display = 'none'; }, 400);
      }, 2000);
    });
  }

  restartBtn.addEventListener('click', () => {
    window.electronAPI.installUpdate(currentInstallerPath);
  });
})();
