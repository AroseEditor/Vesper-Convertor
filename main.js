'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const https  = require('https');

// ─── Module state ─────────────────────────────────────────────────────────────
let mainWindow  = null;

// ─── Dynamic require helpers ──────────────────────────────────────────────────
// Modules are bundled in node_modules (inside asar or unpacked)
function r(name) {
  return require(name);
}

// For ESM-only packages (file-type v19)
async function rESM(name) {
  return await import(name);
}

// Resolve ffmpeg binary — swap asar path for asar.unpacked so the OS can spawn it
function getFFmpegPath() {
  let p = r('ffmpeg-static');
  if (typeof p === 'string' && p.includes('app.asar')) {
    p = p.replace('app.asar', 'app.asar.unpacked');
  }
  return p;
}

// ─── Main window ──────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000, height: 680,
    minWidth: 800, minHeight: 560,
    frame: false, transparent: false,
    backgroundColor: '#050005',
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}
// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();

  // Handle file passed via Windows context menu (e.g. "Convert with Contrary Convertor")
  const fileArg = process.argv.slice(app.isPackaged ? 1 : 2).find(a => {
    try { return fs.existsSync(a) && fs.statSync(a).isFile(); } catch { return false; }
  });
  if (fileArg) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('open-file', path.resolve(fileArg));
    });
  }

  // Check for updates 5s after launch (non-blocking)
  setTimeout(() => checkForUpdates(), 5000);
});

app.on('window-all-closed', () => {
  app.quit();
});
app.on('activate', () => { if (!mainWindow) createMainWindow(); });

// ─── Custom Auto-Update via GitHub Releases API ──────────────────────────────
ipcMain.handle('app:version', () => app.getVersion());
const REPO_OWNER = 'AroseEditor';
const REPO_NAME  = 'Contrary-Convertor';
const CURRENT_VERSION = app.getVersion(); // reads from package.json

