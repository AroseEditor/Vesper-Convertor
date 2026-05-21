# Contrary Convertor — Updates

## v1.7.0 (May 22, 2026)

### 🔊 AI & DSP Background Noise Removal
- New **BG Noise Removal (2-pass AI+FFmpeg)** post-processing option for audio and video files.
- **Pass 1 (DSP):** Uses a double `afftdn`, `anlmdn`, and low-shelf `equalizer` filter chain in FFmpeg.
- **Pass 2 (AI):** Uses DeepFilterNet AI network for advanced speech enhancement and noise reduction.
- **Silent Auto-Installer:** Lazily installs Python 3.11 embeddable package and DeepFilterNet on Windows on first run (cached for future uses).
- **Graceful Fallbacks:** Non-Windows platforms or environments without DeepFilterNet support fall back to the optimized Pass 1 DSP filters.
- Supports single and bulk conversions, saving output as `<name>_denoised.<ext>`.

---

## v1.6.0 (April 30, 2026)

### 🔖 PDF Watermark
- New **Watermark PDF** conversion option — appears when input is a PDF
- Customizable watermark text via text input
- Opacity slider (0.00–1.00, default 0.15) for subtle or bold stamps
- Text is drawn diagonally across the center of every page, auto-scaled to page size
- Output saved as `filename_watermarked.pdf` in the same directory
- Uses pdf-lib for fast, dependency-free PDF manipulation

---

## v1.5.2 (April 30, 2026)

### 🐛 Critical Fix — Conversion ENOENT crash
- Fixed `spawn ffmpeg.exe ENOENT` error that broke all video, audio, and image conversions in packaged builds
- Root cause: `ffmpeg-static` resolved to a path inside `app.asar`, but OS cannot spawn executables from asar archives
- Added `getFFmpegPath()` helper that swaps `app.asar` → `app.asar.unpacked` for the ffmpeg binary path
- All 4 ffmpeg consumers patched: probeMedia, fixForPlatform, convertVideo, convertAudio

---

## v1.5.0 (April 28, 2026)

### 📋 Clipboard Paste Support
- **Ctrl+V** to paste files directly into the app
- Works with copied files from Explorer and screenshots/images from clipboard
- Clipboard images are saved to temp dir and loaded automatically

### 📦 Bulk Operations
- **Drop multiple files** at once for batch conversion
- **Right-click** the dropzone to open multi-file selection dialog
- All files are processed sequentially with per-file progress reporting
- Common output formats are computed from the intersection of all files' supported formats
- Each result (success/failure) is individually tracked in history

### 🎵 Video → Audio Extraction
- Videos can now be converted to **WAV, OGG, FLAC, AAC, OPUS** (not just MP3)
- Full codec support: pcm_s24le for WAV, libvorbis for OGG, flac for FLAC, aac for AAC, libopus for OPUS
- Proper format containers for each audio type

### 🔍 OCR for Images
- Already built-in via **extract-text** format for images
- Uses **Tesseract.js** for OCR on JPG, PNG, WebP, BMP, TIFF, GIF, AVIF
- Real-time OCR progress reporting

---

## v1.4.0 (April 28, 2026)

### 🔧 PDF Text Extraction — Complete Rewrite
- **All text is now extracted** from PDFs using page-by-page `getTextContent()` via pdfjs
- **Image placeholders**: Where images exist in the PDF, `[Insert Image Here]` is inserted in the output
- Image detection uses the PDF operator list (paintImageXObject/paintJpegXObject ops)
- Removed OCR dependency — pure text extraction, no Tesseract needed
- Added **pdf-lib fallback** parser that reads raw PDF content streams (Tj/TJ operators) if pdf-parse fails
- Works on all PDFs including encrypted/complex layouts

### 🎬 Video Conversion — Fixed
- Added explicit `.format()` calls for every output container (mp4, mkv, mov, webm, avi, gif, mp3)
- Added **FLV** and **WMV** output format support
- Added `-y` overwrite flag to prevent ffmpeg hanging on existing files
- Added `-pix_fmt yuv420p` and even-dimension padding for H.264 compatibility
- Added `-movflags +faststart` for MP4 web streaming
- Better error messages on ffmpeg failures
- Added fallback encoder path for unknown formats

### 🖼️ Image Conversion — Hardened
- Added `failOnError: false` to sharp — handles truncated/broken images gracefully
- Added auto EXIF rotation via `.rotate()` — images no longer appear rotated after conversion

### 🎵 Audio Conversion — Fixed
- Added `-y` overwrite flag to prevent ffmpeg hanging

