# ◈ Vesper Convertor

> Local-first file conversion, download, and post-processing. 50+ formats. Zero uploads. Zero limits.

<p align="center">
  <img src="https://img.shields.io/badge/version-1.8.0-red?style=flat-square"/>
  <img src="https://img.shields.io/badge/license-MIT-red?style=flat-square"/>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square"/>
  <img src="https://img.shields.io/badge/built%20with-Electron-47848F?style=flat-square"/>
  <img src="https://img.shields.io/badge/AI-on--device-blueviolet?style=flat-square"/>
</p>

Vesper Convertor is a **free, open-source desktop app** that converts, downloads, and post-processes files completely locally — no cloud, no subscriptions, no file size caps, no account. Drop in a file, pick an output format, convert. That's it.

---

## ⬇️ Download

| Platform | File | Link |
|----------|------|------|
| 🪟 **Windows** | `.exe` installer (NSIS) | [**→ Releases**](https://github.com/AroseEditor/Vesper-Convertor/releases/latest) |
| 🍎 **macOS** | `.dmg` disk image | [**→ Releases**](https://github.com/AroseEditor/Vesper-Convertor/releases/latest) |
| 🐧 **Linux** | `.AppImage` (portable) | [**→ Releases**](https://github.com/AroseEditor/Vesper-Convertor/releases/latest) |

> No installation required for AppImage — just `chmod +x` and run.  
> Windows installer bundles everything. Double-click and go.

---

## ✨ Features at a Glance

### 🖼️ Image Conversion
- **Formats:** JPG · PNG · WebP · AVIF · GIF · TIFF · BMP · ICO · SVG
- Auto EXIF rotation — images never come out sideways
- Handles truncated or malformed images gracefully (`failOnError: false`)
- Quality presets: Lossless · High · Medium · Custom (manual slider)
- Resize by width/height with aspect-ratio awareness

### 🎬 Video Conversion
- **Formats:** MP4 · WebM · MOV · AVI · MKV · GIF · FLV · WMV
- H.264 + yuv420p + `-movflags +faststart` baked in for maximum compatibility
- Platform compatibility fix mode — rewraps and re-encodes for specific targets
- Extract audio from any video (MP3, WAV, FLAC, OGG, AAC, Opus)
- Framerate and resolution controls

### 🎵 Audio Conversion
- **Formats:** MP3 · WAV · FLAC · OGG · AAC · Opus
- Proper codec mapping per format (libmp3lame, pcm_s16le, flac, libvorbis, aac, libopus)
- Bitrate control

### 📄 Document Conversion
- **PDF:** → HTML · TXT · extract images · extract fonts · watermark
- **DOCX/DOC/ODT:** → PDF · HTML · TXT · extract images · extract text
- **HTML:** → PDF (via headless Puppeteer) · PNG screenshot
- **Markdown:** → HTML

### 📊 Data & Config
- **JSON ↔ CSV ↔ XML ↔ YAML ↔ TOML ↔ .env** — bidirectional, all combinations
- XLSX ↔ CSV · JSON · Excel
- Nested object auto-flattening for .env export

### 🗜️ Archives
- **ZIP, TAR, GZ** — compress and extract
- **Game archives:** `.pak` (Unreal 4/5) · `.rpf` (GTA V / RDR2) · `.wad` (Doom) · `.obb` (Android)

### 🔤 Fonts
- **TTF ↔ OTF** conversion via opentype.js
- Font metadata extraction (family, designer, glyph count, version, license)

### 🧊 3D Models
- **OBJ → GLB** · **GLB → OBJ** · **FBX → GLB**

---

## ⬇️ URL Download Mode

Click **"Want to download a link?"** below the dropzone to switch to download mode. Paste any URL and hit download.

### Supported Sources

| Source | Method | Formats |
|--------|--------|---------|
| **YouTube** | yt-dlp (auto-installed) | MP4 (1080p/720p/480p/360p/Best) · MP3 |
| **Spotify** | spotdl (auto-installed) | MP3 @ 320k |
| **Instagram** | yt-dlp | MP4 · MP3 |
| **TikTok** | yt-dlp | MP4 · MP3 |
| **Twitter / X** | yt-dlp | MP4 · MP3 |
| **Facebook** | yt-dlp | MP4 · MP3 |
| **Twitch** | yt-dlp | MP4 · MP3 |
| **Reddit** | yt-dlp | MP4 · MP3 |
| **Vimeo** | yt-dlp | MP4 · MP3 |
| **SoundCloud** | yt-dlp | MP3 |
| **Direct links** | Multi-threaded downloader | Any file type |

**Notes:**
- `yt-dlp` is downloaded automatically on first use — no manual setup needed.
- **Spotify** downloads work via `spotdl`, which is silently pip-installed on first use (uses the bundled Python if Python isn't on your system).
- Pasting a Spotify URL automatically locks the format picker to MP3.
- Direct link downloads support configurable parallel threads (1–16) for faster large-file downloads.
- Real-time progress shows percent, MB/s speed, and downloaded/total size.

---

## 🤖 AI & Post-Processing Features

### 🖼️ AI Background Removal
- Select any image → choose **"Remove BG"** from the dropdown
- On-device AI subject detection — uses ONNX/WASM (`@imgly/background-removal-node`), nothing leaves your machine
- **Mask editor** — paint/erase canvas overlay to refine edges:
  - 🖌️ **Brush** — paint areas to keep
  - 🧹 **Eraser** — remove from mask
  - Adjustable brush size (5–80px), crosshair cursor
- Output: `filename_removedbg.png` (transparent PNG)
- AI model (~50MB) downloads once on first use, then cached

### 🔊 AI Background Noise Removal (2-pass)
- Select any audio or video file → choose **"BG Noise Removal"** under Post Process
- **Pass 1 (DSP):** double `afftdn` + `anlmdn` + low-shelf equalizer via FFmpeg
- **Pass 2 (AI):** [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) speech enhancement model
- DeepFilterNet is silently auto-installed via pip on first use
- Falls back gracefully to Pass 1 if DeepFilterNet is unavailable
- Works on single files and bulk batches
- Output: `filename_denoised.ext`

### 📝 PDF Text Extraction + OCR
- Full text extraction page-by-page via `pdfjs`
- Where images exist in the PDF: `[Insert Image Here]` placeholder is inserted
- **OCR for images** — Tesseract.js extracts text from JPG, PNG, WebP, BMP, TIFF, GIF, AVIF
- pdf-lib fallback parser for encrypted/complex layouts

### 🔖 PDF Watermark
- Diagonal text watermark stamped across every page
- Adjustable opacity (0.00–1.00, default 0.15)
- Custom watermark text input
- Output: `filename_watermarked.pdf`

---

## 📦 Bulk Mode

- Drop **multiple files** at once for batch conversion
- Right-click the dropzone → multi-file selection dialog
- Common output formats computed from intersection of all files' supported formats
- Per-file progress reporting and individual success/failure history entries
- Works with all conversion types including noise removal and watermarking

## 📋 Clipboard Paste

- **Ctrl+V** to paste files directly into the app
- Works with files copied from Explorer and screenshots from clipboard
- Clipboard images are saved to temp and loaded automatically

---

## ⚙️ Settings

Open with the **⚙ gear icon** in the title bar:

| Setting | Description |
|---------|-------------|
| Download Threads | Parallel connections for direct link downloads (1–16) |
| yt-dlp Quality | Default video quality: Best · 1080p · 720p · 480p · 360p · Audio Only |

---

## 🛠️ Tech Stack

| Library | Purpose |
|---------|---------|
| [Electron](https://electronjs.org) | Desktop shell |
| [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) + [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) | Video / audio processing |
| [sharp](https://sharp.pixelplumbing.com) | Image conversion |
| [pdf-lib](https://pdf-lib.js.org) | PDF manipulation & watermarking |
| [pdfjs-dist](https://mozilla.github.io/pdf.js/) | PDF text extraction |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX → HTML/TXT |
| [puppeteer](https://pptr.dev) | HTML → PDF / PNG |
| [tesseract.js](https://tesseract.projectnaptha.com/) | OCR for images |
| [@imgly/background-removal-node](https://github.com/imgly/background-removal-node) | AI background removal |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Video/audio downloading |
| [spotdl](https://github.com/spotDL/spotify-downloader) | Spotify downloading |
| [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | AI noise removal |
| [file-type](https://github.com/sindresorhus/file-type) | Magic byte file detection |
| [opentype.js](https://opentype.js.org/) | Font conversion |
| [node-stream-zip](https://github.com/antelle/node-stream-zip) | Archive handling |

---

## 🚀 Run from Source

```bash
git clone https://github.com/AroseEditor/Vesper-Convertor.git
cd Vesper-Convertor
npm install --legacy-peer-deps
npm start
```

## 🏗️ Build

```bash
# Windows installer (.exe)
npx electron-builder --win nsis

# macOS DMG
npx electron-builder --mac dmg

# Linux AppImage
npx electron-builder --linux AppImage
```

Output goes to `dist/`. A `build-release.bat` is included for Windows convenience.

### GitHub Actions

A unified **release workflow** (`.github/workflows/release.yml`) builds all three platforms in parallel, auto-extracts the version from `package.json`, parses the matching section from `updates.md` as release notes, and drafts a GitHub Release. Trigger it manually from the Actions tab.

---

## 🤝 Contributing

PRs welcome. Open an issue first for major changes.

1. Fork the repo
2. Create your branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add: my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📜 Changelog

See [updates.md](./updates.md) for the full version history.

---

## 📄 License

MIT © [Arose Editor](https://github.com/AroseEditor)

If this saved you time, you can support development via UPI — DM on Discord: **ayush.ue5**