function compareVersions(a, b) {
  // Compare semver: returns 1 if a > b, -1 if a < b, 0 if equal
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0, vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function githubGet(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: urlPath,
      headers: { 'User-Agent': 'Contrary-Convertor-Updater' },
    };
    https.get(options, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = new URL(res.headers.location);
        const redirOptions = {
          hostname: redirectUrl.hostname,
          path: redirectUrl.pathname + redirectUrl.search,
          headers: { 'User-Agent': 'Contrary-Convertor-Updater' },
        };
        https.get(redirOptions, (res2) => {
          let data = '';
          res2.on('data', c => data += c);
          res2.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
          });
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

function getPlatformAssetPattern() {
  switch (process.platform) {
    case 'win32':  return /\.exe$/i;
    case 'darwin': return /\.dmg$/i;
    case 'linux':  return /\.AppImage$/i;
    default:       return null;
  }
}

async function checkForUpdates() {
  try {
    const release = await githubGet(`/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    if (!release || !release.tag_name) {
      if (mainWindow) mainWindow.webContents.send('update:not-available');
      return;
    }

    const latestVersion = release.tag_name; // e.g. "v1.1.0"
    if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
      // Find the right asset for this platform
      const pattern = getPlatformAssetPattern();
      const asset = pattern && release.assets
        ? release.assets.find(a => pattern.test(a.name))
        : null;

      if (mainWindow) {
        mainWindow.webContents.send('update:available', {
          version: latestVersion.replace(/^v/, ''),
          downloadUrl: asset ? asset.browser_download_url : release.html_url,
          hasDirectDownload: !!asset,
        });
      }
    } else {
      if (mainWindow) mainWindow.webContents.send('update:not-available');
    }
  } catch {
    if (mainWindow) mainWindow.webContents.send('update:not-available');
  }
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const doDownload = (downloadUrl) => {
      https.get(downloadUrl, { headers: { 'User-Agent': 'Contrary-Convertor-Updater' } }, (res) => {
        // Follow redirects (GitHub uses them for asset downloads)
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doDownload(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (totalBytes > 0 && onProgress) {
            onProgress(Math.round((downloaded / totalBytes) * 100));
          }
        });

        res.on('end', () => {
          file.end();
          file.on('finish', () => resolve(destPath));
        });

        res.on('error', (err) => {
          file.close();
          fs.unlinkSync(destPath);
          reject(err);
        });
      }).on('error', reject);
    };
    doDownload(url);
  });
}

ipcMain.on('update:check', () => {
  checkForUpdates();
});

ipcMain.on('update:download', async (_event, downloadUrl) => {
  try {
    const ext = process.platform === 'win32' ? '.exe' : (process.platform === 'darwin' ? '.dmg' : '.AppImage');
    const tmpPath = path.join(app.getPath('temp'), `ContraryConvertor_Update${ext}`);

    await downloadFile(downloadUrl, tmpPath, (pct) => {
      if (mainWindow) mainWindow.webContents.send('update:progress', pct);
    });

    if (mainWindow) mainWindow.webContents.send('update:ready', tmpPath);
  } catch (err) {
    if (mainWindow) mainWindow.webContents.send('update:error', err.message);
  }
});

ipcMain.on('update:install', (_event, installerPath) => {
  if (process.platform === 'win32') {
    // Run the NSIS installer and quit
    spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    // Open the DMG
    spawn('open', [installerPath], { detached: true, stdio: 'ignore' }).unref();
  } else {
    // Make AppImage executable and run it
    fs.chmodSync(installerPath, 0o755);
    spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
  }
  app.quit();
});

// ─── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('win:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow && mainWindow.close());

// ─── Settings persistence ─────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveSettings(data) {
  try {
    const current = loadSettings();
    const merged = { ...current, ...data };
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch {}
}

ipcMain.handle('settings:load', () => loadSettings());
ipcMain.on('settings:save', (_e, data) => saveSettings(data));

// ─── File dialog ──────────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Multi-file dialog for bulk operations
ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths;
});

// Save clipboard image to temp file and return the path
ipcMain.handle('clipboard:saveFile', async (_event, { base64, mimeType }) => {
  try {
    const os = require('os');
    const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' };
    const ext = extMap[mimeType] || 'png';
    const tmpPath = path.join(os.tmpdir(), `clipboard_paste_${Date.now()}.${ext}`);
    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));
    return tmpPath;
  } catch (err) {
    return null;
  }
});

// Bulk convert: process multiple files with same format
ipcMain.handle('file:bulkConvert', async (event, { filePaths, outputFormat, options }) => {
  const results = [];
  const emit = (pct, msg) => event.sender.send('convert:progress', { percent: pct, message: msg });
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const fileName = path.basename(filePath);
    emit(Math.round((i / filePaths.length) * 100), `Processing ${i + 1}/${filePaths.length}: ${fileName}`);
    try {
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const dir = path.dirname(filePath);
      const base = path.basename(filePath, path.extname(filePath));
      const isFix = outputFormat === 'fix';
      const isExtract = outputFormat.startsWith('extract');
      const isWatermark = outputFormat === 'watermark-pdf';
      const isDenoise = outputFormat === 'denoise';
      let outputPath;
      if (isFix) {
        outputPath = path.join(dir, `${base}_fixed.mp4`);
      } else if (isWatermark) {
        outputPath = path.join(dir, `${base}_watermarked.pdf`);
      } else if (isDenoise) {
        outputPath = path.join(dir, `${base}_denoised.${ext}`);
      } else if (isExtract) {
        outputPath = path.join(dir, `${base}_${outputFormat.replace('-','_')}`);
        fs.mkdirSync(outputPath, { recursive: true });
      } else {
        outputPath = path.join(dir, `${base}_converted.${outputFormat}`);
      }
      const subEmit = (pct, msg) => {
        const overallPct = Math.round((i / filePaths.length) * 100 + (pct / filePaths.length));
        emit(overallPct, `[${i+1}/${filePaths.length}] ${msg}`);
      };
      if (isFix) {
        await fixForPlatform(filePath, outputPath, options, subEmit);
      } else if (isWatermark) {
        await watermarkPdf(filePath, outputPath, options, subEmit);
      } else if (isDenoise) {
        await runDenoise(filePath, outputPath, subEmit, event.sender);
      } else if (outputFormat === 'extract-text') {
        await extractText(filePath, outputPath, ext, subEmit, options);
      } else if (outputFormat === 'extract-images') {
        if (ext === 'pdf') await extractPdfImages(filePath, outputPath, subEmit);
        else if (['docx','doc','odt'].includes(ext)) await extractDocxImages(filePath, outputPath, ext, subEmit);
        else throw new Error('Image extraction not supported for this file type.');
      } else {
        const category = detectCategory(ext);
        switch (category) {
          case 'image': await convertImage(filePath, outputPath, outputFormat, options, subEmit); break;
          case 'video': await convertVideo(filePath, outputPath, outputFormat, options, subEmit); break;
          case 'audio': await convertAudio(filePath, outputPath, outputFormat, options, subEmit); break;
          case 'document': await convertDocument(filePath, outputPath, outputFormat, options, subEmit); break;
          case 'data': case 'config': case 'spreadsheet': await convertData(filePath, outputPath, outputFormat, options, subEmit); break;
          case 'archive': await convertArchive(filePath, outputPath, outputFormat, options, subEmit); break;
          case 'web': case 'text': await convertWeb(filePath, outputPath, outputFormat, options, subEmit); break;
          case 'code': await convertCode(filePath, outputPath, outputFormat, options, subEmit); break;
          case 'font': await convertFont(filePath, outputPath, outputFormat, options, subEmit); break;
          case '3d': await convert3D(filePath, outputPath, outputFormat, ext, subEmit); break;
          default: throw new Error(`Unsupported: ${category}`);
        }
      }
      let outputSize = 0;
      try { const st = fs.statSync(outputPath); outputSize = st.isDirectory() ? getDirSize(outputPath) : st.size; } catch {}
      results.push({ success: true, inputName: fileName, outputPath, outputSize });
    } catch (err) {
      results.push({ success: false, inputName: fileName, error: err.message });
    }
  }
  emit(100, `Done! ${results.filter(r => r.success).length}/${filePaths.length} converted`);
  return results;
});

// ─── Shell actions ────────────────────────────────────────────────────────────
ipcMain.handle('shell:open',       async (_e, p) => await shell.openPath(p));
ipcMain.handle('shell:showFolder', async (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('shell:openExternal', async (_e, url) => await shell.openExternal(url));

// Folder picker
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select download folder',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Download system
let activeDownload = null;

ipcMain.on('download:cancel', () => {
  if (activeDownload) {
    activeDownload.cancelled = true;
    if (activeDownload.proc) { try { activeDownload.proc.kill('SIGTERM'); } catch {} }
    if (activeDownload.requests) { activeDownload.requests.forEach(req => { try { req.destroy(); } catch {} }); }
  }
});

ipcMain.handle('download:start', async (event, { url, savePath, threads, quality }) => {
  const emit = (data) => event.sender.send('download:progress', data);
  activeDownload = { cancelled: false, proc: null, requests: [] };
  try {
    const isSpotify = /open\.spotify\.com/i.test(url);
    const isYtdlpSource = /(?:youtube\.com|youtu\.be|instagram\.com|tiktok\.com|twitter\.com|x\.com|facebook\.com|t\.me|telegram\.|twitch\.tv|reddit\.com|vimeo\.com|soundcloud\.com)/i.test(url);
    if (isSpotify) return await downloadWithSpotdl(url, savePath, emit, activeDownload);
    else if (isYtdlpSource) return await downloadWithYtdlp(url, savePath, emit, activeDownload, quality || '1080');
    else return await downloadDirect(url, savePath, threads || 4, emit, activeDownload);
  } catch (err) { return { error: err.message }; }
});

async function downloadWithYtdlp(url, savePath, emit, dl, quality) {
  const ytdlpPath = await ensureYtdlp(emit);
  const ffmpegBin  = getFFmpegPath();
  emit({ percent: 5, message: 'Starting yt-dlp…', speed: 0, downloaded: 0 });
  return new Promise((resolve, reject) => {
    const outputTemplate = path.join(savePath, '%(title)s.%(ext)s');
    const isAudio = quality === 'audio';

    let args;
    if (isAudio) {
      // For audio: extract audio and convert to mp3 — do NOT use --merge-output-format
      // bestaudio/best gives a single stream, then postprocess to mp3 via ffmpeg
      args = [
        '-f', 'bestaudio/best',
        '-o', outputTemplate,
        '--no-playlist',
        '--newline', '--progress',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',          // VBR best quality
        '--ffmpeg-location', path.dirname(ffmpegBin),
        url,
      ];
    } else {
      let fmtArg;
      switch (quality) {
        case 'best': fmtArg = 'bestvideo+bestaudio/best'; break;
        case '1080': fmtArg = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'; break;
        case '720':  fmtArg = 'bestvideo[height<=720]+bestaudio/best[height<=720]'; break;
        case '480':  fmtArg = 'bestvideo[height<=480]+bestaudio/best[height<=480]'; break;
        case '360':  fmtArg = 'bestvideo[height<=360]+bestaudio/best[height<=360]'; break;
        default:     fmtArg = 'bestvideo[height<=1080]+bestaudio/best'; break;
      }
      args = [
        '-f', fmtArg,
        '-o', outputTemplate,
        '--no-playlist',
        '--newline', '--progress',
        '--merge-output-format', 'mp4',
        '--ffmpeg-location', path.dirname(ffmpegBin),
        url,
      ];
    }

    const proc = spawn(ytdlpPath, args, { cwd: savePath, shell: false });
    dl.proc = proc;
    let lastFile = '', stderr = '';
    proc.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        const m = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\s*\w+)\s+at\s+([\d.]+\s*\w+\/s)/);
        if (m) emit({ percent: parseFloat(m[1]), message: `Downloading: ${Math.round(parseFloat(m[1]))}%`, speed: parseSpeedToBytes(m[3]) });
        const d = line.match(/\[(?:download|Merger|ExtractAudio)\].*?Destination:\s*(.+)/);
        if (d) lastFile = d[1].trim();
        const mg = line.match(/\[Merger\]\s+Merging formats into "(.+?)"/);
        if (mg) lastFile = mg[1].trim();
      }
    });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (dl.cancelled) { resolve({ error: 'Download cancelled' }); return; }
      if (code !== 0) { reject(new Error(stderr.slice(0, 300) || 'yt-dlp failed')); return; }
      if (!lastFile) {
        // Fall back: pick newest file in savePath
        const files = fs.readdirSync(savePath)
          .map(f => ({ name: f, time: fs.statSync(path.join(savePath, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);
        if (files.length) lastFile = path.join(savePath, files[0].name);
      }
      if (lastFile && fs.existsSync(lastFile)) resolve({ filePath: lastFile, fileSize: fs.statSync(lastFile).size });
      else resolve({ filePath: savePath, fileSize: 0 });
    });
    proc.on('error', reject);
  });
}

// ── Spotify download via spotdl ───────────────────────────────────────────────
async function ensureSpotdl(emit) {
  const { execSync } = require('child_process');

  // Check system spotdl first
  for (const cmd of ['spotdl', 'spotdl.exe']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'pipe' });
      return cmd;
    } catch {}
  }

  // Fallback: ensure Python then pip install spotdl
  emit({ percent: 2, message: 'Installing spotdl (first time)…', speed: 0 });
  const pythonPath = await ensurePython((msg) => emit({ percent: 3, message: msg, speed: 0 }));
  emit({ percent: 10, message: 'Installing spotdl via pip…', speed: 0 });
  try {
    await execPromise(`"${pythonPath}" -m pip install --no-cache-dir spotdl --no-warn-script-location`);
  } catch (err) {
    throw new Error(`Failed to install spotdl: ${err.message}`);
  }

  // After pip install, spotdl is available as a module
  return `"${pythonPath}" -m spotdl`;
}

async function downloadWithSpotdl(url, savePath, emit, dl) {
  emit({ percent: 2, message: 'Checking spotdl…', speed: 0 });
  const spotdlCmd = await ensureSpotdl(emit);
  const ffmpegBin = getFFmpegPath();

  emit({ percent: 15, message: 'Starting Spotify download…', speed: 0 });
  return new Promise((resolve, reject) => {
    // spotdl downloads to cwd by default; output mp3 quality
    const isModule = spotdlCmd.includes('-m spotdl');
    let args, proc;

    const spotArgs = [
      'download', url,
      '--output', path.join(savePath, '{title}.{output-ext}'),
      '--format', 'mp3',
      '--bitrate', '320k',
      '--ffmpeg', ffmpegBin,
    ];

    if (isModule) {
      // "python -m spotdl" — need to parse the command string
      const parts = spotdlCmd.replace(/"/g, '').split(' ');
      const pyExe = parts[0];
      args = ['-m', 'spotdl', ...spotArgs];
      proc = spawn(pyExe, args, { cwd: savePath, shell: false });
    } else {
      proc = spawn(spotdlCmd, spotArgs, { cwd: savePath, shell: false });
    }

    dl.proc = proc;
    let lastFile = '', stderr = '', stdout = '';

    const onLine = (line) => {
      // spotdl outputs progress like: "Downloaded "Track Name""
      if (line.includes('Downloaded')) {
        emit({ percent: 90, message: line.trim().slice(0, 80), speed: 0 });
      } else if (line.includes('Downloading')) {
        emit({ percent: 50, message: line.trim().slice(0, 80), speed: 0 });
      } else if (line.includes('Converting')) {
        emit({ percent: 75, message: 'Converting to MP3…', speed: 0 });
      }
    };

    proc.stdout.on('data', (chunk) => {
      const txt = chunk.toString();
      stdout += txt;
      txt.split('\n').forEach(onLine);
    });
    proc.stderr.on('data', (d) => {
      const txt = d.toString();
      stderr += txt;
      txt.split('\n').forEach(onLine);
    });
    proc.on('close', (code) => {
      if (dl.cancelled) { resolve({ error: 'Download cancelled' }); return; }
      if (code !== 0) {
        const errMsg = (stderr + stdout).slice(0, 300) || 'spotdl failed';
        reject(new Error(errMsg)); return;
      }
      // Find newest mp3 in savePath
      const files = fs.readdirSync(savePath)
        .filter(f => f.endsWith('.mp3'))
        .map(f => ({ name: f, time: fs.statSync(path.join(savePath, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
      if (files.length) {
        lastFile = path.join(savePath, files[0].name);
        resolve({ filePath: lastFile, fileSize: fs.statSync(lastFile).size });
      } else {
        resolve({ filePath: savePath, fileSize: 0 });
      }
    });
    proc.on('error', reject);
  });
}

function parseSpeedToBytes(str) {
  const m = str.match(/([\d.]+)\s*(KiB|MiB|GiB|B)/i);
  if (!m) return 0;
  const v = parseFloat(m[1]), u = m[2].toLowerCase();
  return u === 'gib' ? v*1073741824 : u === 'mib' ? v*1048576 : u === 'kib' ? v*1024 : v;
}

async function ensureYtdlp(emit) {
  const ytdlpDir = path.join(app.getPath('userData'), 'bin');
  const ytdlpPath = path.join(ytdlpDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(ytdlpPath)) return ytdlpPath;
  emit({ percent: 0, message: 'Downloading yt-dlp (first time only)\u2026', speed: 0 });
  fs.mkdirSync(ytdlpDir, { recursive: true });
  const dlUrl = process.platform === 'win32'
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : process.platform === 'darwin'
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  await dlFile(dlUrl, ytdlpPath, (pct) => emit({ percent: pct * 0.05, message: `Downloading yt-dlp: ${Math.round(pct)}%`, speed: 0 }));
  if (process.platform !== 'win32') fs.chmodSync(ytdlpPath, 0o755);
  return ytdlpPath;
}

function dlFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const https = require('https'), http = require('http');
    const doRequest = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'ContraryConvertor/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { doRequest(res.headers.location); return; }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const fileStream = fs.createWriteStream(dest);
        res.on('data', (chunk) => { downloaded += chunk.length; if (totalBytes && onProgress) onProgress((downloaded / totalBytes) * 100); });
        res.pipe(fileStream);
        fileStream.on('finish', () => { fileStream.close(); resolve(); });
        fileStream.on('error', reject);
      }).on('error', reject);
    };
    doRequest(url);
  });
}

async function downloadDirect(url, savePath, threads, emit, dl) {
  const https = require('https'), http = require('http');
  emit({ percent: 0, message: 'Fetching file info\u2026', speed: 0, downloaded: 0 });
  const info = await getUrlInfo(url);
  const totalSize = info.contentLength;
  const fileName = info.fileName || urlToFilename(url);
  const outputPath = path.join(savePath, fileName);
  const supportsRanges = info.acceptRanges && totalSize > 0;

  if (!supportsRanges || totalSize < 1024 * 1024 || threads <= 1) {
    return await singleThreadDownload(url, outputPath, totalSize, emit, dl);
  }

  emit({ percent: 0, message: `Downloading with ${threads} threads\u2026`, speed: 0 });
  const chunkSize = Math.ceil(totalSize / threads);
  const tempFiles = [];
  let totalDownloaded = 0, startTime = Date.now();
  dl.requests = [];

  const chunkPromises = [];
  for (let i = 0; i < threads; i++) {
    const start = i * chunkSize, end = Math.min(start + chunkSize - 1, totalSize - 1);
    const tmpFile = `${outputPath}.part${i}`;
    tempFiles.push(tmpFile);
    chunkPromises.push(new Promise((resolve, reject) => {
      const doReq = (u) => {
        const mod = u.startsWith('https') ? https : http;
        const req = mod.get(u, { headers: { 'Range': `bytes=${start}-${end}`, 'User-Agent': 'ContraryConvertor/1.0' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { doReq(res.headers.location); return; }
          const ws = fs.createWriteStream(tmpFile);
          res.on('data', (chunk) => {
            if (dl.cancelled) { req.destroy(); ws.destroy(); return; }
            totalDownloaded += chunk.length;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? totalDownloaded / elapsed : 0;
            const pct = totalSize > 0 ? (totalDownloaded / totalSize) * 100 : 0;
            emit({ percent: pct, message: `Downloading: ${Math.round(pct)}%`, speed, downloaded: totalDownloaded, total: totalSize });
          });
          res.pipe(ws);
          ws.on('finish', resolve);
          ws.on('error', reject);
        });
        req.on('error', reject);
        dl.requests.push(req);
      };
      doReq(url);
    }));
  }

  await Promise.all(chunkPromises);
  if (dl.cancelled) { tempFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} }); return { error: 'Download cancelled' }; }

  emit({ percent: 95, message: 'Combining chunks\u2026', speed: 0, downloaded: totalDownloaded, total: totalSize });
  const writeStream = fs.createWriteStream(outputPath);
  for (const tmpFile of tempFiles) { writeStream.write(fs.readFileSync(tmpFile)); fs.unlinkSync(tmpFile); }
  writeStream.end();
  await new Promise(r => writeStream.on('finish', r));
  return { filePath: outputPath, fileSize: fs.statSync(outputPath).size };
}

async function singleThreadDownload(url, outputPath, totalSize, emit, dl) {
  const https = require('https'), http = require('http');
  return new Promise((resolve, reject) => {
    let downloaded = 0, startTime = Date.now();
    const doReq = (u) => {
      const mod = u.startsWith('https') ? https : http;
      const req = mod.get(u, { headers: { 'User-Agent': 'ContraryConvertor/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { doReq(res.headers.location); return; }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const total = parseInt(res.headers['content-length'] || totalSize || '0', 10);
        const ws = fs.createWriteStream(outputPath);
        res.on('data', (chunk) => {
          if (dl.cancelled) { req.destroy(); ws.destroy(); return; }
          downloaded += chunk.length;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? downloaded / elapsed : 0;
          const pct = total > 0 ? (downloaded / total) * 100 : 0;
          emit({ percent: pct, message: `Downloading: ${Math.round(pct)}%`, speed, downloaded, total });
        });
        res.pipe(ws);
        ws.on('finish', () => { ws.close(); if (dl.cancelled) { resolve({ error: 'Cancelled' }); return; } resolve({ filePath: outputPath, fileSize: fs.statSync(outputPath).size }); });
        ws.on('error', reject);
      });
      req.on('error', reject);
      dl.requests = [req];
    };
    doReq(url);
  });
}

function getUrlInfo(url) {
  const https = require('https'), http = require('http');
  return new Promise((resolve, reject) => {
    const doReq = (u) => {
      const mod = u.startsWith('https') ? https : http;
      const req = mod.request(u, { method: 'HEAD', headers: { 'User-Agent': 'ContraryConvertor/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { doReq(res.headers.location); return; }
        let fileName = null;
        const cd = res.headers['content-disposition'];
        if (cd) { const m = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/); if (m) fileName = m[1].replace(/['"]/g, ''); }
        resolve({ contentLength: parseInt(res.headers['content-length'] || '0', 10), acceptRanges: res.headers['accept-ranges'] === 'bytes', fileName, contentType: res.headers['content-type'] });
      });
      req.on('error', reject);
      req.end();
    };
    doReq(url);
  });
}

function urlToFilename(url) {
  try {
    const u = new URL(url);
    let name = path.basename(u.pathname);
    if (!name || name === '/' || !name.includes('.')) name = 'download_' + Date.now() + '.bin';
    return name.replace(/[<>:"/\\|?*]/g, '_');
  } catch { return 'download_' + Date.now() + '.bin'; }
}


// ─── Background Removal ──────────────────────────────────────────────────────
ipcMain.handle('bg:loadImage', async (_event, { imagePath }) => {
  try {
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon' };
    const mime = mimeMap[ext];

    if (mime) {
      // Browser can decode these natively — just read raw bytes
      const buf = fs.readFileSync(imagePath);
      return { base64: buf.toString('base64'), mime };
    }

    // Exotic format (HEIC, TIFF, etc.) — convert to PNG via sharp
    const sharpMod = r('sharp');
    const pngBuf = await sharpMod(imagePath).png().toBuffer();
    return { base64: pngBuf.toString('base64'), mime: 'image/png' };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('bg:detectSubject', async (_event, { imagePath, model }) => {
  try {
    const sharpMod = r('sharp');
    const os = require('os');
    const tmpDir = os.tmpdir();
    const tmpIn = path.join(tmpDir, `rembg_in_${Date.now()}.png`);
    const tmpOut = path.join(tmpDir, `rembg_out_${Date.now()}.png`);

    // Convert input to PNG for rembg
    await sharpMod(imagePath).png().toFile(tmpIn);

    // Run rembg CLI
    await new Promise((resolve, reject) => {
      // Map model names: 'small' -> u2netp, 'medium' -> u2net, 'large' -> isnet-general-use
      const modelMap = { small: 'u2netp', medium: 'u2net', large: 'isnet-general-use' };
      const rembgModel = modelMap[model] || 'u2net';
      const args = ['i', '-m', rembgModel, tmpIn, tmpOut];
      const proc = spawn('rembg', args, { shell: true, windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`rembg failed (code ${code}): ${stderr.slice(-200)}`));
      });
      proc.on('error', (err) => {
        reject(new Error(
          'rembg is not installed. Install it with: pip install rembg[cli]\n' + err.message
        ));
      });
    });

    // rembg outputs a transparent PNG — extract the alpha channel as the mask
    const resultBuf = await sharpMod(tmpOut).png().toBuffer();

    // Cleanup temp files
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}

    return { maskBase64: resultBuf.toString('base64') };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('bg:apply', async (_event, { imagePath, maskDataUrl }) => {
  try {
    const sharpMod = r('sharp');
    const maskBase64 = maskDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const maskBuf = Buffer.from(maskBase64, 'base64');
    const meta = await sharpMod(imagePath).metadata();
    const w = meta.width, h = meta.height;

    const alphaRaw = await sharpMod(maskBuf)
      .resize(w, h, { fit: 'fill' })
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer();

    const origRaw = await sharpMod(imagePath).ensureAlpha().raw().toBuffer();
    const output = Buffer.from(origRaw);
    for (let i = 0; i < w * h; i++) {
      output[i * 4 + 3] = alphaRaw[i];
    }

    const ext = path.extname(imagePath);
    const base = path.basename(imagePath, ext);
    const outPath = path.join(path.dirname(imagePath), `${base}_removedbg.png`);

    await sharpMod(output, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(outPath);

    return { filePath: outPath, fileSize: fs.statSync(outPath).size };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('bg:applyWithRefine', async (_event, { imagePath, maskDataUrl, feather, smooth, shiftEdge }) => {
  try {
    const sharpMod = r('sharp');
    const maskBase64 = maskDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const maskBuf = Buffer.from(maskBase64, 'base64');
    const meta = await sharpMod(imagePath).metadata();
    const w = meta.width, h = meta.height;

    // Start with the mask alpha channel
    let maskPipeline = sharpMod(maskBuf)
      .resize(w, h, { fit: 'fill' })
      .ensureAlpha()
      .extractChannel(3);

    // Feather: Gaussian blur on mask for soft edges
    if (feather && feather > 0) {
      const sigma = feather * (Math.max(w, h) / 1000);  // scale to image size
      maskPipeline = sharpMod(await maskPipeline.toBuffer())
        .blur(Math.max(0.3, sigma));
    }

    // Smooth: median filter to reduce jagged edges
    if (smooth && smooth > 0) {
      const medianSize = Math.max(3, Math.round(smooth) * 2 + 1);  // must be odd, 3+
      maskPipeline = sharpMod(await maskPipeline.toBuffer())
        .median(Math.min(medianSize, 11));
    }

    // Shift Edge: threshold adjustment (shift > 0 = expand, < 0 = contract)
    if (shiftEdge && shiftEdge !== 0) {
      // Lower threshold = expand selection, higher = contract
      const threshold = Math.max(1, Math.min(254, 128 - shiftEdge * 10));
      maskPipeline = sharpMod(await maskPipeline.toBuffer())
        .threshold(threshold);
    }

    const alphaRaw = await maskPipeline.raw().toBuffer();

    // Read original as raw RGBA
    const origRaw = await sharpMod(imagePath).ensureAlpha().raw().toBuffer();
    const output = Buffer.from(origRaw);
    for (let i = 0; i < w * h; i++) {
      output[i * 4 + 3] = alphaRaw[i];
    }

    const ext = path.extname(imagePath);
    const base = path.basename(imagePath, ext);
    const outPath = path.join(path.dirname(imagePath), `${base}_removedbg.png`);

    await sharpMod(output, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(outPath);

    return { filePath: outPath, fileSize: fs.statSync(outPath).size };
  } catch (err) {
    return { error: err.message };
  }
});

// ─── Category + format helpers ────────────────────────────────────────────────
function detectCategory(ext) {
  const maps = {
    image:        ['jpg','jpeg','png','webp','avif','gif','tiff','tif','bmp','svg','ico','heic'],
    video:        ['mp4','mov','avi','mkv','webm','flv','wmv','m4v'],
    audio:        ['mp3','wav','ogg','flac','aac','m4a','wma','opus'],
    document:     ['pdf','docx','doc','odt','pptx','ppt'],
    data:         ['json','csv','xml','yaml','yml','toml'],
    config:       ['env'],
    spreadsheet:  ['xlsx','xls','ods'],
    archive:      ['zip','tar','gz','7z','rar','bz2','xz','tgz','tbz2','txz','jar'],
    'game-archive':['pak','rpf','wad','obb'],
    web:          ['html','htm'],
    text:         ['txt','md','markdown'],
    code:         ['c','cpp','py','rs','jl','kt','nim','dart','go','java','js','ts','h','hpp','cs','rb','php','swift','sh','bat','ps1','r','lua','sql'],
    font:         ['ttf','otf','woff','woff2'],
    '3d':         ['fbx','obj','glb','gltf'],
  };
  // .env files have no extension—check by filename
  for (const [cat, exts] of Object.entries(maps)) {
    if (exts.includes(ext)) return cat;
  }
  return 'unknown';
}

function getMimeFromExt(ext) {
  const m = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
    gif:'image/gif',pdf:'application/pdf',mp4:'video/mp4',mp3:'audio/mpeg',
    json:'application/json',csv:'text/csv',html:'text/html',txt:'text/plain',
    xml:'application/xml',yaml:'application/yaml',zip:'application/zip',
    ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2',
    glb:'model/gltf-binary',gltf:'model/gltf+json',obj:'model/obj',fbx:'application/octet-stream',
    toml:'application/toml',env:'text/plain',
    pak:'application/octet-stream',rpf:'application/octet-stream',wad:'application/octet-stream',obb:'application/octet-stream' };
  return m[ext] || 'application/octet-stream';
}

function getOutputFormats(category, ext) {
  const fmt = {
    image:        ['jpg','png','webp','avif','gif','tiff','bmp','ico','pdf','upscale2x','upscale4x','remove-bg'],
    video:        ['mp4','webm','mov','avi','mkv','gif','mp3','wav','ogg','flac','aac','opus'],
    audio:        ['mp3','wav','ogg','flac','aac','opus'],
    document:     {
      pdf:  ['html','md','txt','images','extract-text','extract-images','extract-fonts','watermark-pdf'],
      docx: ['pdf','html','txt','md','extract-text','extract-images'],
      doc:  ['pdf','html','txt','md','extract-text'],
      odt:  ['pdf','html','txt','md','extract-text','extract-images'],
      pptx: ['pdf','html','txt','md'],
      ppt:  ['pdf','html','txt','md'],
    },
    data:         ['json','csv','xml','yaml','toml','env','xlsx'],
    config:       ['json','yaml','toml'],
    spreadsheet:  ['csv','json','xlsx'],
    archive:      ['zip','7z','tar','extract'],
    'game-archive':['extract'],
    web:          ['pdf','png','txt','md','extract-text'],
    text:         ['pdf','html','md','tts','extract-text'],
    code:         ['pdf','html','txt','tts'],
    font:         ['ttf','otf','extract-text'],
    '3d':         ['glb','obj','fbx'],
  };

  if (category === 'document') {
    const f = fmt.document[ext] || ['pdf','html','txt','md'];
    return f.filter(fo => fo !== ext);
  }

  let list = (fmt[category] || []).filter(f => f !== ext);
  if (category === 'video' || category === 'audio') {
    list.push('fix');
    list.push('denoise');
    list.push('tts');
  }

  if (category === 'image') list.push('extract-text');

  return list;
}

// ─── ffprobe helper ───────────────────────────────────────────────────────────
function probeMedia(filePath) {
  return new Promise((resolve) => {
    try {
      const ffmpeg     = r('fluent-ffmpeg');
      const ffmpegBin  = getFFmpegPath();
      ffmpeg.setFfmpegPath(ffmpegBin);
      ffmpeg.ffprobe(filePath, (err, meta) => {
        if (err) { resolve(null); return; }
        const vs = meta.streams.find(s => s.codec_type === 'video');
        const as = meta.streams.find(s => s.codec_type === 'audio');

        // Parse fractional framerate "num/den"
        let fps = null;
        if (vs && vs.r_frame_rate) {
          const parts = vs.r_frame_rate.split('/');
          if (parts.length === 2 && parseInt(parts[1]) !== 0) {
            fps = Math.round((parseInt(parts[0]) / parseInt(parts[1])) * 1000) / 1000;
          }
        }

        resolve({
          duration: meta.format.duration ? Math.round(meta.format.duration) : null,
          bitrate:  meta.format.bit_rate  ? Math.round(parseInt(meta.format.bit_rate) / 1000) : null,
          video: vs ? {
            codec:  vs.codec_name,
            width:  vs.width,
            height: vs.height,
            fps,
            bitrate: vs.bit_rate ? Math.round(parseInt(vs.bit_rate) / 1000) : null,
          } : null,
          audio: as ? {
            codec:      as.codec_name,
            sampleRate: as.sample_rate,
            channels:   as.channels,
            bitrate:    as.bit_rate ? Math.round(parseInt(as.bit_rate) / 1000) : null,
          } : null,
        });
      });
    } catch (e) { resolve(null); }
  });
}

// ─── File detection ───────────────────────────────────────────────────────────
ipcMain.handle('file:detect', async (_event, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    const ext  = path.extname(filePath).toLowerCase().slice(1);
    const name = path.basename(filePath);

    let mimeType = null; let detectedExt = null;
    try {
      const buf = Buffer.alloc(4100);
      const fd  = fs.openSync(filePath, 'r');
      fs.readSync(fd, buf, 0, 4100, 0);
      fs.closeSync(fd);
      const { fileTypeFromBuffer } = await rESM('file-type');
      const res = await fileTypeFromBuffer(buf);
      if (res) { mimeType = res.mime; detectedExt = res.ext; }
    } catch (_) { /* fall through */ }

    const finalExt = detectedExt || ext;
    const category = detectCategory(finalExt);

    // Probe media files for source settings
    let probe = null;
    if (category === 'video' || category === 'audio') {
      probe = await probeMedia(filePath);
    }

    return {
      path: filePath, name,
      ext: finalExt,
      size: stat.size,
      mime: mimeType || getMimeFromExt(ext),
      category,
      outputFormats: getOutputFormats(category, finalExt),
      probe,
    };
  } catch (err) { return { error: err.message }; }
});

// ─── Conversion dispatcher ────────────────────────────────────────────────────
ipcMain.handle('file:convert', async (event, { filePath, outputFormat, options }) => {
  const ext        = path.extname(filePath).toLowerCase().slice(1);
  const dir        = path.dirname(filePath);
  const base       = path.basename(filePath, path.extname(filePath));

  // Fix mode: output suffix is _fixed, always mp4
  const isFix        = outputFormat === 'fix';
  const isExtract    = outputFormat.startsWith('extract');
  const isWatermark  = outputFormat === 'watermark-pdf';
  const isDenoise    = outputFormat === 'denoise';
  const isUpscale    = outputFormat === 'upscale2x' || outputFormat === 'upscale4x';
  const isTTS        = outputFormat === 'tts';
  const isPdfImages  = outputFormat === 'images';
  const isArchiveExt = outputFormat === 'extract' && ['zip','7z','rar','gz','bz2','xz','tar','tgz','tbz2','txz','jar'].includes(ext);

  let outputPath;
  if (isFix) {
    outputPath = path.join(dir, `${base}_fixed.mp4`);
  } else if (isWatermark) {
    outputPath = path.join(dir, `${base}_watermarked.pdf`);
  } else if (isDenoise) {
    outputPath = path.join(dir, `${base}_denoised.${ext}`);
  } else if (isUpscale) {
    outputPath = path.join(dir, `${base}_${outputFormat}.${ext === 'jpg' || ext === 'jpeg' ? 'jpg' : 'png'}`);
  } else if (isTTS) {
    outputPath = path.join(dir, `${base}_speech.mp3`);
  } else if (isPdfImages) {
    outputPath = path.join(dir, `${base}_images`);
    fs.mkdirSync(outputPath, { recursive: true });
  } else if (isExtract || isArchiveExt) {
    outputPath = path.join(dir, `${base}_${outputFormat.replace(/-/g,'_')}`);
    fs.mkdirSync(outputPath, { recursive: true });
  } else {
    outputPath = path.join(dir, `${base}_converted.${outputFormat}`);
  }

  const emit = (pct, msg) => event.sender.send('convert:progress', { percent: pct, message: msg });

  try {
    emit(0, 'Starting…');

    if (isFix) {
      await fixForPlatform(filePath, outputPath, options, emit);
    } else if (isWatermark) {
      await watermarkPdf(filePath, outputPath, options, emit);
    } else if (isDenoise) {
      await runDenoise(filePath, outputPath, emit, event.sender);
    } else if (isUpscale) {
      await upscaleImage(filePath, outputPath, outputFormat, emit);
    } else if (isTTS) {
      await runTTS(filePath, outputPath, emit, event.sender);
    } else if (isPdfImages) {
      await pdfToImages(filePath, outputPath, emit);
    } else if (outputFormat === 'extract-text') {
      await extractText(filePath, outputPath, ext, emit, options);
    } else if (outputFormat === 'extract-images') {
      if (ext === 'pdf') {
        await extractPdfImages(filePath, outputPath, emit);
      } else if (['docx','doc','odt'].includes(ext)) {
        await extractDocxImages(filePath, outputPath, ext, emit);
      } else {
        throw new Error('Image extraction is not supported for this file type.');
      }
    } else if (outputFormat === 'extract-fonts') {
      await extractPdfFonts(filePath, outputPath, emit);
    } else if (outputFormat === 'extract' && ['pak','rpf','wad','obb'].includes(ext)) {
      await extractGameArchive(filePath, outputPath, ext, emit);
    } else {
      const category = detectCategory(ext);
      switch (category) {
        case 'image':                   await convertImage(filePath, outputPath, outputFormat, options, emit); break;
        case 'video':                   await convertVideo(filePath, outputPath, outputFormat, options, emit); break;
        case 'audio':                   await convertAudio(filePath, outputPath, outputFormat, options, emit); break;
        case 'document':                await convertDocument(filePath, outputPath, outputFormat, options, emit); break;
        case 'data': case 'config':
        case 'spreadsheet':             await convertData(filePath, outputPath, outputFormat, options, emit); break;
        case 'archive':                 await convertArchive(filePath, outputPath, outputFormat, options, emit); break;
        case 'web': case 'text':        await convertWeb(filePath, outputPath, outputFormat, options, emit); break;
        case 'code':                    await convertCode(filePath, outputPath, outputFormat, options, emit); break;
        case 'font':                    await convertFont(filePath, outputPath, outputFormat, options, emit); break;
        case '3d':                      await convert3D(filePath, outputPath, outputFormat, ext, emit); break;
        default: throw new Error(`Unsupported file category: ${category}`);
      }
    }

    emit(100, 'Done!');
    let outputSize = 0;
    try {
      const st = fs.statSync(outputPath);
      outputSize = st.isDirectory() ? getDirSize(outputPath) : st.size;
    } catch {}
    return { success: true, outputPath, outputSize };
  } catch (err) {
    event.sender.send('convert:error', { message: err.message });
    return { error: err.message };
  }
});

ipcMain.handle('post-process-denoise', async (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outputPath = path.join(dir, `${base}_denoised.${ext}`);
  const emit = (pct, msg) => event.sender.send('convert:progress', { percent: pct, message: msg });
  
  try {
    emit(0, 'Starting background noise removal...');
    await runDenoise(filePath, outputPath, emit, event.sender);
    emit(100, 'Done!');
    const st = fs.statSync(outputPath);
    return { success: true, outputPath, outputSize: st.size };
  } catch (err) {
    event.sender.send('convert:error', { message: err.message });
    return { error: err.message };
  }
});

function getDirSize(dirPath) {
  let total = 0;
  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const fp = path.join(dirPath, item);
    const st = fs.statSync(fp);
    total += st.isDirectory() ? getDirSize(fp) : st.size;
  }
  return total;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONVERTERS
// ═════════════════════════════════════════════════════════════════════════════

// ── Quality preset maps ───────────────────────────────────────────────────────
const QUALITY_PRESETS = {
  lossless: { jpegQ: 100, webpLossless: true,  avifLossless: true,  videoCrf: 0,  gifColors: 256 },
  high:     { jpegQ: 90,  webpLossless: false, avifLossless: false, videoCrf: 16, gifColors: 256 },
  medium:   { jpegQ: 75,  webpLossless: false, avifLossless: false, videoCrf: 23, gifColors: 192 },
  low:      { jpegQ: 55,  webpLossless: false, avifLossless: false, videoCrf: 28, gifColors: 128 },
  verylow:  { jpegQ: 30,  webpLossless: false, avifLossless: false, videoCrf: 35, gifColors: 64  },
};

// ── Platform fix specs ────────────────────────────────────────────────────────
// Each platform defines maximum-safe encoding parameters.
const PLATFORM_SPECS = {
  whatsapp:  { maxW: 1920, maxH: 1080, maxFps: 30,  crf: 23, vBitrate: '5M',   aBitrate: '128k', aRate: 44100, profile: 'main',     level: '4.0' },
  instagram: { maxW: 1920, maxH: 1080, maxFps: 30,  crf: 20, vBitrate: '8M',   aBitrate: '192k', aRate: 44100, profile: 'high',     level: '4.1' },
  youtube:   { maxW: 3840, maxH: 2160, maxFps: 60,  crf: 18, vBitrate: '20M',  aBitrate: '320k', aRate: 48000, profile: 'high',     level: '5.1' },
  discord:   { maxW: 1920, maxH: 1080, maxFps: 30,  crf: 23, vBitrate: '8M',   aBitrate: '192k', aRate: 48000, profile: 'main',     level: '4.0' },
  mobile:    { maxW: 1280, maxH: 720,  maxFps: 30,  crf: 23, vBitrate: '3M',   aBitrate: '128k', aRate: 44100, profile: 'baseline', level: '3.1' },
};

async function fixForPlatform(input, output, options, emit) {
  const platform = options.fixPlatform || 'whatsapp';
  const spec     = PLATFORM_SPECS[platform];
  if (!spec) throw new Error('Unknown platform: ' + platform);

  emit(5, 'Fixing for ' + platform + '...');

  return new Promise((resolve, reject) => {
    const ffmpeg    = r('fluent-ffmpeg');
    const ffmpegBin = getFFmpegPath();
    ffmpeg.setFfmpegPath(ffmpegBin);

    // Scale: cap to platform max, preserve aspect, ensure even dims for H.264
    var vfParts = [
      "scale='min(" + spec.maxW + ",iw)':'min(" + spec.maxH + ",ih)':force_original_aspect_ratio=decrease",
      "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "fps=" + spec.maxFps
    ];

    var bufsize = (parseInt(spec.vBitrate) * 2) + 'M';

    const cmd = ffmpeg(input)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-y',
        '-pix_fmt',   'yuv420p',
        '-profile:v', spec.profile,
        '-level:v',   spec.level,
        '-crf',       String(spec.crf),
        '-maxrate',   spec.vBitrate,
        '-bufsize',   bufsize,
        '-b:a',       spec.aBitrate,
        '-ar',        String(spec.aRate),
        '-ac',        '2',
        '-movflags',  '+faststart',
        '-vf',        vfParts.join(',')
      ])
      .format('mp4');

    cmd
      .on('start', function() { emit(10, 'Re-encoding for ' + platform + '...'); })
      .on('progress', function(info) {
        if (info.percent) emit(Math.min(Math.round(info.percent), 95), Math.round(info.percent) + '%');
      })
      .on('error', reject)
      .on('end', resolve)
      .save(output);
  });
}

// ── Image ─────────────────────────────────────────────────────────────────────
async function convertImage(input, output, format, options, emit) {
  const sharp = r('sharp');
  emit(10, 'Loading image…');

  // failOnError: false lets sharp handle truncated/broken images gracefully
  // rotate() auto-applies EXIF orientation then strips the tag
  let pipe = sharp(input, { failOnError: false }).rotate();

  // Resize only if explicitly requested
  const w = options.width  ? parseInt(options.width)  : null;
  const h = options.height ? parseInt(options.height) : null;
  if (w || h) pipe = pipe.resize(w, h, { fit: 'inside', withoutEnlargement: true });

  // Resolve quality preset (slider value is 1-100, also used as fallback)
  const preset  = QUALITY_PRESETS[options.qualityPreset] || QUALITY_PRESETS.lossless;
  const quality = options.quality != null ? parseInt(options.quality) : preset.jpegQ;

  emit(40, 'Processing…');

  const fmtMap = {
    jpg:  () => pipe.jpeg({ quality, mozjpeg: true }).toFile(output),
    jpeg: () => pipe.jpeg({ quality, mozjpeg: true }).toFile(output),
    png:  () => pipe.png({ compressionLevel: preset.jpegQ >= 90 ? 0 : 6, adaptiveFiltering: false }).toFile(output),
    webp: () => pipe.webp(preset.webpLossless ? { lossless: true } : { quality }).toFile(output),
    avif: () => pipe.avif(preset.avifLossless ? { lossless: true } : { quality }).toFile(output),
    gif:  () => pipe.gif({ colors: preset.gifColors, dither: 1.0 }).toFile(output),
    tiff: () => pipe.tiff(preset.jpegQ >= 90 ? { compression: 'lzw' } : { quality, compression: 'jpeg' }).toFile(output),
    bmp:  async () => {
      // Sharp doesn't support BMP output — convert to raw RGBA then write a proper BMP
      const meta = await sharp(input).metadata();
      const resized = w || h ? pipe.resize(w, h, { fit: 'inside', withoutEnlargement: true }) : pipe;
      const { data, info } = await resized.removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const width = info.width, height = info.height, channels = info.channels;
      const rowBytes = width * channels;
      const paddedRowBytes = Math.ceil(rowBytes / 4) * 4;
      const pixelDataSize = paddedRowBytes * height;
      const fileSize = 54 + pixelDataSize;
      const buf = Buffer.alloc(fileSize);
      // BMP file header
      buf.write('BM', 0);
      buf.writeUInt32LE(fileSize, 2);
      buf.writeUInt32LE(54, 10); // pixel data offset
      // DIB header (BITMAPINFOHEADER)
      buf.writeUInt32LE(40, 14);
      buf.writeInt32LE(width, 18);
      buf.writeInt32LE(height, 22); // positive = bottom-up
      buf.writeUInt16LE(1, 26); // color planes
      buf.writeUInt16LE(channels * 8, 28); // bits per pixel
      buf.writeUInt32LE(0, 30); // no compression
      buf.writeUInt32LE(pixelDataSize, 34);
      buf.writeInt32LE(2835, 38); // h resolution (72 DPI)
      buf.writeInt32LE(2835, 42); // v resolution
      // Pixel data (BMP stores bottom-up, BGR order)
      for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * rowBytes;
        const dstRow = 54 + y * paddedRowBytes;
        for (let x = 0; x < width; x++) {
          const srcOff = srcRow + x * channels;
          const dstOff = dstRow + x * channels;
          buf[dstOff]     = data[srcOff + 2]; // B
          buf[dstOff + 1] = data[srcOff + 1]; // G
          buf[dstOff + 2] = data[srcOff];     // R
        }
      }
      fs.writeFileSync(output, buf);
    },
    ico:  async () => {
      // Create proper multi-size ICO using png-to-ico (ESM module)
      const { default: pngToIco } = await import('png-to-ico');
      const sizes = [16, 32, 48, 256];
      const pngBuffers = [];
      for (const sz of sizes) {
        const pngBuf = await sharp(input)
          .resize(sz, sz, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        pngBuffers.push(pngBuf);
      }
      const icoBuf = await pngToIco(pngBuffers);
      fs.writeFileSync(output, icoBuf);
    },
    pdf: async () => {
      const { PDFDocument } = r('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const meta = await sharp(input, { failOnError: false }).metadata();
      const imgBuf = await sharp(input, { failOnError: false }).rotate().jpeg({ quality: 95 }).toBuffer();
      const jpgImage = await pdfDoc.embedJpg(imgBuf);
      const { width: iw, height: ih } = jpgImage.scale(1);
      // A4 with margin, scale to fit
      const pageW = 595, pageH = 842, margin = 30;
      const maxW = pageW - margin * 2, maxH = pageH - margin * 2;
      const scale = Math.min(maxW / iw, maxH / ih, 1);
      const dw = iw * scale, dh = ih * scale;
      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(jpgImage, { x: (pageW - dw) / 2, y: (pageH - dh) / 2, width: dw, height: dh });
      fs.writeFileSync(output, await pdfDoc.save());
    },
  };

  emit(60, 'Converting…');
  const fn = fmtMap[format];
  if (!fn) throw new Error(`Unsupported image format: ${format}`);
  await fn();
  emit(90, 'Finalizing…');
}

// ── Video ─────────────────────────────────────────────────────────────────────
// Strategy:
//   1. Same codec family + container supports stream copy → -c copy (truly lossless)
//   2. Otherwise use lossless re-encode: H.264 CRF 0, VP9 lossless, etc.
//   Framerate: use source fps unless overridden by user
//   Resolution: use source unless overridden by user
async function convertVideo(input, output, format, options, emit) {
  return new Promise((resolve, reject) => {
    const ffmpeg    = r('fluent-ffmpeg');
    const ffmpegBin = getFFmpegPath();
    ffmpeg.setFfmpegPath(ffmpegBin);
    emit(5, 'Initialising ffmpeg…');

    // Containers that support stream-copy of H.264+AAC
    const COPY_CONTAINERS = new Set(['mp4','mkv','mov','m4v']);

    // Determine if we can stream-copy (container-only change)
    const canCopy   = COPY_CONTAINERS.has(format) && format !== 'gif' && format !== 'mp3';
    const userW     = options.vidWidth  ? parseInt(options.vidWidth)  : null;
    const userH     = options.vidHeight ? parseInt(options.vidHeight) : null;
    const userFps   = options.framerate ? parseFloat(options.framerate) : null;
    const resizeReq = !!(userW || userH || userFps);

    let cmd = ffmpeg(input).outputOptions(['-y']);

    // Resolve CRF from quality preset before if-else chain
    const vPreset = QUALITY_PRESETS[options.qualityPreset] || QUALITY_PRESETS.lossless;
    const crf     = vPreset.videoCrf;
    const encPreset = crf === 0 ? 'ultrafast' : (crf <= 16 ? 'slow' : 'medium');

    // Helper: apply optional resize + fps
    const applyResize = (c) => {
      if (userW || userH) c = c.size(userW && userH ? `${userW}x${userH}` : (userW ? `${userW}x?` : `?x${userH}`));
      if (userFps) c = c.fps(userFps);
      return c;
    };

    // Pad to even dimensions for H.264 (required)
    const padEven = '-vf pad=ceil(iw/2)*2:ceil(ih/2)*2';

    // Audio extraction from video
    const AUDIO_FORMATS = new Set(['mp3','wav','ogg','flac','aac','opus']);
    if (AUDIO_FORMATS.has(format)) {
      const audioCodecMap = {
        mp3:  { codec: 'libmp3lame', extra: ['-q:a', '0'] },
        wav:  { codec: 'pcm_s24le', extra: [] },
        ogg:  { codec: 'libvorbis', extra: ['-q:a', '10'] },
        flac: { codec: 'flac', extra: [] },
        aac:  { codec: 'aac', extra: ['-b:a', '320k'] },
        opus: { codec: 'libopus', extra: ['-b:a', '320k'] },
      };
      const ac = audioCodecMap[format];
      cmd = cmd.noVideo().audioCodec(ac.codec);
      if (ac.extra.length) cmd = cmd.outputOptions(ac.extra);
      cmd = cmd.format(format === 'ogg' ? 'ogg' : format);

    } else if (format === 'gif') {
      const fps   = userFps || 24;
      const scale = (userW && userH) ? `scale=${userW}:${userH}` : (userW ? `scale=${userW}:-1` : 'scale=480:-1');
      cmd = cmd.noAudio()
        .outputOptions(['-vf', `fps=${fps},${scale}:flags=lanczos`, '-loop', '0'])
        .format('gif');

    } else if (canCopy && !resizeReq && crf === 0) {
      cmd = cmd.outputOptions(['-c', 'copy'])
        .format(format === 'm4v' ? 'mp4' : format);

    } else if (format === 'mp4') {
      cmd = cmd.videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-crf', String(crf), '-preset', encPreset, '-pix_fmt', 'yuv420p', padEven, '-movflags', '+faststart'])
        .format('mp4');
      cmd = applyResize(cmd);

    } else if (format === 'mkv') {
      cmd = cmd.videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-crf', String(crf), '-preset', encPreset, padEven])
        .format('matroska');
      cmd = applyResize(cmd);

    } else if (format === 'mov') {
      cmd = cmd.videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-crf', String(crf), '-preset', encPreset, '-pix_fmt', 'yuv420p', padEven])
        .format('mov');
      cmd = applyResize(cmd);

    } else if (format === 'webm') {
      const webmOpts = crf === 0
        ? ['-lossless', '1', '-b:v', '0']
        : ['-b:v', '0', '-crf', String(crf)];
      cmd = cmd.videoCodec('libvpx-vp9')
        .audioCodec('libopus')
        .outputOptions(webmOpts)
        .format('webm');
      cmd = applyResize(cmd);

    } else if (format === 'avi') {
      cmd = cmd.videoCodec('libxvid')
        .audioCodec('libmp3lame')
        .outputOptions(['-q:v', String(Math.max(1, Math.round(crf / 5))), '-q:a', '0'])
        .format('avi');
      cmd = applyResize(cmd);

    } else if (format === 'flv') {
      cmd = cmd.videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-crf', String(crf), '-preset', encPreset, padEven, '-ar', '44100'])
        .format('flv');
      cmd = applyResize(cmd);

    } else if (format === 'wmv') {
      cmd = cmd.videoCodec('wmv2')
        .audioCodec('wmav2')
        .outputOptions(['-q:v', String(Math.max(2, Math.round(crf / 3)))])
        .format('asf');
      cmd = applyResize(cmd);

    } else {
      // Fallback: let ffmpeg guess from extension
      cmd = cmd.videoCodec('libx264').audioCodec('aac')
        .outputOptions(['-crf', String(crf), '-preset', encPreset]);
      cmd = applyResize(cmd);
    }

    cmd
      .on('start', (cmdLine) => { emit(10, 'Processing video…'); })
      .on('progress', (info) => {
        if (info.percent) emit(Math.min(Math.round(info.percent), 95), `${Math.round(info.percent)}%`);
      })
      .on('error', (err) => {
        // Provide more helpful error messages
        const msg = err.message || String(err);
        reject(new Error(msg.includes('ENOENT') ? 'ffmpeg binary not found' : msg.slice(0, 300)));
      })
      .on('end', resolve)
      .save(output);
  });
}

// ── Audio ─────────────────────────────────────────────────────────────────────
// Lossless: FLAC, WAV (24-bit PCM); highest quality for lossy (MP3 320k q:a 0, AAC 320k)
// Source bitrate used unless overridden
async function convertAudio(input, output, format, options, emit) {
  return new Promise((resolve, reject) => {
    const ffmpeg    = r('fluent-ffmpeg');
    const ffmpegBin = getFFmpegPath();
    ffmpeg.setFfmpegPath(ffmpegBin);
    emit(5, 'Initialising audio conversion…');

    // Use source bitrate from probe if available, else best quality
    const srcBitrateK = options.sourceBitrate || null;
    const userBitrate = options.bitrate || (srcBitrateK ? `${srcBitrateK}k` : null);

    const codecMap = {
      flac: { codec: 'flac',        bitrate: null,                          extra: [] },
      wav:  { codec: 'pcm_s24le',   bitrate: null,                          extra: [] },
      ogg:  { codec: 'libvorbis',   bitrate: userBitrate || '320k',         extra: ['-q:a','10'] },
      aac:  { codec: 'aac',         bitrate: userBitrate || '320k',         extra: [] },
      opus: { codec: 'libopus',     bitrate: userBitrate || '320k',         extra: [] },
      mp3:  { codec: 'libmp3lame',  bitrate: userBitrate || '320k',         extra: ['-q:a','0'] },
    };

    const cfg = codecMap[format];
    if (!cfg) { reject(new Error(`Unsupported audio format: ${format}`)); return; }

    let cmd = ffmpeg(input).outputOptions(['-y']).audioCodec(cfg.codec).noVideo();
    if (cfg.bitrate) cmd = cmd.audioBitrate(cfg.bitrate);
    if (cfg.extra.length) cmd = cmd.outputOptions(cfg.extra);

    cmd
      .on('start', () => emit(10, 'Processing audio…'))
      .on('progress', (info) => {
        if (info.percent) emit(Math.min(Math.round(info.percent), 95), `${Math.round(info.percent)}%`);
      })
      .on('error', reject)
      .on('end', resolve)
      .save(output);
  });
}

// ── Document ──────────────────────────────────────────────────────────────────
async function convertDocument(input, output, format, options, emit) {
  const ext = path.extname(input).toLowerCase().slice(1);
  emit(10, 'Loading document…');

  // ── DOCX / DOC ────────────────────────────────────────────────────────────
  if (['docx','doc'].includes(ext) && format === 'html') {
    const mammoth = r('mammoth');
    emit(40, 'Converting DOCX → HTML…');
    const res = await mammoth.convertToHtml({ path: input });
    fs.writeFileSync(output, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.6;}</style></head><body>${res.value}</body></html>`, 'utf-8');

  } else if (['docx','doc'].includes(ext) && format === 'txt') {
    const mammoth = r('mammoth');
    emit(40, 'Extracting text…');
    const res = await mammoth.extractRawText({ path: input });
    fs.writeFileSync(output, res.value, 'utf-8');

  } else if (['docx','doc'].includes(ext) && format === 'pdf') {
    const mammoth = r('mammoth');
    emit(30, 'Converting DOCX → HTML…');
    const { value } = await mammoth.convertToHtml({ path: input });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.6;}</style></head><body>${value}</body></html>`;
    emit(60, 'Rendering PDF…');
    await htmlToPdf(html, output);

  } else if (['docx','doc'].includes(ext) && format === 'md') {
    const mammoth = r('mammoth');
    emit(30, 'Converting DOCX → HTML…');
    const { value } = await mammoth.convertToHtml({ path: input });
    emit(60, 'Converting HTML → Markdown…');
    const TurndownService = r('turndown');
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    fs.writeFileSync(output, td.turndown(value), 'utf-8');

  // ── ODT ───────────────────────────────────────────────────────────────────
  } else if (ext === 'odt') {
    if (format === 'pdf' || format === 'html' || format === 'txt' || format === 'md') {
      const mammoth = r('mammoth');
      emit(40, 'Converting ODT…');
      if (format === 'txt') {
        const res = await mammoth.extractRawText({ path: input });
        fs.writeFileSync(output, res.value, 'utf-8');
      } else if (format === 'md') {
        const { value } = await mammoth.convertToHtml({ path: input });
        const TurndownService = r('turndown');
        fs.writeFileSync(output, new TurndownService({ headingStyle: 'atx' }).turndown(value), 'utf-8');
      } else {
        const { value } = await mammoth.convertToHtml({ path: input });
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.6;}</style></head><body>${value}</body></html>`;
        if (format === 'html') fs.writeFileSync(output, html, 'utf-8');
        else { emit(60, 'Rendering PDF…'); await htmlToPdf(html, output); }
      }
    } else {
      throw new Error(`ODT → ${format} is not supported.`);
    }

  // ── PDF ───────────────────────────────────────────────────────────────────
  } else if (ext === 'pdf' && format === 'html') {
    emit(30, 'Extracting PDF text…');
    const pdfParse = r('pdf-parse');
    let text = '';
    try { text = (await pdfParse(fs.readFileSync(input))).text; } catch {}
    fs.writeFileSync(output, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${path.basename(input)}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.7;white-space:pre-wrap;}</style></head><body><h1>${escHtml(path.basename(input))}</h1><div>${escHtml(text)}</div></body></html>`, 'utf-8');

  } else if (ext === 'pdf' && format === 'txt') {
    emit(40, 'Extracting PDF text…');
    const pdfParse = r('pdf-parse');
    const { text } = await pdfParse(fs.readFileSync(input));
    fs.writeFileSync(output, text, 'utf-8');

  } else if (ext === 'pdf' && format === 'md') {
    emit(40, 'Extracting PDF text…');
    const pdfParse = r('pdf-parse');
    const { text, numpages } = await pdfParse(fs.readFileSync(input));
    const md = `# ${path.basename(input, '.pdf')}\n\n_${numpages} page(s)_\n\n---\n\n${text.trim()}`;
    fs.writeFileSync(output, md, 'utf-8');

  // ── PPTX / PPT ────────────────────────────────────────────────────────────
  } else if (['pptx','ppt'].includes(ext)) {
    await convertPptx(input, output, format, options, emit);

  } else {
    throw new Error(`Conversion from ${ext} to ${format} is not supported.`);
  }
  emit(90, 'Finalizing…');
}

