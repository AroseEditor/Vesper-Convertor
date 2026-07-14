'use strict';

/* ============================================================================
   Vesper — Tab navigation + Tool catalog + Workspace shell
   Loads BEFORE app.js. Exposes window.VesperUI for app.js to drive the
   catalog→workspace transitions. All conversion logic still lives in app.js.
============================================================================ */
(function () {
  const $ = id => document.getElementById(id);

  /* ---------- Category icons (inline SVG) ---------- */
  const I = {
    image:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.7"/><path d="M4 16l5-5 5 5 3-3 3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    video:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="5" width="14" height="14" rx="3"/><path d="M16.5 9.5l5-2.5v10l-5-2.5z" stroke-linejoin="round"/></svg>',
    audio:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
    pdf:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="M8 14h1.5a1.5 1.5 0 0 1 0 3H8v-3zm0 0v6" stroke-linecap="round"/></svg>',
    data:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
    archive:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4" stroke-linecap="round"/></svg>',
    '3d':   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2l9 5v10l-9 5-9-5V7z" stroke-linejoin="round"/><path d="M12 12l9-5M12 12v10M12 12L3 7" stroke-linejoin="round"/></svg>',
    font:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 20l5-14 5 14M7 15h6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 20h4" stroke-linecap="round"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 3l14 8-6 1.5L10 19z" stroke-linejoin="round"/></svg>',
    ai:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" stroke-linejoin="round"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" stroke-linejoin="round"/></svg>',
  };

  /* ---------- Categories ---------- */
  const CATS = [
    { id: 'all',     label: 'All' },
    { id: 'image',   label: 'Image' },
    { id: 'video',   label: 'Video' },
    { id: 'audio',   label: 'Audio' },
    { id: 'pdf',     label: 'PDF & Docs' },
    { id: 'data',    label: 'Data & Files' },
    { id: 'archive', label: 'Archive' },
    { id: '3d',      label: '3D' },
    { id: 'font',    label: 'Font' },
    { id: 'cursor',  label: 'Cursor' },
    { id: 'ai',      label: 'AI' },
  ];

  /* ---------- Tool catalog ----------
     op = the target format/operation to auto-select once a file is loaded.
     op:null = a generic converter (user picks the output format after upload). */
  const TOOLS = [
    // Image
    { id: 'img-convert', cat: 'image', op: null,        label: 'Convert Image',     desc: 'Any image to any format' },
    { id: 'img-png',     cat: 'image', op: 'png',       label: 'Image → PNG',       desc: 'Lossless transparency' },
    { id: 'img-jpg',     cat: 'image', op: 'jpg',       label: 'Image → JPG',       desc: 'Small, universal' },
    { id: 'img-webp',    cat: 'image', op: 'webp',      label: 'Image → WebP',      desc: 'Modern web format' },
    { id: 'img-avif',    cat: 'image', op: 'avif',      label: 'Image → AVIF',      desc: 'Next-gen compression' },
    { id: 'img-gif',     cat: 'image', op: 'gif',       label: 'Image → GIF',       desc: 'Simple animation' },
    { id: 'img-tiff',    cat: 'image', op: 'tiff',      label: 'Image → TIFF',      desc: 'Print-grade' },
    { id: 'img-bmp',     cat: 'image', op: 'bmp',       label: 'Image → BMP',       desc: 'Raw bitmap' },
    { id: 'img-ico',     cat: 'image', op: 'ico',       label: 'Image → ICO',       desc: 'Windows icon' },
    { id: 'img-pdf',     cat: 'image', op: 'pdf',       label: 'Image → PDF',       desc: 'Embed on an A4 page' },

    // Video
    { id: 'vid-convert', cat: 'video', op: null,        label: 'Convert Video',     desc: 'Any video to any format' },
    { id: 'vid-mp4',     cat: 'video', op: 'mp4',       label: 'Video → MP4',       desc: 'H.264, max compatibility' },
    { id: 'vid-webm',    cat: 'video', op: 'webm',      label: 'Video → WebM',      desc: 'Open web video' },
    { id: 'vid-mov',     cat: 'video', op: 'mov',       label: 'Video → MOV',       desc: 'QuickTime' },
    { id: 'vid-mkv',     cat: 'video', op: 'mkv',       label: 'Video → MKV',       desc: 'Matroska container' },
    { id: 'vid-gif',     cat: 'video', op: 'gif',       label: 'Video → GIF',       desc: 'Clip to animated GIF' },
    { id: 'vid-audio',   cat: 'video', op: 'mp3',       label: 'Extract Audio',     desc: 'Pull MP3 from video' },
    { id: 'vid-fix',     cat: 'video', op: 'fix',       label: 'Fix for Platform',  desc: 'WhatsApp / IG / YouTube' },

    // Audio
    { id: 'aud-convert', cat: 'audio', op: null,        label: 'Convert Audio',     desc: 'Any audio to any format' },
    { id: 'aud-mp3',     cat: 'audio', op: 'mp3',       label: 'Audio → MP3',       desc: 'Universal audio' },
    { id: 'aud-wav',     cat: 'audio', op: 'wav',       label: 'Audio → WAV',       desc: 'Uncompressed PCM' },
    { id: 'aud-flac',    cat: 'audio', op: 'flac',      label: 'Audio → FLAC',      desc: 'Lossless compression' },
    { id: 'aud-ogg',     cat: 'audio', op: 'ogg',       label: 'Audio → OGG',       desc: 'Open Vorbis' },
    { id: 'aud-aac',     cat: 'audio', op: 'aac',       label: 'Audio → AAC',       desc: 'Efficient, modern' },
    { id: 'aud-opus',    cat: 'audio', op: 'opus',      label: 'Audio → Opus',      desc: 'Best low-bitrate' },

    // PDF & Docs
    { id: 'pdf-images',  cat: 'pdf', op: 'images',        label: 'PDF → Images',      desc: 'One PNG per page' },
    { id: 'pdf-text',    cat: 'pdf', op: 'extract-text',  label: 'PDF → Text',        desc: 'Extract text (OCR opt.)' },
    { id: 'pdf-html',    cat: 'pdf', op: 'html',          label: 'PDF → HTML',        desc: 'Web page' },
    { id: 'pdf-md',      cat: 'pdf', op: 'md',            label: 'PDF → Markdown',    desc: 'Clean markdown' },
    { id: 'pdf-imgs',    cat: 'pdf', op: 'extract-images',label: 'Extract Images',    desc: 'Pull embedded images' },
    { id: 'pdf-fonts',   cat: 'pdf', op: 'extract-fonts', label: 'Extract Fonts',     desc: 'Pull embedded fonts' },
    { id: 'pdf-wm',      cat: 'pdf', op: 'watermark-pdf',  label: 'Watermark PDF',     desc: 'Diagonal text stamp' },
    { id: 'doc-convert', cat: 'pdf', op: null,            label: 'Convert Document',  desc: 'DOCX / PPTX → PDF, etc.' },

    // Data & Files
    { id: 'data-json',   cat: 'data', op: 'json',   label: 'Convert to JSON', desc: 'From CSV/XML/YAML/TOML' },
    { id: 'data-csv',    cat: 'data', op: 'csv',    label: 'Convert to CSV',  desc: 'From JSON/Excel/XML' },
    { id: 'data-xml',    cat: 'data', op: 'xml',    label: 'Convert to XML',  desc: 'Structured markup' },
    { id: 'data-yaml',   cat: 'data', op: 'yaml',   label: 'Convert to YAML', desc: 'Human-friendly config' },
    { id: 'data-toml',   cat: 'data', op: 'toml',   label: 'Convert to TOML', desc: 'Config format' },
    { id: 'data-xlsx',   cat: 'data', op: 'xlsx',   label: 'Convert to Excel',desc: 'Spreadsheet' },
    { id: 'code-convert',cat: 'data', op: null,     label: 'Convert Code',    desc: 'Source → PDF / HTML / TXT' },

    // Archive
    { id: 'arc-extract', cat: 'archive', op: 'extract', label: 'Extract Archive', desc: 'ZIP/7Z/RAR/TAR → folder' },
    { id: 'arc-zip',     cat: 'archive', op: 'zip',     label: 'Create ZIP',      desc: 'Repackage as ZIP' },
    { id: 'arc-7z',      cat: 'archive', op: '7z',      label: 'Create 7Z',       desc: 'High compression' },
    { id: 'arc-tar',     cat: 'archive', op: 'tar',     label: 'Create TAR',      desc: 'Tarball' },

    // 3D
    { id: '3d-glb',      cat: '3d', op: 'glb',  label: '3D → GLB',  desc: 'Binary glTF' },
    { id: '3d-obj',      cat: '3d', op: 'obj',  label: '3D → OBJ',  desc: 'Wavefront mesh' },
    { id: '3d-fbx',      cat: '3d', op: 'fbx',  label: '3D → FBX',  desc: 'Autodesk format' },

    // Font
    { id: 'font-ttf',    cat: 'font', op: 'ttf', label: 'Font → TTF', desc: 'TrueType' },
    { id: 'font-otf',    cat: 'font', op: 'otf', label: 'Font → OTF', desc: 'OpenType' },

    // Cursor
    { id: 'cur-png',     cat: 'cursor', op: 'png', label: 'Cursor → PNG', desc: '.cur / .ani to transparent PNGs' },

    // AI
    { id: 'ai-bg',       cat: 'ai', op: 'remove-bg',    label: 'Remove Background', desc: 'AI subject cut-out' },
    { id: 'ai-up2',      cat: 'ai', op: 'upscale2x',    label: 'Upscale 2×',        desc: 'Enlarge, keep detail' },
    { id: 'ai-up4',      cat: 'ai', op: 'upscale4x',    label: 'Upscale 4×',        desc: 'Big enlargement' },
    { id: 'ai-ocr',      cat: 'ai', op: 'extract-text', label: 'Extract Text (OCR)',desc: 'Read text from images/PDF' },
    { id: 'ai-denoise',  cat: 'ai', op: 'denoise',      label: 'Remove Noise',      desc: 'Clean audio/video hiss' },
    { id: 'ai-tts',      cat: 'ai', op: 'tts',          label: 'Text to Speech',    desc: 'Text/doc → spoken MP3' },

    /* ===== Operation tools (mode:'op') ===== */
    // Image
    { id: 'op-img-resize', cat: 'image', mode: 'op', op: 'img-resize', label: 'Resize Image', desc: 'Set width / height',
      options: [ { key: 'width', label: 'Width (px)', type: 'number', placeholder: 'auto' }, { key: 'height', label: 'Height (px)', type: 'number', placeholder: 'auto' } ] },
    { id: 'op-img-crop', cat: 'image', mode: 'op', op: 'img-crop', label: 'Crop Image', desc: 'Cut a rectangle',
      options: [ { key: 'x', label: 'X', type: 'number', def: 0 }, { key: 'y', label: 'Y', type: 'number', def: 0 }, { key: 'w', label: 'Width', type: 'number', placeholder: 'auto' }, { key: 'h', label: 'Height', type: 'number', placeholder: 'auto' } ] },
    { id: 'op-img-rotate', cat: 'image', mode: 'op', op: 'img-rotate', label: 'Rotate Image', desc: 'Turn 90/180/270°',
      options: [ { key: 'angle', label: 'Angle', type: 'select', choices: [ { v: 90, l: '90°' }, { v: 180, l: '180°' }, { v: 270, l: '270°' } ] } ] },
    { id: 'op-img-flip', cat: 'image', mode: 'op', op: 'img-flip', label: 'Flip Image', desc: 'Mirror H or V',
      options: [ { key: 'dir', label: 'Direction', type: 'select', choices: [ { v: 'h', l: 'Horizontal' }, { v: 'v', l: 'Vertical' } ] } ] },
    { id: 'op-img-gray', cat: 'image', mode: 'op', op: 'img-grayscale', label: 'Grayscale', desc: 'Convert to B&W', options: [] },
    { id: 'op-img-adjust', cat: 'image', mode: 'op', op: 'img-adjust', label: 'Color Adjust', desc: 'Brightness / saturation / hue',
      options: [ { key: 'brightness', label: 'Brightness', type: 'range', min: 0.2, max: 2, step: 0.05, def: 1 }, { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.05, def: 1 }, { key: 'hue', label: 'Hue shift°', type: 'range', min: 0, max: 360, step: 5, def: 0 } ] },
    { id: 'op-img-blur', cat: 'image', mode: 'op', op: 'img-blur', label: 'Blur Image', desc: 'Gaussian blur',
      options: [ { key: 'sigma', label: 'Amount', type: 'range', min: 0.3, max: 30, step: 0.3, def: 3 } ] },
    { id: 'op-img-compress', cat: 'image', mode: 'op', op: 'img-compress', label: 'Compress Image', desc: 'Shrink file size',
      options: [ { key: 'quality', label: 'Quality', type: 'range', min: 10, max: 100, step: 1, def: 70 } ] },

    // Audio
    { id: 'op-aud-trim', cat: 'audio', mode: 'op', op: 'aud-trim', label: 'Trim Audio', desc: 'Keep a time range',
      options: [ { key: 'start', label: 'Start (s)', type: 'number', def: 0 }, { key: 'end', label: 'End (s)', type: 'number', placeholder: 'e.g. 30' } ] },
    { id: 'op-aud-norm', cat: 'audio', mode: 'op', op: 'aud-normalize', label: 'Normalize Audio', desc: 'Even out loudness', options: [] },
    { id: 'op-aud-vol', cat: 'audio', mode: 'op', op: 'aud-volume', label: 'Change Volume', desc: 'Boost or reduce',
      options: [ { key: 'db', label: 'Gain (dB)', type: 'range', min: -30, max: 30, step: 1, def: 6 } ] },
    { id: 'op-aud-fade', cat: 'audio', mode: 'op', op: 'aud-fade', label: 'Fade In / Out', desc: 'Smooth start & end',
      options: [ { key: 'inSec', label: 'Fade in (s)', type: 'number', def: 2 }, { key: 'outSec', label: 'Fade out (s)', type: 'number', def: 2 } ] },
    { id: 'op-aud-pitch', cat: 'audio', mode: 'op', op: 'aud-pitch', label: 'Pitch Shift', desc: 'Up or down semitones',
      options: [ { key: 'semitones', label: 'Semitones', type: 'range', min: -12, max: 12, step: 1, def: 2 } ] },
    { id: 'op-aud-silence', cat: 'audio', mode: 'op', op: 'aud-silence', label: 'Remove Silence', desc: 'Trim quiet lead/tail', options: [] },
    { id: 'op-aud-reverse', cat: 'audio', mode: 'op', op: 'aud-reverse', label: 'Reverse Audio', desc: 'Play backwards', options: [] },

    // Video
    { id: 'op-vid-trim', cat: 'video', mode: 'op', op: 'vid-trim', label: 'Trim Video', desc: 'Keep a time range',
      options: [ { key: 'start', label: 'Start (s)', type: 'number', def: 0 }, { key: 'end', label: 'End (s)', type: 'number', placeholder: 'e.g. 30' } ] },
    { id: 'op-vid-crop', cat: 'video', mode: 'op', op: 'vid-crop', label: 'Crop Video', desc: 'Cut a rectangle',
      options: [ { key: 'w', label: 'Width', type: 'number', def: 640 }, { key: 'h', label: 'Height', type: 'number', def: 360 }, { key: 'x', label: 'X', type: 'number', def: 0 }, { key: 'y', label: 'Y', type: 'number', def: 0 } ] },
    { id: 'op-vid-mute', cat: 'video', mode: 'op', op: 'vid-mute', label: 'Mute Video', desc: 'Strip the audio', options: [] },
    { id: 'op-vid-reverse', cat: 'video', mode: 'op', op: 'vid-reverse', label: 'Reverse Video', desc: 'Play backwards', options: [] },

    // PDF
    { id: 'op-pdf-merge', cat: 'pdf', mode: 'op', op: 'pdf-merge', multi: true, label: 'Merge PDFs', desc: 'Combine several PDFs', options: [] },
    { id: 'op-pdf-split', cat: 'pdf', mode: 'op', op: 'pdf-split', label: 'Split PDF', desc: 'Each page → a file', options: [] },
    { id: 'op-pdf-rotate', cat: 'pdf', mode: 'op', op: 'pdf-rotate', label: 'Rotate PDF', desc: 'Turn every page',
      options: [ { key: 'angle', label: 'Angle', type: 'select', choices: [ { v: 90, l: '90°' }, { v: 180, l: '180°' }, { v: 270, l: '270°' } ] } ] },
    { id: 'op-pdf-numbers', cat: 'pdf', mode: 'op', op: 'pdf-numbers', label: 'Add Page Numbers', desc: 'Stamp N / total', options: [] },
    { id: 'op-pdf-delete', cat: 'pdf', mode: 'op', op: 'pdf-delete', label: 'Delete Pages', desc: 'Remove page numbers',
      options: [ { key: 'pages', label: 'Pages', type: 'text', placeholder: 'e.g. 1,3,5' } ] },

    // Files
    { id: 'op-csv-merge', cat: 'data', mode: 'op', op: 'csv-merge', multi: true, label: 'Merge CSVs', desc: 'Stack rows, one header', options: [] },

    /* ===== Batch 2 op-tools ===== */
    { id: 'op-img-watermark', cat: 'image', mode: 'op', op: 'img-watermark', label: 'Watermark Image', desc: 'Diagonal text stamp',
      options: [ { key: 'text', label: 'Text', type: 'text', placeholder: 'WATERMARK' }, { key: 'opacity', label: 'Opacity', type: 'range', min: 0.05, max: 1, step: 0.05, def: 0.35 } ] },
    { id: 'op-img-expand', cat: 'image', mode: 'op', op: 'img-expand', label: 'Expand Canvas', desc: 'Add a border',
      options: [ { key: 'pixels', label: 'Border (px)', type: 'number', def: 40 }, { key: 'color', label: 'Color', type: 'text', def: '#ffffff' } ] },
    { id: 'op-img-fixtrans', cat: 'image', mode: 'op', op: 'img-fixtransparency', label: 'Fix Transparency', desc: 'Clean alpha fringe', options: [] },
    { id: 'op-aud-merge', cat: 'audio', mode: 'op', op: 'aud-merge', multi: true, label: 'Merge Audio', desc: 'Join clips end-to-end', options: [] },
    { id: 'op-aud-split', cat: 'audio', mode: 'op', op: 'aud-split', label: 'Split Audio', desc: 'Into timed segments',
      options: [ { key: 'seconds', label: 'Segment (s)', type: 'number', def: 30 } ] },
    { id: 'op-aud-wave', cat: 'audio', mode: 'op', op: 'aud-waveform', label: 'Waveform Image', desc: 'Render a waveform PNG', options: [] },
    { id: 'op-vid-merge', cat: 'video', mode: 'op', op: 'vid-merge', multi: true, label: 'Merge Videos', desc: 'Join clips end-to-end', options: [] },
    { id: 'op-pdf-compress', cat: 'pdf', mode: 'op', op: 'pdf-compress', label: 'Compress PDF', desc: 'Slim down file size', options: [] },
    { id: 'op-csv-split', cat: 'data', mode: 'op', op: 'csv-split', label: 'Split CSV', desc: 'Into row chunks',
      options: [ { key: 'rows', label: 'Rows / file', type: 'number', def: 1000 } ] },

    /* ===== Local AI ===== */
    { id: 'ai-transcribe', cat: 'ai', mode: 'op', op: 'transcribe', label: 'Transcribe Audio', desc: 'Speech → subtitles (Whisper)', options: [] },
    { id: 'ai-subtitles', cat: 'ai', mode: 'op', op: 'transcribe', label: 'Video Subtitles', desc: 'Auto-generate an SRT', options: [] },
    { id: 'ai-faceblur', cat: 'ai', mode: 'op', op: 'faceblur', label: 'Blur Faces', desc: 'Auto-detect & blur', options: [] },
    { id: 'ai-expand', cat: 'ai', mode: 'op', op: 'img-expand', label: 'Expand Canvas', desc: 'Add space around image',
      options: [ { key: 'pixels', label: 'Border (px)', type: 'number', def: 60 }, { key: 'color', label: 'Color', type: 'text', def: '#ffffff' } ] },
    { id: 'ai-fixtrans', cat: 'ai', mode: 'op', op: 'img-fixtransparency', label: 'Fix Transparency', desc: 'Clean alpha edges', options: [] },
    { id: 'ai-colorize', cat: 'ai', mode: 'op', op: 'colorize', label: 'Colorize Photo', desc: 'AI color for B&W photos', options: [] },

    /* ===== Batch 3 op-tools ===== */
    { id: 'op-img-meme', cat: 'image', mode: 'op', op: 'img-meme', label: 'Meme Generator', desc: 'Top & bottom text',
      options: [ { key: 'top', label: 'Top text', type: 'text', placeholder: 'TOP TEXT' }, { key: 'bottom', label: 'Bottom text', type: 'text', placeholder: 'BOTTOM TEXT' } ] },
    { id: 'op-img-passport', cat: 'image', mode: 'op', op: 'img-passport', label: 'Passport Photo', desc: '2×2 in, white background', options: [] },
    { id: 'op-img-dupes', cat: 'image', mode: 'op', op: 'img-duplicates', multi: true, label: 'Find Duplicates', desc: 'Spot similar images', options: [] },
    { id: 'op-gif-frames', cat: 'video', mode: 'op', op: 'gif-frames', label: 'GIF / Video → Frames', desc: 'Export every frame as PNG', options: [] },
  ];

  /* ---------- Tab navigation ---------- */
  const navItems = [...document.querySelectorAll('.nav-item')];
  const panels = {
    tools:    $('tab-tools'),
    download: $('tab-download'),
    editor:   $('tab-editor'),
    settings: $('tab-settings'),
  };
  function switchTab(name) {
    navItems.forEach(n => n.classList.toggle('active', n.dataset.tab === name));
    Object.entries(panels).forEach(([k, el]) => { if (el) el.classList.toggle('active', k === name); });
  }
  navItems.forEach(n => n.addEventListener('click', () => switchTab(n.dataset.tab)));

  /* ---------- Catalog rendering ---------- */
  const catChips = $('cat-chips');
  const toolGrid = $('tool-grid');
  const toolSearch = $('tool-search');
  let activeCat = 'all';

  function renderChips() {
    catChips.innerHTML = '';
    CATS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'cat-chip' + (c.id === activeCat ? ' active' : '');
      b.textContent = c.label;
      b.addEventListener('click', () => { activeCat = c.id; renderChips(); renderGrid(); });
      catChips.appendChild(b);
    });
  }

  function renderGrid() {
    const q = (toolSearch.value || '').trim().toLowerCase();
    toolGrid.innerHTML = '';
    let i = 0;
    TOOLS.filter(t => (activeCat === 'all' || t.cat === activeCat))
         .filter(t => !q || (t.label + ' ' + t.desc + ' ' + t.cat).toLowerCase().includes(q))
         .forEach(t => {
      const card = document.createElement('button');
      card.className = 'tool-card';
      card.style.setProperty('--i', i++);
      card.innerHTML =
        `<span class="tool-card-icon cat-${t.cat}">${I[t.cat] || I.image}</span>` +
        `<span class="tool-card-body"><span class="tool-card-name">${t.label}</span>` +
        `<span class="tool-card-desc">${t.desc}</span></span>`;
      card.addEventListener('click', () => pickTool(t));
      toolGrid.appendChild(card);
    });
    if (!toolGrid.children.length) {
      toolGrid.innerHTML = '<div class="tool-grid-empty">No tools match your search.</div>';
    }
  }

  toolSearch.addEventListener('input', renderGrid);
  renderChips();
  renderGrid();

  /* ---------- Catalog ⇄ Workspace ---------- */
  const catalogView   = $('tools-catalog');
  const workspaceView = $('tools-workspace');
  const workspaceLabel = $('workspace-tool-label');
  const filePreviews  = $('file-previews');
  const opPanel   = $('op-panel');
  const opForm    = $('op-form');
  const opRunBtn  = $('op-run-btn');
  let activeTool = null;
  let opMode = false;

  function enterWorkspace(label) {
    if (label) workspaceLabel.textContent = label;
    else if (activeTool) workspaceLabel.textContent = activeTool.label;
    else workspaceLabel.textContent = 'Convert';
    switchTab('tools');
    catalogView.style.display = 'none';
    workspaceView.style.display = 'flex';
  }

  function showCatalog() {
    activeTool = null;
    opMode = false;
    filePreviews.style.display = 'none';
    filePreviews.innerHTML = '';
    workspaceView.style.display = 'none';
    catalogView.style.display = 'flex';
    if (typeof resetUI === 'function') resetUI(true);
  }

  function pickTool(tool) {
    activeTool = tool;
    opMode = (tool.mode === 'op');
    if (typeof resetUI === 'function') resetUI(true);
    filePreviews.style.display = 'none';
    filePreviews.innerHTML = '';
    enterWorkspace(tool.label);
    if (opMode) { renderOpForm(tool); showOpPanel(); }
  }

  function isOpMode() { return opMode; }

  // Build the dynamic options form for an operation tool.
  function renderOpForm(tool) {
    opForm.innerHTML = '';
    (tool.options || []).forEach(opt => {
      const row = document.createElement('div');
      row.className = 'op-row';
      const label = document.createElement('label');
      label.className = 'op-label';
      label.textContent = opt.label;
      let field;
      if (opt.type === 'select') {
        field = document.createElement('select');
        field.className = 'option-select';
        (opt.choices || []).forEach(c => {
          const o = document.createElement('option');
          o.value = c.v; o.textContent = c.l; field.appendChild(o);
        });
      } else if (opt.type === 'range') {
        field = document.createElement('input');
        field.type = 'range';
        field.min = opt.min; field.max = opt.max; field.step = opt.step || 1;
        field.value = (opt.def != null ? opt.def : opt.min);
        const val = document.createElement('span');
        val.className = 'op-range-val';
        val.textContent = field.value;
        field.addEventListener('input', () => { val.textContent = field.value; });
        field.dataset.key = opt.key;
        row.appendChild(label); row.appendChild(field); row.appendChild(val);
        opForm.appendChild(row);
        return;
      } else {
        field = document.createElement('input');
        field.type = (opt.type === 'number') ? 'number' : 'text';
        field.className = 'option-input';
        if (opt.placeholder) field.placeholder = opt.placeholder;
        if (opt.def != null) field.value = opt.def;
      }
      field.dataset.key = opt.key;
      row.appendChild(label); row.appendChild(field);
      opForm.appendChild(row);
    });
    if (!opForm.children.length) {
      opForm.innerHTML = '<p class="op-empty">No options — just add your file' + (tool.multi ? '(s)' : '') + ' and run.</p>';
    }
  }

  function showOpPanel() {
    if (!activeTool) return;
    if (!opForm.children.length) renderOpForm(activeTool);
    $('op-panel-title').textContent = activeTool.label;
    opPanel.style.display = 'flex';
  }

  function baseName(p) { return (p || '').split(/[\\/]/).pop(); }

  async function runOp() {
    const files = (typeof getWorkspaceFiles === 'function') ? getWorkspaceFiles() : [];
    if (!files.length) { setProgress(0, 'Add a file first'); show($('progress-section')); setTimeout(() => hide($('progress-section')), 1800); return; }
    const options = {};
    opForm.querySelectorAll('[data-key]').forEach(el => { options[el.dataset.key] = el.value; });

    const progressSection = $('progress-section');
    show(progressSection); setProgress(0, 'Starting…');
    opRunBtn.disabled = true;
    window.electronAPI.onProgress(({ percent, message }) => setProgress(percent, message));
    try {
      const result = await window.electronAPI.runTool({ op: activeTool.op, filePaths: files, options });
      window.electronAPI.removeProgressListener();
      if (result.error) {
        setProgress(0, '… ' + result.error.slice(0, 80));
        addHistory({ status: 'error', error: result.error, inputName: baseName(files[0]), outputName: '…' });
      } else {
        setProgress(100, 'Done!');
        if (typeof flashSuccess === 'function') flashSuccess();
        addHistory({
          status: 'success',
          inputName: baseName(files[0]) + (files.length > 1 ? ` +${files.length - 1}` : ''),
          outputName: baseName(result.outputPath),
          outputPath: result.outputPath, sizeBefore: 0, sizeAfter: result.outputSize,
        });
        setTimeout(() => hide(progressSection), 2500);
      }
    } catch (err) {
      window.electronAPI.removeProgressListener();
      setProgress(0, '… ' + (err.message || 'Failed').slice(0, 80));
    } finally {
      opRunBtn.disabled = false;
    }
  }
  opRunBtn.addEventListener('click', runOp);

  // Auto-select the tool's target format once a file's formats are rendered.
  function autoSelectFormat(op) {
    if (!op) return;
    const li = document.querySelector(`.format-option[data-format="${op}"]`);
    if (li) li.click();
  }

  // Multi-file preview strip. `list` is an array of file-info objects (from file:detect).
  function renderPreviews(list) {
    if (!list || list.length < 2) { filePreviews.style.display = 'none'; filePreviews.innerHTML = ''; return; }
    filePreviews.innerHTML = '';
    list.forEach(info => {
      const isImg = info.category === 'image' && /^(jpg|jpeg|png|webp|gif|bmp|tiff|tif|avif)$/i.test(info.ext || '');
      const chip = document.createElement('div');
      chip.className = 'file-preview';
      const thumb = isImg
        ? `<img class="file-preview-img" src="file://${encodeURI(info.path).replace(/#/g, '%23')}" alt="" loading="lazy"/>`
        : `<span class="file-preview-badge">${(info.ext || '?').toUpperCase().slice(0, 4)}</span>`;
      chip.innerHTML = `${thumb}<span class="file-preview-name" title="${info.name}">${info.name}</span>`;
      filePreviews.appendChild(chip);
    });
    filePreviews.style.display = 'flex';
  }

  /* ---------- Quick-drop banner (upload-first flow) ---------- */
  const quickDrop = $('quick-drop');
  function handlePaths(paths) {
    if (!paths || !paths.length) return;
    activeTool = null;
    opMode = false;
    enterWorkspace('Convert');
    if (paths.length > 1) { if (typeof enterBulkMode === 'function') enterBulkMode(paths); }
    else { if (typeof loadFile === 'function') loadFile(paths[0]); }
  }
  quickDrop.addEventListener('click', async () => {
    const paths = await window.electronAPI.openFilesDialog();
    handlePaths(paths);
  });
  quickDrop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); quickDrop.click(); } });
  quickDrop.addEventListener('dragover', (e) => { e.preventDefault(); quickDrop.classList.add('drag-over'); });
  quickDrop.addEventListener('dragleave', (e) => { if (!quickDrop.contains(e.relatedTarget)) quickDrop.classList.remove('drag-over'); });
  quickDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    quickDrop.classList.remove('drag-over');
    const paths = [...e.dataTransfer.files].map(f => f.path).filter(Boolean);
    handlePaths(paths);
  });

  /* ---------- Back / clear return to catalog ---------- */
  $('workspace-back').addEventListener('click', showCatalog);
  const clearBtn = $('file-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', showCatalog);

  /* ---------- Expose for app.js ---------- */
  window.VesperUI = {
    get activeTool() { return activeTool; },
    enterWorkspace,
    showCatalog,
    autoSelectFormat,
    renderPreviews,
    switchTab,
    isOpMode,
    showOpPanel,
  };
})();