---

# Contrary Convertor — Updates (April 13, 2026)

## 🎨 UI Overhaul
- Complete redesign with **red + black gradient** aesthetic
- **CRT scanline overlay** with animated scroll effect
- **Glitch animation** on logo text
- **Matrix binary text** background in dropzone
- **Monospace typography** (`Share Tech Mono`) across all UI
- Pulsing red glow on logo hexagon

## 📂 Searchable Format Dropdown
- Replaced format selection chips with a **single searchable dropdown**
- Formats grouped by category: Image, Video, Audio, Data/Config, 3D, Extraction, Fix
- Type to filter, scroll to browse — keyboard navigation support

## 🔧 New Conversion Formats

### Fonts
- **TTF ↔ OTF** conversion via opentype.js
- Font metadata extraction (family, glyphs, version, designer, license)

### Dev / Config
- **JSON ↔ YAML ↔ TOML ↔ .env** bidirectional conversion
- Auto-flattening for nested objects → .env keys

### 3D Models
- **OBJ → GLB** (via obj2gltf)
- **GLB → OBJ** (custom mesh parser with vertex + face extraction)
- **FBX → GLB** (via fbx2gltf binary, if available)

### Game Archives
- **.pak** — Unreal Engine 4 (v1–v4) and UE5 (v11+) extraction
- **.rpf** — Rockstar RAGE (GTA V / RDR2) best-effort extraction
- **.wad** — Doom IWAD/PWAD lump extraction
- **.obb** — Android OBB (ZIP-based) extraction

### Text / OCR Extraction
- **Extract text** from PDF, DOCX, XLSX, HTML, and any text file
- **OCR from images** — JPG, PNG, WebP, BMP, TIFF via Tesseract.js
- **Extract images from PDF** — renders each page as PNG
- **Extract fonts from PDF** — lists font names + extracts embedded TTF/OTF files

### PDF Improvements
- PDF → TXT now uses pdf-parse for actual text extraction (with pdf-lib fallback)

## ⚙️ Settings Panel
- **Gear icon** (⚙) in top-right titlebar
- Slide-in panel showing:
  - **Developer**: Ayush.ue5
  - **GitHub**: github.com/AroseEditor/ (hyperlink, opens in browser)
  - **Download Threads** slider (1–16 parallel connections)
  - **yt-dlp Quality** preset (Best/Lossless, 1080p, 720p, 480p, 360p, Audio Only)

## ⬇️ URL Download Mode
- **"Want to download a link?"** clickable text below dropzone
- Switches UI to **URL input bar** — paste any link and download
- **Source detection** — shows badges identifying the source (YouTube, Instagram, Telegram, etc.), download method (yt-dlp / Direct), and quality preset
- Supported sources via **yt-dlp** (auto-downloaded on first use):
  - YouTube, Instagram, TikTok, Twitter/X, Facebook, Telegram, Twitch, Reddit, Vimeo, SoundCloud
- **Direct link downloads** — multi-threaded with configurable parallel connections
- **Progress display** — real-time percent, MB/s speed, downloaded/total bytes
- **Cancel** button to abort any download
- Quality presets applied to yt-dlp: lossless, 1080p, 720p, 480p, 360p, audio-only
- Output format: MP4 for video, MP3 for audio-only

## 🖼️ AI Background Removal
- Drop any image → select **"REMOVE-BG — AI background removal"** from the format dropdown
- **Auto-detects** subjects using on-device AI (ONNX/WASM via @imgly/background-removal-node)
- **Paint/Erase mask editor** with canvas overlay:
  - 🖌️ **Brush** — paint over areas to keep
  - 🧹 **Eraser** — erase areas from mask
  - Adjustable **brush size** slider (5–80px)
  - Crosshair cursor when painting on canvas
- **Apply & Save** button — loading animation while processing
- Saves as `originalname_removedbg.png` (transparent PNG)
- AI model downloads ~50MB on first use (cached after)

## 🔧 Auto-Install Dependencies (No Manual Setup)
- **No more "Install Node.js"** error — app auto-downloads **portable Node.js** (~30MB) on first launch
- Downloads from nodejs.org to `%APPDATA%/contra-conv/portable-node/`
- Uses that portable npm to install all conversion libraries
- Cached — only downloads once, reused on all future launches
- `isFirstLaunch.txt` flag tracks installation state (True = installed, False/missing = install)

## 🏗️ Build & Packaging
- GitHub Actions workflow for macOS builds (DMG)
- Linux AppImage build support
- All new dependencies added to package.json