// ── Data / Spreadsheet / Config ───────────────────────────────────────────────
async function convertData(input, output, format, options, emit) {
  const ext     = path.extname(input).toLowerCase().slice(1);
  const content = fs.readFileSync(input, 'utf-8');
  emit(20, 'Parsing input…');

  let data;
  if (ext === 'json') {
    data = JSON.parse(content);
  } else if (ext === 'yaml' || ext === 'yml') {
    data = r('js-yaml').load(content);
  } else if (ext === 'toml') {
    const TOML = r('@iarna/toml');
    data = TOML.parse(content);
  } else if (ext === 'env') {
    data = parseEnvFile(content);
  } else if (ext === 'csv') {
    const { parse } = require('csv-parse/sync');
    data = parse(content, { columns: true, skip_empty_lines: true });
  } else if (ext === 'xml') {
    data = new (r('fast-xml-parser').XMLParser)({ ignoreAttributes: false }).parse(content);
  } else if (['xlsx','xls','ods'].includes(ext)) {
    const XLSX = r('xlsx');
    const wb   = XLSX.readFile(input);
    data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  } else {
    throw new Error(`Cannot parse input format: ${ext}`);
  }

  emit(60, `Writing ${format.toUpperCase()}…`);

  if (format === 'json') {
    fs.writeFileSync(output, JSON.stringify(data, null, 2), 'utf-8');
  } else if (format === 'yaml') {
    fs.writeFileSync(output, r('js-yaml').dump(data), 'utf-8');
  } else if (format === 'toml') {
    const TOML = r('@iarna/toml');
    fs.writeFileSync(output, TOML.stringify(data), 'utf-8');
  } else if (format === 'env') {
    fs.writeFileSync(output, writeEnvFile(data), 'utf-8');
  } else if (format === 'csv') {
    const { stringify } = require('csv-stringify/sync');
    fs.writeFileSync(output, stringify(Array.isArray(data) ? data : [data], { header: true }), 'utf-8');
  } else if (format === 'xml') {
    const b = new (r('fast-xml-parser').XMLBuilder)({ ignoreAttributes: false, format: true });
    fs.writeFileSync(output, '<?xml version="1.0" encoding="UTF-8"?>\n' + b.build({ root: Array.isArray(data) ? { item: data } : data }), 'utf-8');
  } else if (format === 'xlsx') {
    const XLSX = r('xlsx');
    const wb   = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.isArray(data) ? data : [data]), 'Sheet1');
    XLSX.writeFile(wb, output);
  } else {
    throw new Error(`Unsupported output format: ${format}`);
  }
  emit(90, 'Finalizing…');
}

