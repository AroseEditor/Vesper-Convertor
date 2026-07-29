# Vesper Convertor

A local file toolkit built on Electron. It converts, downloads, edits, and runs on-device AI over your files, and none of it leaves your machine. No account, no server round-trip, no size cap. Drop a file in, pick a tool, run it.

## Run from source

```bash
git clone https://github.com/AroseEditor/Vesper-Convertor.git
cd Vesper-Convertor
npm install --legacy-peer-deps
npm start
```

Prebuilt installers live on the [releases page](https://github.com/AroseEditor/Vesper-Convertor/releases/latest): an NSIS `.exe` for Windows, a `.dmg` for macOS, and a portable `.AppImage` for Linux (`chmod +x` and run).

## Architecture

The usual Electron three-process split, with a deliberate trust boundary:

- `main.js` — the main process. Every bit of file I/O, transcoding, downloading, and AI inference runs here. It's a single large module that owns the `ipcMain` handlers.
- `preload.js` — a `contextBridge` that exposes one fixed object (`window.electronAPI`) to the page. `contextIsolation` is on and `nodeIntegration` is off, so the renderer can only call the channels listed in preload. It has no direct Node access.
- `renderer/` — plain HTML, CSS, and vanilla JS, no framework. Split into `catalog.js` (tab nav + the tool grid), `app.js` (the convert/download engine), `editor.js` (the photo editor), `pipelines.js`, and `i18n.js`.

Detection runs first. `file:detect` reads the magic bytes with `file-type` and falls back to the extension when there's no signature (cursors, for example, share `.ico`'s magic, so those get pinned by extension). The detected category chooses the converter.

## Conversion

Two dispatch paths, depending on whether the tool is a format change or an operation.

`file:convert` handles "turn X into Y". It routes by category:

| Category | Engine | Notes |
|---|---|---|
| Image | `sharp` | EXIF auto-rotate, `failOnError:false` so truncated files still decode, quality presets, resize |
| Video | `ffmpeg-static` via `fluent-ffmpeg` | H.264 + `yuv420p` + `+faststart` by default; a platform-fix mode re-encodes to caps that WhatsApp/Instagram/YouTube accept |
| Audio | ffmpeg | per-format codec mapping (`libmp3lame`, `pcm_s16le`, `flac`, `libvorbis`, `aac`, `libopus`) |
| Document | `pdf-lib`, `pdf-parse`, `mammoth`, `puppeteer` | PDF text/image/font extraction, DOCX and PPTX to PDF/HTML/MD, HTML to PDF via headless Chromium |
| Data | `csv-parse`, `fast-xml-parser`, `js-yaml`, `@iarna/toml`, `xlsx` | JSON/CSV/XML/YAML/TOML/.env in any direction, Excel in and out |
| Archive | `archiver`, `node-stream-zip`, `7zip-bin` | zip/7z/tar plus read-only extractors for Unreal `.pak`, GTA `.rpf`, Doom `.wad` |
| 3D | `obj2gltf` | OBJ, GLB, FBX between each other |
| Font | `opentype.js` | TTF and OTF, with metadata read-out |
| Cursor | in-repo decoder | `.cur`/`.ani` to transparent PNG; parses the ICO directory and the DIB (32/24/8/4/1-bpp) with the AND mask applied |

`tool:op` handles operations that aren't a format change — crop, trim, merge, split, page numbers, normalize, and so on. It takes a list of files and an options object and runs one function per operation, which keeps single-file and multi-file (merge) tools on the same path. The renderer builds each tool's option form from a small schema, and crop/resize/trim get real interactive UI instead of number fields: a drag box over the image or video for crop and resize, and a dual-handle timeline with a live preview for trimming.

## Pipelines

`pipeline:run` chains single-file operations. Each step's output feeds the next, and the whole chain runs once per input file, so you can batch "resize to 1080, watermark, compress" across a folder. Pipelines export and import as JSON.

## Downloading

`download:start` picks a backend by URL:

- yt-dlp for YouTube, Instagram, TikTok, X, Facebook, Twitch, Reddit, Vimeo, SoundCloud. The binary is fetched on first use and re-fetched when it's older than 14 days, because a stale yt-dlp is the usual cause of extractor breakage. Login-gated sites (Instagram especially) trigger a prompt for a `cookies.txt`, which is saved per platform and reused.
- spotdl for Spotify, pip-installed on first use against a located or bundled Python.
- a multi-threaded HTTP downloader (1-16 connections) for direct links.

## On-device AI

Nothing here calls out to a hosted model. Heavy dependencies install on first use and cache, so the installer stays small:

- Background removal — ONNX/WASM subject detection with a paint/erase mask editor for cleanup.
- Upscaling — Real-ESRGAN (`realesrgan-ncnn-vulkan`), downloaded and unzipped on first run. It synthesizes detail rather than interpolating. On a machine without a usable Vulkan device it falls back to a Lanczos resize so the tool never hard-fails.
- OCR — Tesseract for images, and for image-only PDF pages.
- Speech to text — `faster-whisper` (base model, int8, CPU). Transcribes audio and auto-generates SRT subtitles from video.
- Noise removal — a DSP pass in ffmpeg followed by DeepFilterNet, with the DSP result as a fallback.
- Text to speech — Microsoft `edge-tts`.
- Colorize, restore, enhance, and face blur — OpenCV. Colorize is the Zhang et al. Caffe model run through OpenCV's DNN module; restore is denoise plus CLAHE plus an unsharp pass; face blur uses a Haar cascade.

The Python-backed tools share one installer that finds a system Python or drops in an embeddable build, then pip-installs what each tool needs.

## Photo Editor

A layer-based canvas editor that runs in the renderer. Layers with visibility, opacity, and reordering; move, brush, eraser, line, rectangle, ellipse, fill, and text tools; brightness/contrast/saturation adjustments and grayscale/invert/sepia/blur filters applied per layer; undo/redo with full snapshots; and PNG export through a native save dialog.

## Languages

21 languages are selectable in Settings, with right-to-left layout for Arabic. The chrome (navigation and section titles) is translated for a starter set and falls back to English for the rest; the string tables are in `renderer/i18n.js` and take new entries directly.

## Updates

A small updater polls the GitHub Releases API, compares the tag against `package.json`, and offers a one-click download and install of the platform asset. It's a custom flow, not `electron-updater`.

## Build

```bash
npx electron-builder --win nsis
npx electron-builder --mac dmg
npx electron-builder --linux AppImage
```

Output lands in `dist/`. `build-release.bat` wraps the Windows build. The release workflow under `.github/workflows/` builds all three targets, reads the version from `package.json`, and pulls the matching section of `updates.md` for the release notes.

## Contributing

Open an issue before a large change. Otherwise: fork, branch, commit, push, open a PR.

## License

MIT, Arose Editor. If it saved you time, you can reach me on Discord at `ayush.ue5`.
