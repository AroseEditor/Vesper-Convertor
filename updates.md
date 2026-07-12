# Contrary Convertor — Updates

## v1.11.0 (July 12, 2026)

### Cursor → PNG (.cur / .ani)
- Convert Windows cursors to transparent PNGs — the cursor mask is decoded so the background comes out fully transparent
- Every size embedded in the cursor is exported (e.g. `arrow_128bit.png`, `arrow_64bit.png`, `arrow_32bit.png`)
- All PNGs are saved into a subfolder named after the cursor
- Animated cursors (`.ani`) export one PNG per frame (`arrow_frame01_64bit.png`, …)
- Handles 32/24/8/4/1-bit cursor images and cursors that embed PNGs directly

## v1.10.1 (June 30, 2026)

### Per-Platform Cookies (fix: cookies now persist)
- Cookies are now saved **separately per platform** (Instagram, YouTube, TikTok, etc.) instead of one shared file
- Fixes the bug where pasting YouTube cookies wiped Instagram's (and vice-versa), so they appeared to "not save"
- Each site keeps its own saved login and reuses it automatically on the next download — no re-pasting
- The cookies popup now appears for **any** platform that hits a login error (YouTube, TikTok, etc.), not just Instagram, and names the actual site
- Instagram cookies are no longer sent to YouTube requests, which was causing extra errors

## v1.10.0 (June 30, 2026)

### Instagram / Login-Gated Downloads (cookies.txt)
- Fixes Instagram's "sent an empty media response" error — these sites now require a logged-in session
- When a download fails because the site needs login, a popup explains the fix and lets you paste your `cookies.txt`
- One-click link to the free "Get cookies.txt LOCALLY" browser extension with step-by-step instructions
- After pasting once, cookies are saved and reused automatically for all future downloads (Instagram, etc.)
- The failed download retries instantly with your login — no need to re-enter the URL
- Cookies never leave your PC; nothing is uploaded

## v1.9.1 (June 30, 2026)

### yt-dlp Auto-Refresh (bug fix)
- Fixed the "Your yt-dlp version is older than 90 days!" warning during YouTube/media downloads
- yt-dlp was downloaded once and cached forever, so the binary went stale and would eventually fail downloads
- The app now auto-updates yt-dlp when the local binary is older than 14 days, before the next download
- Atomic swap (temp file + rename) so an interrupted update can never corrupt a working binary
- Offline-safe: if the refresh can't reach the network, it falls back to the existing binary

## v1.9.0 (May 28, 2026)

### Photo(s) → PDF / PDF → Photos
- Convert any image (JPG, PNG, WEBP, BMP, TIFF, GIF, AVIF, HEIC) directly to a PDF page (embedded into A4 via pdf-lib)
- Export PDF pages back to individual PNG images — one image per page, rendered via Puppeteer
- Multi-image → single PDF: combine multiple photos into one PDF document

### Windows Context Menu Integration
- Installer registers "Convert with Contrary Convertor" in the Windows right-click menu for all file types
- Opening a file via context menu automatically loads it in the app ready for conversion
- Uninstaller cleanly removes the registry entries

### Extended Archive Support (7zip-bin)
- Full read/write for: ZIP, RAR, 7Z, TAR, TGZ, TBZ2, TXZ, BZ2, XZ, GZ
- Extract-to-folder for all formats
- Cross-format conversion (e.g. RAR → ZIP, 7Z → TAR)

### Programming Language Files (new "code" category)
- Supported: C, C++, Python, Rust, Julia, Kotlin, Nim, Dart, Go, Java, JavaScript, TypeScript, JAR, CSS, PHP, Ruby, Swift, Scala, Haskell, Lua, R, MATLAB, Perl, Shell, Batch, PowerShell, TOML, INI, CONF, LOG
- Convert to PDF (syntax-highlighted via Puppeteer), HTML (dark theme), or TXT

### Text-to-Speech (TTS)
- Convert any text/code/document to MP3 using Microsoft Edge TTS (en-US-ChristopherNeural voice)
- Auto-installs `edge-tts` and `pydub` on first use via Python
- 192k bitrate MP3 output with normalization
- Works on: TXT, MD, HTML, RTF, CSV, YAML, JSON, TOML, XML, and all code file types

### Image Upscaling (2× / 4×)
- Upscale any image 2× or 4× using sharp's Lanczos3 high-quality resampling
- Non-destructive: saves as new file alongside the original

### PPTX Conversions
- PPTX → PDF, HTML, TXT, MD
- No LibreOffice required — text extracted via native XML parsing

### Expanded Markdown Output
- PDF → MD, DOCX → MD, PPTX → MD, HTML → MD, TXT → MD
- DOCX uses mammoth + turndown for clean Markdown from Word documents

### Noise Removal — 3-Pass Pipeline
- Pass 1: 6-filter FFmpeg chain: highpass → lowpass → afftdn (nr=35 nf=-25) → anlmdn → speechnorm
- Pass 2: DeepFilterNet AI (unchanged)
- New Pass 3: post-AI cleanup — afftdn + anlmdn + dynaudnorm + loudnorm for broadcast-ready output

### Internal / Build
- New npm dependencies: `7zip-bin`, `node-7z`, `marked`, `pptxgenjs`, `turndown`
- `build/installer.nsh` rewritten with context menu hooks and clean uninstall

---

## v1.8.0 (May 28, 2026)

### 🎵 YouTube MP3 Fix
- Fixed **"invalid merge output format"** error when downloading YouTube videos as MP3
- Root cause: `--merge-output-format mp3` is invalid — ffmpeg can only merge into container formats
- Fix: switched to `--extract-audio --audio-format mp3 --audio-quality 0` for audio downloads (VBR best)
- Added `--ffmpeg-location` flag so yt-dlp uses the app-bundled ffmpeg binary reliably

### 🎧 Spotify Download Support
- Paste any Spotify track, album, or playlist URL and download as **MP3 @ 320k**
- Uses **spotdl** — auto-installed silently via pip on first use (leverages the existing Python auto-installer)
- Format picker auto-locks to MP3 when a Spotify URL is detected
- UI badge shows `Spotify • via spotdl • MP3 • 320k` on paste
- Works for tracks, albums, playlists, and artist pages

---

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