// ── .env parser/writer ────────────────────────────────────────────────────────
function parseEnvFile(content) {
  const result = {};
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  });
  return result;
}

function writeEnvFile(data) {
  if (typeof data !== 'object' || data === null) return String(data);
  const lines = [];
  const flatten = (obj, prefix = '') => {
    for (const [key, val] of Object.entries(obj)) {
      const k = prefix ? `${prefix}_${key}` : key;
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        flatten(val, k);
      } else {
        const v = String(val);
        lines.push(v.includes(' ') || v.includes('#') ? `${k}="${v}"` : `${k}=${v}`);
      }
    }
  };
  flatten(data);
  return lines.join('\n') + '\n';
}

// ── Archive ───────────────────────────────────────────────────────────────────
async function convertArchive(input, output, format, options, emit) {
  const sevenBin = require('7zip-bin');
  const Seven = require('node-7z');
  const ext = path.extname(input).toLowerCase().slice(1);
  emit(10, 'Preparing…');

  const bin = sevenBin.path7za;

  if (format === 'extract') {
    // Extract to folder
    emit(20, `Extracting ${ext.toUpperCase()} archive…`);
    fs.mkdirSync(output, { recursive: true });
    await new Promise((resolve, reject) => {
      const stream = Seven.extractFull(input, output, {
        $bin: bin,
        $progress: true,
        recursive: true,
        overwrite: 'a',
      });
      stream.on('progress', (p) => {
        if (p.percent) emit(20 + Math.round(p.percent * 0.7), `Extracting: ${Math.round(p.percent)}%…`);
      });
      stream.on('end', resolve);
      stream.on('error', (e) => reject(new Error(e.stderr || String(e))));
    });

  } else {
    // Convert archive format: extract to temp, re-pack in target format
    const tempDir = output + '_tmp_' + Date.now();
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      emit(15, `Extracting ${ext.toUpperCase()}…`);
      await new Promise((resolve, reject) => {
        const stream = Seven.extractFull(input, tempDir, { $bin: bin, recursive: true, overwrite: 'a' });
        stream.on('progress', (p) => {
          if (p.percent) emit(15 + Math.round(p.percent * 0.4), `Extracting: ${Math.round(p.percent)}%…`);
        });
        stream.on('end', resolve);
        stream.on('error', (e) => reject(new Error(e.stderr || String(e))));
      });

      emit(60, `Creating ${format.toUpperCase()} archive…`);
      // 7zip output format is determined by output file extension
      const glob = path.join(tempDir, '*');
      await new Promise((resolve, reject) => {
        const stream = Seven.add(output, glob, { $bin: bin, recursive: true });
        stream.on('progress', (p) => {
          if (p.percent) emit(60 + Math.round(p.percent * 0.3), `Compressing: ${Math.round(p.percent)}%…`);
        });
        stream.on('end', resolve);
        stream.on('error', (e) => reject(new Error(e.stderr || String(e))));
      });
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }
  emit(90, 'Finalizing…');
}

// ── Web / Text ────────────────────────────────────────────────────────────────
async function convertWeb(input, output, format, options, emit) {
  const ext     = path.extname(input).toLowerCase().slice(1);
  const content = fs.readFileSync(input, 'utf-8');
  emit(15, 'Loading source…');

  if ((ext === 'html' || ext === 'htm') && format === 'pdf') {
    emit(40, 'Rendering PDF…');
    await htmlToPdf(content, output);

  } else if ((ext === 'html' || ext === 'htm') && format === 'png') {
    emit(40, 'Taking screenshot…');
    await htmlToScreenshot(input, output);

  } else if ((ext === 'md' || ext === 'markdown') && format === 'html') {
    emit(40, 'Converting Markdown → HTML…');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.7;}code{background:#f0f0f0;padding:2px 4px;border-radius:3px;}</style></head><body>${mdToHtml(content)}</body></html>`;
    fs.writeFileSync(output, html, 'utf-8');

  } else if ((ext === 'md' || ext === 'markdown') && format === 'pdf') {
    emit(30, 'Converting Markdown → HTML…');
    const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.7;}</style></head><body>${mdToHtml(content)}</body></html>`;
    emit(60, 'Rendering PDF…');
    await htmlToPdf(full, output);

  } else if (ext === 'txt' && format === 'pdf') {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre style="font-family:monospace;white-space:pre-wrap;line-height:1.6;">${escHtml(content)}</pre></body></html>`;
    emit(60, 'Rendering PDF…');
    await htmlToPdf(html, output);

  } else if (ext === 'txt' && format === 'html') {
    fs.writeFileSync(output, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre>${escHtml(content)}</pre></body></html>`, 'utf-8');

  } else if (ext === 'txt' && format === 'md') {
    // Plain text wrapped in a markdown document
    fs.writeFileSync(output, content, 'utf-8');

  } else if ((ext === 'html' || ext === 'htm') && format === 'md') {
    emit(40, 'Converting HTML → Markdown…');
    const TurndownService = r('turndown');
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    fs.writeFileSync(output, td.turndown(content), 'utf-8');

  } else if ((ext === 'md' || ext === 'markdown') && format === 'txt') {
    // Strip markdown syntax to plain text
    fs.writeFileSync(output, content.replace(/^#{1,6}\s+/gm,'').replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1').replace(/`(.+?)`/g,'$1').replace(/\[(.+?)\]\(.+?\)/g,'$1'), 'utf-8');

  } else {
    throw new Error(`Conversion from ${ext} to ${format} is not supported.`);
  }
  emit(90, 'Finalizing…');
}

// ─── Shared utilities ─────────────────────────────────────────────────────────
async function htmlToPdf(htmlContent, outputPath) {
  try {
    const puppeteer = r('puppeteer');
    const browser   = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page      = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({ path: outputPath, format: 'A4', printBackground: true,
      margin: { top:'20mm', bottom:'20mm', left:'15mm', right:'15mm' } });
    await browser.close();
  } catch (e) {
    // Fallback: pdf-lib basic
    const { PDFDocument, StandardFonts, rgb } = r('pdf-lib');
    const doc  = await PDFDocument.create();
    const pg   = doc.addPage([595,842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const text = htmlContent.replace(/<[^>]*>/g,'').slice(0,2000);
    pg.drawText(text, { x:50, y:792, size:11, font, color:rgb(0,0,0), maxWidth:495, lineHeight:16 });
    fs.writeFileSync(outputPath, await doc.save());
  }
}

async function htmlToScreenshot(inputPath, outputPath) {
  const puppeteer = r('puppeteer');
  const browser   = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page      = await browser.newPage();
  await page.setViewport({ width:1280, height:800 });
  await page.goto(`file://${inputPath}`, { waitUntil:'networkidle0' });
  await page.screenshot({ path: outputPath, fullPage:true });
  await browser.close();
}

function mdToHtml(md) {
  return md
    .replace(/^### (.+)/gm,'<h3>$1</h3>')
    .replace(/^## (.+)/gm,'<h2>$1</h2>')
    .replace(/^# (.+)/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>')
    .replace(/^- (.+)/gm,'<li>$1</li>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/^(?!<[hplico])(.+)/gm,'<p>$1</p>');
}

function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ═════════════════════════════════════════════════════════════════════════════
//  NEW CONVERTERS
// ═════════════════════════════════════════════════════════════════════════════

// ── PDF Watermark ────────────────────────────────────────────────────────────
async function watermarkPdf(input, output, options, emit) {
  emit(10, 'Loading PDF…');
  const { PDFDocument, StandardFonts, rgb, degrees } = r('pdf-lib');
  const buf = fs.readFileSync(input);
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const text = options.watermarkText || 'WATERMARK';
  const opacity = parseFloat(options.watermarkOpacity) || 0.15;
  const pages = doc.getPages();

  emit(30, `Applying watermark to ${pages.length} pages…`);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();

    // Scale font size relative to page diagonal so it spans nicely
    const diag = Math.sqrt(width * width + height * height);
    const fontSize = Math.max(24, Math.min(diag / (text.length * 0.65), 120));
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    // Draw diagonally from bottom-left to top-right, centered
    const angle = Math.atan2(height, width) * (180 / Math.PI);
    const cx = width / 2;
    const cy = height / 2;

    page.drawText(text, {
      x: cx - (textWidth / 2) * Math.cos(angle * Math.PI / 180) + (textHeight / 2) * Math.sin(angle * Math.PI / 180),
      y: cy - (textWidth / 2) * Math.sin(angle * Math.PI / 180) - (textHeight / 2) * Math.cos(angle * Math.PI / 180),
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity,
      rotate: degrees(angle),
    });

    if (i % 10 === 0) emit(30 + Math.round((i / pages.length) * 60), `Page ${i + 1}/${pages.length}…`);
  }

  emit(92, 'Saving watermarked PDF…');
  const watermarked = await doc.save();
  fs.writeFileSync(output, watermarked);
  emit(98, 'Done');
}

// ── Text Extraction (from anything) ──────────────────────────────────────────
async function extractText(input, outputDir, ext, emit, options = {}) {
  const base = path.basename(input, path.extname(input));
  const outputFile = path.join(outputDir, `${base}.txt`);
  const dividePages = options.dividePages || false;

  emit(10, 'Detecting source type…');

  // PDF
  if (ext === 'pdf') {
    emit(20, 'Extracting PDF text…');
    const buf = fs.readFileSync(input);
    const dividePages = options.dividePages || false;

    let pageTexts = [];

    try {
      const pdfParse = r('pdf-parse');

      // Always use page-by-page extraction with image detection
      const collected = [];
      await pdfParse(buf, {
        pagerender: async (pageData) => {
          try {
            // Extract text items with Y-position for line breaks
            const tc = await pageData.getTextContent();
            const items = tc.items || [];

            // Detect images via operator list
            let imageCount = 0;
            try {
              const ops = await pageData.getOperatorList();
              // OPS.paintImageXObject = 85, OPS.paintJpegXObject = 82, OPS.paintImageMaskXObject = 83
              const IMAGE_OPS = new Set([82, 83, 85]);
              for (const fn of ops.fnArray) {
                if (IMAGE_OPS.has(fn)) imageCount++;
              }
            } catch {}

            // Build text with proper line breaks
            let lastY = null;
            let txt = '';
            for (const item of items) {
              const y = item.transform ? item.transform[5] : null;
              if (lastY !== null && y !== null && Math.abs(lastY - y) > 2) txt += '\n';
              else if (lastY !== null && y !== null && item.str === '' && Math.abs(lastY - y) > 2) txt += '\n';
              if (item.str) txt += item.str;
              if (y !== null) lastY = y;
            }

            // Append image placeholders at end of page content
            if (imageCount > 0) {
              for (let img = 0; img < imageCount; img++) {
                txt += '\n[Insert Image Here]';
              }
            }

            collected.push(txt.trim());
          } catch {
            collected.push('');
          }
          return '';
        }
      });
      pageTexts = collected;

    } catch (e) {
      emit(30, 'pdf-parse failed, trying fallback…');
      // Fallback: use pdf-lib to read raw page content streams for text
      try {
        const { PDFDocument, PDFName, PDFDict, PDFStream } = r('pdf-lib');
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = doc.getPages();
        for (let i = 0; i < pages.length; i++) {
          emit(30 + Math.round((i / pages.length) * 50), `Fallback: page ${i + 1}/${pages.length}…`);
          try {
            const page = pages[i];
            // Try to extract raw text operators from content stream
            const contentStream = page.node.Contents();
            if (contentStream) {
              const rawBytes = contentStream.getContents ? contentStream.getContents() : null;
              if (rawBytes) {
                const raw = Buffer.from(rawBytes).toString('latin1');
                // Extract text between parentheses in Tj/TJ operators
                const textParts = [];
                const tjRegex = /\(([^)]*)\)\s*Tj/g;
                let match;
                while ((match = tjRegex.exec(raw)) !== null) {
                  textParts.push(match[1]);
                }
                // TJ array form: [(text)] TJ
                const tjArrayRegex = /\[([^\]]*)\]\s*TJ/gi;
                while ((match = tjArrayRegex.exec(raw)) !== null) {
                  const inner = match[1];
                  const subRegex = /\(([^)]*)\)/g;
                  let sub;
                  while ((sub = subRegex.exec(inner)) !== null) {
                    textParts.push(sub[1]);
                  }
                }
                // Detect image operators
                const imgOps = (raw.match(/\bDo\b/g) || []).length;
                let pageText = textParts.join(' ').trim();
                if (imgOps > 0) {
                  for (let img = 0; img < imgOps; img++) {
                    pageText += '\n[Insert Image Here]';
                  }
                }
                pageTexts.push(pageText);
              } else {
                pageTexts.push('');
              }
            } else {
              pageTexts.push('');
            }
          } catch {
            pageTexts.push('');
          }
        }
      } catch (e2) {
        pageTexts = [`(PDF text extraction failed: ${e.message}\nFallback also failed: ${e2.message})`];
      }
    }
    emit(80, 'Writing output…');

    // Write output
    if (dividePages) {
      let out = '';
      for (let i = 0; i < pageTexts.length; i++) {
        out += `==Page ${i + 1}==\n${pageTexts[i] || '(empty)'}\n\n`;
      }
      fs.writeFileSync(outputFile, out.trim(), 'utf-8');
    } else {
      const combined = pageTexts.filter(t => t).join('\n\n').trim();
      fs.writeFileSync(outputFile, combined || '(no text found in this PDF)', 'utf-8');
    }
    emit(92, 'Done');
  }
  // DOCX
  else if (ext === 'docx' || ext === 'doc') {
    emit(30, 'Extracting DOCX text…');
    const mammoth = r('mammoth');
    const res = await mammoth.extractRawText({ path: input });
    fs.writeFileSync(outputFile, res.value, 'utf-8');
  }
  // ODT
  else if (ext === 'odt') {
    emit(30, 'Extracting ODT text…');
    try {
      const StreamZip = r('node-stream-zip');
      const zip = new StreamZip.async({ file: input });
      const contentXml = await zip.entryData('content.xml');
      await zip.close();
      // Strip XML tags to get plain text
      const text = contentXml.toString('utf-8')
        .replace(/<text:line-break\/>/gi, '\n')
        .replace(/<text:tab\/>/gi, '\t')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/\n{3,}/g, '\n\n').trim();
      fs.writeFileSync(outputFile, text || '(no text found)', 'utf-8');
    } catch (e) {
      fs.writeFileSync(outputFile, `ODT text extraction failed: ${e.message}`, 'utf-8');
    }
  }
  // XLSX
  else if (['xlsx','xls','ods'].includes(ext)) {
    emit(30, 'Extracting spreadsheet text…');
    const XLSX = r('xlsx');
    const wb = XLSX.readFile(input);
    let text = '';
    for (const name of wb.SheetNames) {
      if (dividePages) {
        text += `==Sheet: ${name}==\n`;
      } else {
        text += `── ${name} ──\n`;
      }
      text += XLSX.utils.sheet_to_csv(wb.Sheets[name]) + '\n\n';
    }
    fs.writeFileSync(outputFile, text, 'utf-8');
  }
  // Images (OCR)
  else if (['jpg','jpeg','png','webp','bmp','tiff','tif','gif','avif'].includes(ext)) {
    emit(20, 'Loading OCR engine…');
    try {
      const Tesseract = r('tesseract.js');
      emit(30, 'Recognizing text (this may take a moment)…');
      const { data } = await Tesseract.recognize(input, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress) {
            emit(30 + Math.round(m.progress * 60), `OCR ${Math.round(m.progress * 100)}%…`);
          }
        }
      });
      fs.writeFileSync(outputFile, data.text || '(no text recognized)', 'utf-8');
    } catch (e) {
      fs.writeFileSync(outputFile, `OCR failed: ${e.message}`, 'utf-8');
    }
  }
  // HTML
  else if (['html','htm'].includes(ext)) {
    emit(30, 'Stripping HTML tags…');
    const content = fs.readFileSync(input, 'utf-8');
    const text = content.replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ').trim();
    fs.writeFileSync(outputFile, text, 'utf-8');
  }
  // Any text file
  else {
    emit(30, 'Reading file as text…');
    try {
      const content = fs.readFileSync(input, 'utf-8');
      fs.writeFileSync(outputFile, content, 'utf-8');
    } catch {
      fs.writeFileSync(outputFile, '(binary file — cannot extract text)', 'utf-8');
    }
  }
  emit(90, 'Finalizing…');
}

// ── PDF Image Extraction ─────────────────────────────────────────────────────
async function extractPdfImages(input, outputDir, emit) {
  emit(10, 'Loading PDF…');

  try {
    const { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef, PDFRawStream } = r('pdf-lib');
    const sharpMod = r('sharp');
    const pdfBytes = fs.readFileSync(input);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    emit(20, 'Scanning for embedded images…');

    let imageCount = 0;
    const seen = new Set();

    // Scan all indirect objects looking for Image XObjects
    const allObjects = pdfDoc.context.enumerateIndirectObjects();
    const imageObjects = [];

    for (const [ref, obj] of allObjects) {
      try {
        if (obj instanceof PDFStream || (obj && obj.dict)) {
          const dict = obj.dict || obj;
          if (dict instanceof PDFDict) {
            const subtype = dict.get(PDFName.of('Subtype'));
            if (subtype && subtype.toString() === '/Image') {
              const refKey = `${ref.objectNumber}-${ref.generationNumber}`;
              if (!seen.has(refKey)) {
                seen.add(refKey);
                imageObjects.push({ ref, stream: obj });
              }
            }
          }
        }
      } catch {}
    }

    emit(30, `Found ${imageObjects.length} embedded images…`);

    for (let i = 0; i < imageObjects.length; i++) {
      emit(30 + Math.round((i / imageObjects.length) * 60), `Extracting image ${i + 1}/${imageObjects.length}…`);
      try {
        const { stream } = imageObjects[i];
        const rawData = stream.getContents ? stream.getContents() : stream.contents;
        if (!rawData || rawData.length === 0) continue;

        const dict = stream.dict;
        const width = dict.get(PDFName.of('Width'));
        const height = dict.get(PDFName.of('Height'));
        const filter = dict.get(PDFName.of('Filter'));
        const filterStr = filter ? filter.toString() : '';

        const idx = String(i + 1).padStart(3, '0');

        // DCTDecode = JPEG data
        if (filterStr.includes('DCTDecode')) {
          fs.writeFileSync(path.join(outputDir, `image_${idx}.jpg`), rawData);
          imageCount++;
        }
        // JPXDecode = JPEG2000
        else if (filterStr.includes('JPXDecode')) {
          fs.writeFileSync(path.join(outputDir, `image_${idx}.jp2`), rawData);
          imageCount++;
        }
        // FlateDecode or raw = try to convert with sharp
        else if (width && height) {
          const w = typeof width === 'object' && width.numberValue ? width.numberValue : parseInt(width.toString());
          const h = typeof height === 'object' && height.numberValue ? height.numberValue : parseInt(height.toString());
          if (w > 0 && h > 0 && rawData.length >= w * h) {
            try {
              const bpc = dict.get(PDFName.of('BitsPerComponent'));
              const bpcVal = bpc ? parseInt(bpc.toString()) : 8;
              const cs = dict.get(PDFName.of('ColorSpace'));
              const csStr = cs ? cs.toString() : '/DeviceRGB';
              const channels = csStr.includes('Gray') ? 1 : (csStr.includes('CMYK') ? 4 : 3);

              await sharpMod(rawData, { raw: { width: w, height: h, channels } })
                .png()
                .toFile(path.join(outputDir, `image_${idx}.png`));
              imageCount++;
            } catch {
              // Save raw data as-is
              fs.writeFileSync(path.join(outputDir, `image_${idx}.bin`), rawData);
              imageCount++;
            }
          }
        }
      } catch {}
    }

    // Write summary
    fs.writeFileSync(path.join(outputDir, 'extraction_info.txt'),
      `Images found: ${imageObjects.length}\nSuccessfully extracted: ${imageCount}\n`, 'utf-8');

  } catch (e) {
    fs.writeFileSync(path.join(outputDir, 'error.txt'), `Image extraction error: ${e.message}`, 'utf-8');
  }

  emit(90, 'Finalizing…');
}

// ── DOCX/ODT Image Extraction ────────────────────────────────────────────────
async function extractDocxImages(input, outputDir, ext, emit) {
  emit(10, 'Loading document…');

  try {
    const StreamZip = r('node-stream-zip');
    const zip = new StreamZip.async({ file: input });
    const entries = await zip.entries();

    // DOCX stores images in word/media/, ODT in Pictures/
    const mediaPrefix = (ext === 'odt') ? 'Pictures/' : 'word/media/';

    const imageEntries = Object.values(entries).filter(e =>
      !e.isDirectory && e.name.startsWith(mediaPrefix)
    );

    emit(20, `Found ${imageEntries.length} embedded images…`);

    let extracted = 0;
    for (let i = 0; i < imageEntries.length; i++) {
      const entry = imageEntries[i];
      emit(20 + Math.round((i / imageEntries.length) * 70), `Extracting ${i + 1}/${imageEntries.length}…`);

      const fileName = path.basename(entry.name);
      const data = await zip.entryData(entry.name);
      fs.writeFileSync(path.join(outputDir, fileName), data);
      extracted++;
    }

    await zip.close();

    fs.writeFileSync(path.join(outputDir, 'extraction_info.txt'),
      `Document type: ${ext.toUpperCase()}\nImages found: ${imageEntries.length}\nExtracted: ${extracted}\n`, 'utf-8');

  } catch (e) {
    fs.writeFileSync(path.join(outputDir, 'error.txt'), `Image extraction error: ${e.message}`, 'utf-8');
  }

  emit(90, 'Finalizing…');
}

// ── PDF Font Extraction ──────────────────────────────────────────────────────
async function extractPdfFonts(input, outputDir, emit) {
  emit(10, 'Loading PDF…');

  const pdfBytes = fs.readFileSync(input);
  const { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef } = r('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  emit(30, 'Scanning for fonts…');

  const fontNames = [];
  const fontData = [];
  const seen = new Set();

  // Iterate all objects looking for font dictionaries
  pdfDoc.context.enumerateIndirectObjects().forEach(([ref, obj]) => {
    try {
      if (obj instanceof PDFDict) {
        const type = obj.get(PDFName.of('Type'));
        if (type && type.toString() === '/Font') {
          const baseFont = obj.get(PDFName.of('BaseFont'));
          const name = baseFont ? baseFont.toString().replace('/', '') : `font_${ref.objectNumber}`;
          if (!seen.has(name)) {
            seen.add(name);
            fontNames.push(name);

            // Try to extract the font file
            const desc = obj.get(PDFName.of('FontDescriptor'));
            if (desc && desc instanceof PDFRef) {
              const descDict = pdfDoc.context.lookup(desc);
              if (descDict instanceof PDFDict) {
                for (const key of ['FontFile', 'FontFile2', 'FontFile3']) {
                  const ffRef = descDict.get(PDFName.of(key));
                  if (ffRef && ffRef instanceof PDFRef) {
                    const stream = pdfDoc.context.lookup(ffRef);
                    if (stream instanceof PDFStream) {
                      const data = stream.getContents();
                      const ext = key === 'FontFile2' ? 'ttf' : (key === 'FontFile3' ? 'otf' : 'pfb');
                      fontData.push({ name, ext, data });
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch {}
  });

  emit(70, 'Writing fonts…');

  // Write font list
  const listContent = fontNames.length
    ? `Fonts found: ${fontNames.length}\n\n${fontNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
    : 'No fonts found in this PDF.';
  fs.writeFileSync(path.join(outputDir, 'font_list.txt'), listContent, 'utf-8');

  // Write extracted font files
  for (const fd of fontData) {
    const safeName = fd.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(outputDir, `${safeName}.${fd.ext}`), fd.data);
  }

  emit(90, 'Finalizing…');
}

// ── Font Conversion ──────────────────────────────────────────────────────────
async function convertFont(input, output, format, options, emit) {
  const opentype = r('opentype.js');
  emit(10, 'Loading font…');

  const font = opentype.loadSync(input);
  const ext = path.extname(input).toLowerCase().slice(1);
  emit(40, 'Processing font…');

  if (format === 'extract-text') {
    // Extract font metadata as text
    const info = [
      `Font Family: ${font.names.fontFamily?.en || 'Unknown'}`,
      `Font Subfamily: ${font.names.fontSubfamily?.en || 'Unknown'}`,
      `Full Name: ${font.names.fullName?.en || 'Unknown'}`,
      `Version: ${font.names.version?.en || 'Unknown'}`,
      `Designer: ${font.names.designer?.en || 'Unknown'}`,
      `License: ${font.names.license?.en || 'Unknown'}`,
      `Glyphs: ${font.glyphs.length}`,
      `Units Per Em: ${font.unitsPerEm}`,
      `Ascender: ${font.ascender}`,
      `Descender: ${font.descender}`,
    ];
    fs.writeFileSync(output, info.join('\n'), 'utf-8');
  } else if ((ext === 'ttf' && format === 'otf') || (ext === 'otf' && format === 'ttf')) {
    // opentype.js rebuilds the font tables from parsed glyph data
    // It outputs TrueType-flavored OpenType regardless of source
    // This is a proper re-serialization (not a file copy)
    emit(60, `Rebuilding as ${format.toUpperCase()}…`);
    const buf = Buffer.from(font.toArrayBuffer());
    fs.writeFileSync(output, buf);
  } else {
    throw new Error(`Font conversion from ${ext} to ${format} is not supported.`);
  }
  emit(90, 'Finalizing…');
}

// ── 3D Model Conversion ─────────────────────────────────────────────────────
async function convert3D(input, output, format, srcExt, emit) {
  emit(10, 'Loading 3D model…');

  if (srcExt === 'obj' && format === 'glb') {
    emit(30, 'Converting OBJ → GLB…');
    const obj2gltf = r('obj2gltf');
    const glb = await obj2gltf(input, { binary: true });
    fs.writeFileSync(output, glb);

  } else if (srcExt === 'obj' && format === 'fbx') {
    throw new Error('OBJ → FBX conversion requires proprietary Autodesk SDK. Convert to GLB instead.');

  } else if (srcExt === 'glb' || srcExt === 'gltf') {
    if (format === 'obj') {
      emit(30, 'Converting GLB → OBJ…');
      await glbToObj(input, output, srcExt, emit);
    } else if (format === 'fbx') {
      throw new Error('GLB → FBX conversion requires proprietary Autodesk SDK.');
    }

  } else if (srcExt === 'fbx') {
    if (format === 'glb') {
      emit(30, 'Converting FBX → GLB…');
      // Try fbx2gltf binary
      try {
        await fbxToGlb(input, output, emit);
      } catch (e) {
        throw new Error(`FBX → GLB failed: ${e.message}. FBX is a proprietary format with limited open-source support.`);
      }
    } else if (format === 'obj') {
      throw new Error('FBX → OBJ: convert to GLB first, then GLB → OBJ.');
    }
  } else {
    throw new Error(`3D conversion from ${srcExt} to ${format} is not supported.`);
  }

  emit(90, 'Finalizing…');
}

// Basic GLB → OBJ converter
async function glbToObj(input, output, srcExt, emit) {
  const data = fs.readFileSync(input);
  let jsonChunk;

  if (srcExt === 'glb') {
    // Parse GLB binary
    const magic = data.readUInt32LE(0);
    if (magic !== 0x46546C67) throw new Error('Not a valid GLB file');
    const chunkLen = data.readUInt32LE(12);
    jsonChunk = JSON.parse(data.slice(20, 20 + chunkLen).toString('utf-8'));
  } else {
    jsonChunk = JSON.parse(data.toString('utf-8'));
  }

  emit(50, 'Extracting mesh data…');

  let objContent = '# Exported by Contrary Convertor\n';
  let vertexOffset = 1;

  if (!jsonChunk.meshes || !jsonChunk.meshes.length) {
    throw new Error('No meshes found in glTF file');
  }

  // Get binary buffer
  let binBuffer = null;
  if (srcExt === 'glb') {
    const jsonChunkLen = data.readUInt32LE(12);
    const binStart = 20 + jsonChunkLen + 8; // 8 for bin chunk header
    binBuffer = data.slice(binStart);
  }

  if (binBuffer && jsonChunk.accessors && jsonChunk.bufferViews) {
    for (const mesh of jsonChunk.meshes) {
      objContent += `o ${mesh.name || 'mesh'}\n`;
      for (const prim of mesh.primitives) {
        // Positions
        if (prim.attributes.POSITION !== undefined) {
          const acc = jsonChunk.accessors[prim.attributes.POSITION];
          const bv = jsonChunk.bufferViews[acc.bufferView];
          const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
          for (let i = 0; i < acc.count; i++) {
            const x = binBuffer.readFloatLE(offset + i * 12);
            const y = binBuffer.readFloatLE(offset + i * 12 + 4);
            const z = binBuffer.readFloatLE(offset + i * 12 + 8);
            objContent += `v ${x} ${y} ${z}\n`;
          }
        }
        // Indices
        if (prim.indices !== undefined) {
          const acc = jsonChunk.accessors[prim.indices];
          const bv = jsonChunk.bufferViews[acc.bufferView];
          const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
          const is16 = acc.componentType === 5123;
          for (let i = 0; i < acc.count; i += 3) {
            const a = (is16 ? binBuffer.readUInt16LE(offset + i * 2) : binBuffer.readUInt32LE(offset + i * 4)) + vertexOffset;
            const b = (is16 ? binBuffer.readUInt16LE(offset + (i+1) * 2) : binBuffer.readUInt32LE(offset + (i+1) * 4)) + vertexOffset;
            const c = (is16 ? binBuffer.readUInt16LE(offset + (i+2) * 2) : binBuffer.readUInt32LE(offset + (i+2) * 4)) + vertexOffset;
            objContent += `f ${a} ${b} ${c}\n`;
          }
        }
        if (prim.attributes.POSITION !== undefined) {
          vertexOffset += jsonChunk.accessors[prim.attributes.POSITION].count;
        }
      }
    }
  } else {
    throw new Error('Cannot parse mesh data from this glTF file');
  }

  fs.writeFileSync(output, objContent, 'utf-8');
}

// FBX → GLB via command line fbx2gltf (if available)
async function fbxToGlb(input, output, emit) {
  return new Promise((resolve, reject) => {
    // Try to find fbx2gltf in node_modules/.bin
    const binName = process.platform === 'win32' ? 'FBX2glTF-windows-x64.exe' : 'FBX2glTF';
    let binPath;
    try {
      binPath = require.resolve(`fbx2gltf/bin/${binName}`);
    } catch {
      // Try via npx
      binPath = 'npx';
    }

    const args = binPath === 'npx'
      ? ['fbx2gltf', '--', '--binary', '--input', input, '--output', output.replace(/\.glb$/, '')]
      : ['--binary', '--input', input, '--output', output.replace(/\.glb$/, '')];

    const proc = spawn(binPath, args, { shell: true, cwd: path.dirname(input) });

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `fbx2gltf exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

// ── Game Archive Extraction ──────────────────────────────────────────────────
async function extractGameArchive(input, outputDir, ext, emit) {
  emit(10, `Detecting ${ext.toUpperCase()} format…`);

  if (ext === 'obb') {
    // OBB is just a ZIP file
    emit(20, 'Extracting OBB (ZIP) archive…');
    const StreamZip = r('node-stream-zip');
    const zip = new StreamZip.async({ file: input });
    const entries = await zip.entries();
    const total = Object.keys(entries).length;
    let done = 0;

    for (const entry of Object.values(entries)) {
      if (!entry.isDirectory) {
        const ep = path.join(outputDir, entry.name);
        fs.mkdirSync(path.dirname(ep), { recursive: true });
        await zip.extract(entry.name, ep);
      }
      emit(Math.min(20 + Math.round((++done / total) * 70), 90), `Extracting ${done}/${total}…`);
    }
    await zip.close();

  } else if (ext === 'pak') {
    await extractPak(input, outputDir, emit);

  } else if (ext === 'wad') {
    await extractWad(input, outputDir, emit);

  } else if (ext === 'rpf') {
    await extractRpf(input, outputDir, emit);

  } else {
    throw new Error(`Unsupported game archive format: .${ext}`);
  }

  emit(90, 'Finalizing…');
}

// ── PAK (Unreal Engine 4/5) ──────────────────────────────────────────────────
async function extractPak(input, outputDir, emit) {
  emit(20, 'Reading PAK footer…');

  const fd = fs.openSync(input, 'r');
  const stat = fs.fstatSync(fd);
  const fileSize = stat.size;

  // UE4/5 PAK magic: 0x5A6F12E1 at footer
  // Footer size varies by version: V4=44, V8+=53, V11(UE5)+=61
  const MAGIC = 0x5A6F12E1;
  const footerBuf = Buffer.alloc(256);
  fs.readSync(fd, footerBuf, 0, 256, Math.max(0, fileSize - 256));

  // Search for magic in footer region
  let magicOffset = -1;
  for (let i = footerBuf.length - 44; i >= 0; i--) {
    if (footerBuf.readUInt32LE(i) === MAGIC) {
      magicOffset = i;
      break;
    }
  }

  if (magicOffset === -1) {
    fs.closeSync(fd);
    // Try simpler uncompressed PAK (some games use simple concatenation)
    fs.writeFileSync(path.join(outputDir, 'extraction_note.txt'),
      'PAK format not recognized. This may be a custom or encrypted PAK.\n' +
      'Supported: Unreal Engine 4 PAK v1-v4, UE5 v11.\n' +
      'For encrypted PAKs, an AES key is required.', 'utf-8');
    return;
  }

  const pakMagicPos = fileSize - 256 + magicOffset;
  const version = footerBuf.readUInt32LE(magicOffset + 4);
  emit(30, `PAK version: ${version}…`);

  // Read index offset and size
  let indexOffset, indexSize;
  if (version >= 11) {
    // UE5 format
    indexOffset = Number(footerBuf.readBigInt64LE(magicOffset + 8));
    indexSize   = Number(footerBuf.readBigInt64LE(magicOffset + 16));
  } else {
    indexOffset = Number(footerBuf.readBigInt64LE(magicOffset + 8));
    indexSize   = Number(footerBuf.readBigInt64LE(magicOffset + 16));
  }

  emit(40, 'Reading file index…');

  if (indexOffset <= 0 || indexOffset >= fileSize || indexSize <= 0 || indexSize > fileSize) {
    fs.closeSync(fd);
    fs.writeFileSync(path.join(outputDir, 'extraction_note.txt'),
      `PAK v${version} detected but index appears encrypted or corrupted.\n` +
      'Encrypted PAKs require the AES-256 key from the game files.', 'utf-8');
    return;
  }

  const indexBuf = Buffer.alloc(Math.min(indexSize, 50 * 1024 * 1024)); // Cap at 50MB
  fs.readSync(fd, indexBuf, 0, indexBuf.length, indexOffset);

  // Parse mount point (FString: int32 len + chars + null)
  let pos = 0;
  const mountPointLen = indexBuf.readInt32LE(pos); pos += 4;
  if (mountPointLen > 0 && mountPointLen < 1024) {
    pos += mountPointLen; // skip mount point string
  }

  const fileCount = indexBuf.readInt32LE(pos); pos += 4;
  emit(50, `Found ${fileCount} files…`);

  if (fileCount <= 0 || fileCount > 1000000) {
    fs.closeSync(fd);
    fs.writeFileSync(path.join(outputDir, 'extraction_note.txt'),
      `PAK v${version}: ${fileCount} files detected. May be encrypted or unsupported variant.`, 'utf-8');
    return;
  }

  // Extract files
  let extracted = 0;
  for (let i = 0; i < Math.min(fileCount, 10000); i++) {
    try {
      // Read filename (FString)
      const nameLen = indexBuf.readInt32LE(pos); pos += 4;
      if (nameLen <= 0 || nameLen > 1024 || pos + nameLen > indexBuf.length) break;
      const fileName = indexBuf.slice(pos, pos + nameLen - 1).toString('utf-8'); pos += nameLen;

      // Read entry: offset(8), compSize(8), uncompSize(8), compressionMethod(4), hash(20)
      const dataOffset = Number(indexBuf.readBigInt64LE(pos)); pos += 8;
      const compSize   = Number(indexBuf.readBigInt64LE(pos)); pos += 8;
      const uncompSize = Number(indexBuf.readBigInt64LE(pos)); pos += 8;
      const compMethod = indexBuf.readUInt32LE(pos); pos += 4;
      pos += 20; // skip SHA1 hash

      if (version >= 3) pos += 1; // encrypted flag
      if (version >= 4) pos += 4; // compression block count

      // Extract uncompressed files
      if (compMethod === 0 && dataOffset > 0 && uncompSize > 0 && uncompSize < 500 * 1024 * 1024) {
        const fileBuf = Buffer.alloc(uncompSize);
        fs.readSync(fd, fileBuf, 0, uncompSize, dataOffset);

        const outPath = path.join(outputDir, fileName.replace(/\.\.\//g, ''));
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, fileBuf);
        extracted++;
      }

      emit(50 + Math.round((i / fileCount) * 40), `Extracting ${i + 1}/${fileCount}…`);
    } catch { break; }
  }

  fs.closeSync(fd);
  fs.writeFileSync(path.join(outputDir, 'extraction_info.txt'),
    `PAK v${version}\nTotal entries: ${fileCount}\nExtracted: ${extracted}\n` +
    (extracted < fileCount ? 'Note: Some files may be compressed or encrypted and were skipped.' : ''), 'utf-8');
}

// ── WAD (Doom) ───────────────────────────────────────────────────────────────
async function extractWad(input, outputDir, emit) {
  emit(20, 'Reading WAD header…');

  const data = fs.readFileSync(input);
  const magic = data.slice(0, 4).toString('ascii');

  if (magic !== 'IWAD' && magic !== 'PWAD') {
    throw new Error(`Not a valid WAD file (magic: ${magic})`);
  }

  const numLumps  = data.readInt32LE(4);
  const dirOffset = data.readInt32LE(8);

  emit(30, `${magic}: ${numLumps} lumps found…`);

  for (let i = 0; i < numLumps; i++) {
    const entryOffset = dirOffset + (i * 16);
    const lumpOffset  = data.readInt32LE(entryOffset);
    const lumpSize    = data.readInt32LE(entryOffset + 4);
    let   lumpName    = data.slice(entryOffset + 8, entryOffset + 16).toString('ascii').replace(/\0/g, '');

    if (lumpSize > 0 && lumpName) {
      // Sanitize name
      lumpName = lumpName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const outPath = path.join(outputDir, lumpName);
      fs.writeFileSync(outPath, data.slice(lumpOffset, lumpOffset + lumpSize));
    }

    emit(30 + Math.round((i / numLumps) * 60), `Extracting ${i + 1}/${numLumps}…`);
  }
}

// ── RPF (RAGE / GTA V) ───────────────────────────────────────────────────────
async function extractRpf(input, outputDir, emit) {
  emit(20, 'Reading RPF header…');

  const fd = fs.openSync(input, 'r');
  const headerBuf = Buffer.alloc(16);
  fs.readSync(fd, headerBuf, 0, 16, 0);

  const magic = headerBuf.readUInt32BE(0);
  // RPF7 = 0x52504637, RPF8 = 0x52504638
  if (magic !== 0x52504637 && magic !== 0x52504638) {
    fs.closeSync(fd);
    throw new Error(`Not a valid RPF file (magic: 0x${magic.toString(16)}). Only RPF7/RPF8 (GTA V/RDR2) supported.`);
  }

  const tocSize    = headerBuf.readUInt32LE(4);
  const numEntries = headerBuf.readUInt32LE(8);

  emit(30, `RPF${magic === 0x52504637 ? '7' : '8'}: ${numEntries} entries…`);

  // Read TOC
  const tocBuf = Buffer.alloc(tocSize);
  fs.readSync(fd, tocBuf, 0, tocSize, 16);

  // RPF7 entries are 16 bytes each
  // Due to potential encryption, do best-effort extraction
  let extracted = 0;
  const info = [];

  for (let i = 0; i < Math.min(numEntries, 5000); i++) {
    try {
      const entryOff = i * 16;
      if (entryOff + 16 > tocBuf.length) break;

      const nameHash = tocBuf.readUInt32LE(entryOff);
      const dataOff  = tocBuf.readUInt32LE(entryOff + 4);
      const flags    = tocBuf.readUInt32LE(entryOff + 8);
      const size     = tocBuf.readUInt32LE(entryOff + 12);

      if (size > 0 && size < 100 * 1024 * 1024 && dataOff > 0) {
        const fileBuf = Buffer.alloc(Math.min(size, 50 * 1024 * 1024));
        fs.readSync(fd, fileBuf, 0, fileBuf.length, dataOff * 512);

        const outName = `entry_${i}_0x${nameHash.toString(16)}`;
        fs.writeFileSync(path.join(outputDir, outName), fileBuf);
        extracted++;
      }
      info.push(`Entry ${i}: hash=0x${nameHash.toString(16)} offset=${dataOff} size=${size}`);
    } catch { break; }

    emit(30 + Math.round((i / numEntries) * 60), `Processing ${i + 1}/${numEntries}…`);
  }

  fs.closeSync(fd);
  fs.writeFileSync(path.join(outputDir, 'extraction_info.txt'),
    `RPF${magic === 0x52504637 ? '7' : '8'}\nTotal entries: ${numEntries}\nExtracted: ${extracted}\n\n` +
    'Note: RPF archives are often encrypted. File names are hashed and may not be recoverable.\n' +
    'For full extraction, use specialized tools like OpenIV.\n\n' +
    info.slice(0, 100).join('\n'), 'utf-8');
}

// ── Background Noise Removal (Denoise) Helpers ──────────────────────────────

function execPromise(cmd, options = {}) {
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout, stderr) => {
      if (error) {
        console.error(`Exec error: ${error.message}`);
        console.error(`Stderr: ${stderr}`);
        console.error(`Stdout: ${stdout}`);
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function ensurePython(emit) {
  const userDataDir = app.getPath('userData');
  const cachePath = path.join(userDataDir, 'deepfilter_installed.json');

  if (fs.existsSync(cachePath)) {
    try {
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cache.installed && cache.pythonPath && fs.existsSync(cache.pythonPath)) {
        return cache.pythonPath;
      }
      if (cache.installed && cache.pythonPath === 'system') {
        const { execSync } = require('child_process');
        try {
          execSync('python --version');
          return 'python';
        } catch {
          try {
            execSync('python3 --version');
            return 'python3';
          } catch {}
        }
      }
    } catch (e) {}
  }

  // 1. Check system Python
  const { execSync } = require('child_process');
  for (const cmd of ['python', 'python3']) {
    try {
      const out = execSync(`${cmd} --version`, { stdio: 'pipe' }).toString();
      if (out.includes('Python 3.')) {
        return cmd;
      }
    } catch (e) {}
  }

  // 2. If Windows and not found, download & extract embedded python
  if (process.platform === 'win32') {
    const pyEmbedDir = path.join(userDataDir, 'py_embed');
    const pythonExe = path.join(pyEmbedDir, 'python.exe');

    if (fs.existsSync(pythonExe)) {
      return pythonExe;
    }

    emit('Downloading Python 3.11 embeddable package...');
    fs.mkdirSync(pyEmbedDir, { recursive: true });

    const zipPath = path.join(userDataDir, 'python_embed.zip');
    const pyUrl = 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip';
    
    await dlFile(pyUrl, zipPath, (pct) => {
      emit(`Downloading Python 3.11: ${Math.round(pct)}%`);
    });

    emit('Extracting Python...');
    const StreamZip = r('node-stream-zip');
    const zip = new StreamZip.async({ file: zipPath });
    await zip.extract(null, pyEmbedDir);
    await zip.close();
    
    // Clean up zip
    try { fs.unlinkSync(zipPath); } catch (e) {}

    // Uncomment "import site" in python311._pth
    const pthFile = path.join(pyEmbedDir, 'python311._pth');
    if (fs.existsSync(pthFile)) {
      let content = fs.readFileSync(pthFile, 'utf8');
      content = content.replace(/#\s*import site/, 'import site');
      fs.writeFileSync(pthFile, content, 'utf8');
    }

    // Download get-pip.py
    emit('Downloading pip installer...');
    const pipPyPath = path.join(userDataDir, 'get-pip.py');
    const pipUrl = 'https://bootstrap.pypa.io/get-pip.py';
    await dlFile(pipUrl, pipPyPath, (pct) => {
      emit(`Downloading pip: ${Math.round(pct)}%`);
    });

    // Run get-pip.py
    emit('Installing pip...');
    try {
      execSync(`"${pythonExe}" "${pipPyPath}" --no-warn-script-location`, { stdio: 'pipe' });
    } catch (err) {
      throw new Error(`Failed to install pip: ${err.message}`);
    } finally {
      try { fs.unlinkSync(pipPyPath); } catch (e) {}
    }

    return pythonExe;
  } else {
    throw new Error('Python 3 is required for AI background noise removal. Please install Python 3 on your system and try again.');
  }
}

async function ensureDeepFilterNet(pythonPath, emit) {
  emit('Checking DeepFilterNet installation...');
  try {
    await execPromise(`"${pythonPath}" -c "import df"`);
    return;
  } catch (e) {
    emit('Installing DeepFilterNet (first-time setup, may take a minute)...');
    try {
      await execPromise(`"${pythonPath}" -m pip install --no-cache-dir deepfilternet --no-warn-script-location`);
      await execPromise(`"${pythonPath}" -c "import df"`);
    } catch (err) {
      throw new Error(`Failed to install DeepFilterNet: ${err.message}`);
    }
  }
}

function saveInstallCache(pythonPath) {
  const userDataDir = app.getPath('userData');
  const cachePath = path.join(userDataDir, 'deepfilter_installed.json');
  try {
    fs.writeFileSync(cachePath, JSON.stringify({
      installed: true,
      pythonPath: pythonPath === 'python' || pythonPath === 'python3' ? 'system' : pythonPath
    }), 'utf8');
  } catch (e) {}
}

async function runDenoise(inputPath, outputPath, emit, sender) {
  const ext = path.extname(inputPath).toLowerCase().slice(1);
  const isVideo = detectCategory(ext) === 'video';

  const tempDir = path.join(app.getPath('userData'), `temp_denoise_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const pass1Path = path.join(tempDir, 'pass1.wav');

  try {
    emit(10, 'Initializing Pass 1 (FFmpeg deep filter chain)...');

    const ffmpeg = r('fluent-ffmpeg');
    const ffmpegBin = getFFmpegPath();
    ffmpeg.setFfmpegPath(ffmpegBin);

    // Pass 1: aggressive multi-stage FFmpeg denoise
    // highpass removes rumble, lowpass removes hiss, afftdn with high noise-floor,
    // anlmdn for non-local means denoise, speechnorm normalises speech dynamics
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioFilters([
          'highpass=f=80',
          'lowpass=f=12000',
          'afftdn=nf=-25:nt=w:om=o:tr=1:nr=10',
          'anlmdn=s=0.00015:p=0.002:r=0.002:m=15',
          'afftdn=nf=-30:nt=w:om=o:tr=1',
          'speechnorm=e=25:r=0.0001:l=1',
        ])
        .audioCodec('pcm_s16le')
        .toFormat('wav')
        .on('start', () => emit(15, 'Running Pass 1 (FFmpeg)...'))
        .on('progress', (progress) => {
          if (progress.percent) {
            emit(15 + Math.round(progress.percent * 0.20), `Pass 1: ${Math.round(progress.percent)}%`);
          }
        })
        .on('error', reject)
        .on('end', resolve)
        .save(pass1Path);
    });

    emit(38, 'Pass 1 complete. Checking AI engine...');

    let pythonPath = null;
    let usePass2 = false;

    try {
      pythonPath = await ensurePython((msg) => sender.send('denoise-install-progress', msg));
      await ensureDeepFilterNet(pythonPath, (msg) => sender.send('denoise-install-progress', msg));
      saveInstallCache(pythonPath);
      usePass2 = true;
    } catch (err) {
      console.error('Pass 2 initialization failed:', err);
      emit(45, `AI Denoise setup failed: ${err.message}. Falling back to Pass 1...`);
    }

    let finalAudioPath = pass1Path;

    if (usePass2) {
      const dfOutputDir = path.join(tempDir, 'df_out');
      fs.mkdirSync(dfOutputDir, { recursive: true });

      emit(50, 'Running Pass 2 (AI Noise removal)...');
      try {
        await execPromise(`"${pythonPath}" -m df.enhance -o "${dfOutputDir}" "${pass1Path}"`);
        
        const files = fs.readdirSync(dfOutputDir);
        if (files.length > 0) {
          finalAudioPath = path.join(dfOutputDir, files[0]);
          emit(75, 'Pass 2 complete. Finalizing output...');
        } else {
          throw new Error('DeepFilterNet completed but no files were found in the output directory.');
        }
      } catch (err) {
        console.error('DeepFilterNet run failed:', err);
        emit(75, `AI Denoise execution failed: ${err.message}. Falling back to Pass 1 output...`);
      }
    }

    // Pass 3: additional FFmpeg spectral + dynamic cleanup on DeepFilterNet output
    const pass3Path = path.join(tempDir, 'pass3.wav');
    try {
      emit(76, 'Running Pass 3 (final spectral cleanup)...');
      await new Promise((resolve, reject) => {
        ffmpeg(finalAudioPath)
          .noVideo()
          .audioFilters([
            'afftdn=nf=-45:nt=w:om=o:tr=1',
            'anlmdn=s=0.0002:p=0.003:r=0.003:m=20',
            'dynaudnorm=g=5:p=0.9:m=100:r=0',
            'loudnorm=I=-16:TP=-1.5:LRA=11',
          ])
          .audioCodec('pcm_s16le')
          .toFormat('wav')
          .on('progress', (progress) => {
            if (progress.percent) emit(76 + Math.round(progress.percent * 0.05), `Pass 3: ${Math.round(progress.percent)}%`);
          })
          .on('error', (e) => { console.error('Pass 3 error:', e.message); resolve(); }) // non-fatal
          .on('end', () => { finalAudioPath = pass3Path; resolve(); })
          .save(pass3Path);
      });
    } catch (err) {
      console.error('Pass 3 failed (non-fatal):', err.message);
    }

    // Finalize: Mux (video) or Convert (audio)
    if (isVideo) {
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(inputPath)
          .input(finalAudioPath)
          .outputOptions([
            '-map 0:v:0',
            '-map 1:a:0',
            '-c:v copy',
            '-c:a aac',
            '-shortest',
            '-y'
          ])
          .on('start', () => emit(80, 'Muxing denoised audio with original video...'))
          .on('progress', (progress) => {
            if (progress.percent) {
              emit(80 + Math.round(progress.percent * 0.15), `Muxing: ${Math.round(progress.percent)}%`);
            }
          })
          .on('error', reject)
          .on('end', resolve)
          .save(outputPath);
      });
    } else {
      const targetExt = path.extname(outputPath).slice(1);
      await new Promise((resolve, reject) => {
        const cmd = ffmpeg(finalAudioPath);
        
        if (targetExt === 'mp3') {
          cmd.audioCodec('libmp3lame').audioBitrate('320k');
        } else if (targetExt === 'wav') {
          cmd.audioCodec('pcm_s16le');
        } else if (targetExt === 'flac') {
          cmd.audioCodec('flac');
        } else if (targetExt === 'aac') {
          cmd.audioCodec('aac');
        } else if (targetExt === 'ogg') {
          cmd.audioCodec('libvorbis');
        } else if (targetExt === 'opus') {
          cmd.audioCodec('libopus');
        }

        cmd
          .on('start', () => emit(80, `Converting audio to ${targetExt.toUpperCase()}...`))
          .on('progress', (progress) => {
            if (progress.percent) {
              emit(80 + Math.round(progress.percent * 0.15), `Converting: ${Math.round(progress.percent)}%`);
            }
          })
          .on('error', reject)
          .on('end', resolve)
          .save(outputPath);
      });
    }

    emit(100, 'Done!');
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Failed to cleanup temp dir:', e);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  NEW CONVERTERS v1.9.0
// ═════════════════════════════════════════════════════════════════════════════

// ── Image Upscaling ───────────────────────────────────────────────────────────
async function upscaleImage(input, output, scaleMode, emit) {
  const sharp = r('sharp');
  const meta = await sharp(input, { failOnError: false }).metadata();
  const scale = scaleMode === 'upscale4x' ? 4 : 2;
  const newW = Math.round((meta.width || 512) * scale);
  const newH = Math.round((meta.height || 512) * scale);

  emit(20, `Upscaling ${scale}x: ${meta.width}×${meta.height} → ${newW}×${newH}…`);

  const ext = path.extname(input).toLowerCase().slice(1);
  let pipeline = sharp(input, { failOnError: false })
    .rotate()
    .resize(newW, newH, { kernel: 'lanczos3', fastShrinkOnLoad: false })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 2, x1: 2, y2: 10, y3: 20 });

  emit(60, 'Saving upscaled image…');
  if (ext === 'jpg' || ext === 'jpeg') {
    await pipeline.jpeg({ quality: 97, mozjpeg: true }).toFile(output);
  } else if (ext === 'webp') {
    await pipeline.webp({ quality: 97 }).toFile(output);
  } else {
    await pipeline.png({ compressionLevel: 2 }).toFile(output);
  }
  emit(90, 'Finalizing…');
}

// ── Code File Converter ───────────────────────────────────────────────────────
async function convertCode(input, output, format, options, emit) {
  const content = fs.readFileSync(input, 'utf-8');
  const ext     = path.extname(input).toLowerCase().slice(1);
  const lang    = ext;
  emit(20, `Processing ${ext.toUpperCase()} file…`);

  const LANG_NAMES = {
    c:'C', cpp:'C++', py:'Python', rs:'Rust', jl:'Julia', kt:'Kotlin',
    nim:'Nim', dart:'Dart', go:'Go', java:'Java', js:'JavaScript',
    ts:'TypeScript', h:'C Header', hpp:'C++ Header', cs:'C#', rb:'Ruby',
    php:'PHP', swift:'Swift', sh:'Shell', bat:'Batch', ps1:'PowerShell',
    r:'R', lua:'Lua', sql:'SQL', jar:'Java Archive',
  };
  const langName = LANG_NAMES[ext] || ext.toUpperCase();

  if (format === 'txt') {
    fs.writeFileSync(output, content, 'utf-8');

  } else if (format === 'html') {
    const highlighted = escHtml(content);
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${escHtml(path.basename(input))}</title>
<style>
  body{background:#1e1e2e;color:#cdd6f4;margin:0;font-family:monospace;}
  .header{background:#181825;padding:12px 20px;border-bottom:1px solid #313244;display:flex;align-items:center;gap:10px;}
  .badge{background:#89b4fa;color:#1e1e2e;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;}
  pre{margin:0;padding:24px;line-height:1.6;font-size:14px;overflow-x:auto;}
  .lineno{color:#6c7086;user-select:none;margin-right:16px;display:inline-block;min-width:3ch;text-align:right;}
</style></head>
<body>
<div class="header"><span class="badge">${langName}</span><span>${escHtml(path.basename(input))}</span></div>
<pre>${highlighted.split('\n').map((l,i)=>`<span class="lineno">${i+1}</span>${l}`).join('\n')}</pre>
</body></html>`;
    fs.writeFileSync(output, html, 'utf-8');

  } else if (format === 'pdf') {
    const highlighted = escHtml(content);
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{background:#fff;font-family:'Courier New',monospace;font-size:10pt;margin:20px;}
  h2{font-family:Arial,sans-serif;font-size:14pt;margin-bottom:8px;}
  pre{white-space:pre-wrap;word-break:break-all;line-height:1.5;}
  .ln{color:#aaa;margin-right:12px;user-select:none;}
</style></head>
<body>
<h2>${escHtml(langName)}: ${escHtml(path.basename(input))}</h2>
<pre>${highlighted.split('\n').map((l,i)=>`<span class="ln">${String(i+1).padStart(4,' ')}</span>${l}`).join('\n')}</pre>
</body></html>`;
    emit(50, 'Rendering PDF…');
    await htmlToPdf(html, output);

  } else {
    throw new Error(`Code conversion to ${format} is not supported.`);
  }
  emit(90, 'Finalizing…');
}

// ── PPTX Converter ────────────────────────────────────────────────────────────
async function convertPptx(input, output, format, options, emit) {
  emit(15, 'Reading PPTX…');
  const StreamZip = r('node-stream-zip');
  const { XMLParser } = r('fast-xml-parser');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

  const zip = new StreamZip.async({ file: input });
  const entries = await zip.entries();

  // Find slide files
  const slideFiles = Object.keys(entries)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || '0');
      const nb = parseInt(b.match(/\d+/)?.[0] || '0');
      return na - nb;
    });

  emit(25, `Found ${slideFiles.length} slide(s)…`);

  // Extract text from each slide
  const slides = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xmlBuf = await zip.entryData(slideFiles[i]);
    const xmlStr = xmlBuf.toString('utf-8');
    const parsed = parser.parse(xmlStr);

    // Recursively extract all <a:t> text nodes
    const texts = [];
    function extractText(obj) {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, val] of Object.entries(obj)) {
        if (key === 'a:t') {
          if (typeof val === 'string' && val.trim()) texts.push(val.trim());
          else if (typeof val === 'object' && val['#text']) texts.push(String(val['#text']).trim());
          else if (Array.isArray(val)) val.forEach(v => { if (typeof v === 'string' && v.trim()) texts.push(v.trim()); });
        } else {
          if (Array.isArray(val)) val.forEach(v => extractText(v));
          else extractText(val);
        }
      }
    }
    extractText(parsed);
    slides.push({ num: i + 1, texts });
    emit(25 + Math.round((i / slideFiles.length) * 30), `Processing slide ${i + 1}/${slideFiles.length}…`);
  }
  await zip.close();

  if (format === 'txt') {
    const lines = slides.map(s => `--- Slide ${s.num} ---\n${s.texts.join('\n')}`);
    fs.writeFileSync(output, lines.join('\n\n'), 'utf-8');

  } else if (format === 'md') {
    const lines = slides.map(s => `## Slide ${s.num}\n\n${s.texts.join('\n\n')}`);
    fs.writeFileSync(output, `# ${path.basename(input, path.extname(input))}\n\n${lines.join('\n\n---\n\n')}`, 'utf-8');

  } else if (format === 'html') {
    const slideHtml = slides.map(s =>
      `<div class="slide"><div class="slide-num">Slide ${s.num}</div>${s.texts.map(t => `<p>${escHtml(t)}</p>`).join('')}</div>`
    ).join('\n');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;background:#f5f5f5;}
.slide{background:#fff;border-radius:8px;padding:32px;margin:20px 0;box-shadow:0 2px 8px rgba(0,0,0,.1);}
.slide-num{font-size:12px;color:#999;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;}
p{margin:8px 0;line-height:1.6;font-size:15px;}
h1{text-align:center;color:#333;}
</style></head><body>
<h1>${escHtml(path.basename(input, path.extname(input)))}</h1>
${slideHtml}
</body></html>`;
    fs.writeFileSync(output, html, 'utf-8');

  } else if (format === 'pdf') {
    const slideHtml = slides.map(s =>
      `<div class="slide"><div class="slide-num">Slide ${s.num}</div>${s.texts.map(t => `<p>${escHtml(t)}</p>`).join('')}</div>`
    ).join('\n');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;margin:20px;line-height:1.6;}
.slide{page-break-after:always;border:1px solid #ddd;padding:20px;margin-bottom:20px;}
.slide-num{font-size:10px;color:#999;margin-bottom:8px;text-transform:uppercase;}
</style></head><body>${slideHtml}</body></html>`;
    emit(60, 'Rendering PDF…');
    await htmlToPdf(html, output);

  } else {
    throw new Error(`PPTX → ${format} is not supported.`);
  }
  emit(90, 'Finalizing…');
}

// ── PDF to Images ─────────────────────────────────────────────────────────────
async function pdfToImages(input, outputDir, emit) {
  emit(10, 'Loading PDF…');
  const puppeteer = r('puppeteer');
  const { PDFDocument } = r('pdf-lib');
  const pdfBytes = fs.readFileSync(input);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  emit(15, `PDF has ${pageCount} page(s). Rendering…`);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    for (let i = 0; i < pageCount; i++) {
      emit(15 + Math.round((i / pageCount) * 75), `Rendering page ${i + 1}/${pageCount}…`);
      // Extract single page PDF
      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(pdfDoc, [i]);
      singleDoc.addPage(copiedPage);
      const singleBytes = await singleDoc.save();
      const tmpPdf = path.join(outputDir, `_tmp_page_${i}.pdf`);
      fs.writeFileSync(tmpPdf, singleBytes);

      const page = await browser.newPage();
      await page.goto(`file://${tmpPdf}`, { waitUntil: 'networkidle0', timeout: 15000 });
      await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
      const outImg = path.join(outputDir, `page_${String(i + 1).padStart(3, '0')}.png`);
      await page.screenshot({ path: outImg, fullPage: true });
      await page.close();
      try { fs.unlinkSync(tmpPdf); } catch {}
    }
  } finally {
    await browser.close();
  }
  emit(92, 'Finalizing…');
}

// ── Multi-Image → PDF ─────────────────────────────────────────────────────────
ipcMain.handle('images:toPdf', async (event, { imagePaths, outputPath }) => {
  const emit = (pct, msg) => event.sender.send('convert:progress', { percent: pct, message: msg });
  try {
    const { PDFDocument } = r('pdf-lib');
    const sharp = r('sharp');
    const pdfDoc = await PDFDocument.create();
    emit(5, `Combining ${imagePaths.length} image(s) into PDF…`);
    for (let i = 0; i < imagePaths.length; i++) {
      emit(5 + Math.round((i / imagePaths.length) * 85), `Embedding image ${i + 1}/${imagePaths.length}…`);
      const imgBuf = await sharp(imagePaths[i], { failOnError: false }).rotate().jpeg({ quality: 95 }).toBuffer();
      const jpgImg = await pdfDoc.embedJpg(imgBuf);
      const { width: iw, height: ih } = jpgImg.scale(1);
      const pageW = 595, pageH = 842, margin = 20;
      const maxW = pageW - margin * 2, maxH = pageH - margin * 2;
      const scale = Math.min(maxW / iw, maxH / ih, 1);
      const dw = iw * scale, dh = ih * scale;
      const pg = pdfDoc.addPage([pageW, pageH]);
      pg.drawImage(jpgImg, { x: (pageW - dw) / 2, y: (pageH - dh) / 2, width: dw, height: dh });
    }
    emit(92, 'Saving PDF…');
    fs.writeFileSync(outputPath, await pdfDoc.save());
    emit(100, 'Done!');
    return { success: true, outputPath, outputSize: fs.statSync(outputPath).size };
  } catch (err) {
    return { error: err.message };
  }
});

// ── Text-to-Speech (edge-tts via Python) ─────────────────────────────────────
async function ensureEdgeTts(pythonPath, emit) {
  emit('Checking edge-tts installation…');
  try {
    await execPromise(`"${pythonPath}" -c "import edge_tts; import pydub"`);
    return;
  } catch {
    emit('Installing edge-tts and pydub (first-time setup)…');
    await execPromise(`"${pythonPath}" -m pip install --no-cache-dir edge-tts pydub --no-warn-script-location`);
    await execPromise(`"${pythonPath}" -c "import edge_tts; import pydub"`);
  }
}

async function runTTS(inputPath, outputPath, emit, sender) {
  emit(5, 'Reading input text…');
  const text = fs.readFileSync(inputPath, 'utf-8').trim();
  if (!text) throw new Error('Input file is empty.');

  emit(10, 'Setting up Python environment…');
  const pythonPath = await ensurePython((msg) => sender.send('tts-install-progress', msg));
  await ensureEdgeTts(pythonPath, (msg) => sender.send('tts-install-progress', msg));

  // Write a temporary Python TTS script to disk
  const scriptPath = path.join(app.getPath('userData'), 'tts_run.py');
  const inputTmp   = path.join(app.getPath('userData'), 'tts_input.txt');
  fs.writeFileSync(inputTmp, text, 'utf-8');

  const ttsScript = `
import asyncio, edge_tts, tempfile, os, sys
from pydub import AudioSegment

VOICE = "en-US-ChristopherNeural"
RATE  = "+0%"
PITCH = "+0Hz"

async def run():
    input_path  = sys.argv[1]
    output_path = sys.argv[2]
    text = open(input_path, encoding="utf-8").read().strip()
    if not text:
        raise ValueError("Empty input")
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        tmp = f.name
    try:
        comm = edge_tts.Communicate(text, voice=VOICE, rate=RATE, pitch=PITCH)
        await comm.save(tmp)
        seg = AudioSegment.from_mp3(tmp)
        seg.normalize().export(output_path, format="mp3", bitrate="192k")
    finally:
        try: os.unlink(tmp)
        except: pass

asyncio.run(run())
`;
  fs.writeFileSync(scriptPath, ttsScript, 'utf-8');

  emit(30, 'Synthesising speech with edge-tts…');
  try {
    await execPromise(`"${pythonPath}" "${scriptPath}" "${inputTmp}" "${outputPath}"`);
  } finally {
    try { fs.unlinkSync(inputTmp); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
  emit(90, 'Finalizing…');
}

ipcMain.handle('file:tts', async (event, filePath) => {
  const dir  = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outputPath = path.join(dir, `${base}_speech.mp3`);
  const emit = (pct, msg) => event.sender.send('convert:progress', { percent: pct, message: msg });
  try {
    emit(0, 'Starting TTS…');
    await runTTS(filePath, outputPath, emit, event.sender);
    emit(100, 'Done!');
    return { success: true, outputPath, outputSize: fs.statSync(outputPath).size };
  } catch (err) {
    event.sender.send('convert:error', { message: err.message });
    return { error: err.message };
  }
});

ipcMain.on('tts-install-progress', () => {});
