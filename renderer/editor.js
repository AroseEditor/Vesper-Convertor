'use strict';

/* ============================================================================
   Vesper — Layer-based Photo Editor
   Self-contained canvas editor: layers, brush/eraser/shapes/text/fill,
   adjustments, filters, undo/redo, PNG export. Runs entirely on the client.
============================================================================ */
(function () {
  const $ = id => document.getElementById(id);
  const shell = $('editor-shell');
  if (!shell) return;

  const view = $('ed-canvas');
  const vctx = view.getContext('2d');
  const wrap = $('ed-canvas-wrap');
  const emptyMsg = $('ed-empty');

  let W = 900, H = 560;
  let layers = [];         // { id, name, canvas, visible, opacity }
  let activeId = null;
  let uid = 1;

  const state = {
    tool: 'brush',
    size: 12,
    opacity: 1,
    color: '#a855f7',
  };

  // Undo/redo — full snapshots (layer bitmaps + structure), capped.
  let undoStack = [], redoStack = [];
  const MAX_UNDO = 20;

  function activeLayer() { return layers.find(l => l.id === activeId); }

  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function addLayer(name, fromImage) {
    const c = newCanvas(W, H);
    if (fromImage) c.getContext('2d').drawImage(fromImage, 0, 0, W, H);
    const layer = { id: uid++, name: name || `Layer ${layers.length + 1}`, canvas: c, visible: true, opacity: 1 };
    layers.push(layer);
    activeId = layer.id;
    return layer;
  }

  function setSize(w, h) {
    W = w; H = h;
    view.width = W; view.height = H;
  }

  /* ---------- Compositing ---------- */
  function composite() {
    vctx.clearRect(0, 0, W, H);
    // checkerboard so transparency is visible
    const s = 12;
    for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
      vctx.fillStyle = ((x / s + y / s) % 2 === 0) ? '#1a0a22' : '#120618';
      vctx.fillRect(x, y, s, s);
    }
    layers.forEach(l => {
      if (!l.visible) return;
      vctx.globalAlpha = l.opacity;
      vctx.drawImage(l.canvas, 0, 0);
    });
    vctx.globalAlpha = 1;
  }

  /* ---------- Undo / redo ---------- */
  function snapshot() {
    redoStack = [];
    undoStack.push({
      W, H, activeId,
      layers: layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, data: l.canvas.toDataURL() })),
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }
  function restore(snap) {
    setSize(snap.W, snap.H);
    activeId = snap.activeId;
    let pending = snap.layers.length;
    if (!pending) { layers = []; composite(); renderLayers(); return; }
    const rebuilt = [];
    snap.layers.forEach((ls, idx) => {
      const c = newCanvas(snap.W, snap.H);
      const img = new Image();
      img.onload = () => {
        c.getContext('2d').drawImage(img, 0, 0);
        if (--pending === 0) { layers = rebuilt; composite(); renderLayers(); }
      };
      img.src = ls.data;
      rebuilt[idx] = { id: ls.id, name: ls.name, canvas: c, visible: ls.visible, opacity: ls.opacity };
    });
  }
  function undo() { if (!undoStack.length) return; redoStack.push(currentSnap()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(currentSnap()); restore(redoStack.pop()); }
  function currentSnap() {
    return { W, H, activeId, layers: layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, data: l.canvas.toDataURL() })) };
  }

  /* ---------- Layers UI ---------- */
  const layersUl = $('ed-layers');
  function renderLayers() {
    layersUl.innerHTML = '';
    [...layers].reverse().forEach(l => {
      const li = document.createElement('li');
      li.className = 'ed-layer' + (l.id === activeId ? ' active' : '');
      li.innerHTML = `<button class="ed-vis" title="Toggle">${l.visible ? '👁' : '—'}</button><span class="ed-layer-name">${l.name}</span>`;
      li.querySelector('.ed-vis').addEventListener('click', (e) => { e.stopPropagation(); l.visible = !l.visible; composite(); renderLayers(); });
      li.addEventListener('click', () => { activeId = l.id; syncLayerOpacity(); renderLayers(); });
      layersUl.appendChild(li);
    });
    emptyMsg.style.display = layers.length ? 'none' : 'flex';
  }
  function syncLayerOpacity() {
    const l = activeLayer(); if (!l) return;
    $('ed-layer-opacity').value = Math.round(l.opacity * 100);
    $('ed-layer-opacity-val').textContent = Math.round(l.opacity * 100) + '%';
  }

  /* ---------- Load image / new ---------- */
  function loadImageFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => {
        snapshot();
        const maxW = 1400, maxH = 900;
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, maxW / w, maxH / h);
        setSize(Math.round(w * scale), Math.round(h * scale));
        layers = []; uid = 1;
        addLayer('Background', img);
        composite(); renderLayers(); syncLayerOpacity();
      };
      img.src = URL.createObjectURL(f);
    };
    inp.click();
  }
  function newCanvasBlank() {
    snapshot();
    setSize(900, 560);
    layers = []; uid = 1;
    const l = addLayer('Background');
    l.canvas.getContext('2d').fillStyle = '#ffffff';
    l.canvas.getContext('2d').fillRect(0, 0, W, H);
    composite(); renderLayers(); syncLayerOpacity();
  }

  /* ---------- Drawing ---------- */
  let drawing = false, startX = 0, startY = 0, lastX = 0, lastY = 0;
  let overlay = null; // temp canvas for shape preview

  function canvasPos(e) {
    const r = view.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  function strokeStyle(ctx) {
    ctx.lineWidth = state.size;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = state.color; ctx.fillStyle = state.color;
    ctx.globalAlpha = state.opacity;
  }

  view.addEventListener('pointerdown', (e) => {
    const l = activeLayer(); if (!l) return;
    const p = canvasPos(e);
    drawing = true; startX = lastX = p.x; startY = lastY = p.y;
    const ctx = l.canvas.getContext('2d');

    if (state.tool === 'brush' || state.tool === 'eraser') {
      snapshot();
      ctx.globalCompositeOperation = state.tool === 'eraser' ? 'destination-out' : 'source-over';
      strokeStyle(ctx);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
      composite();
    } else if (state.tool === 'fill') {
      snapshot();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = state.opacity; ctx.fillStyle = state.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1; composite(); drawing = false;
    } else if (state.tool === 'text') {
      const t = prompt('Text:'); drawing = false;
      if (t) { snapshot(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = state.opacity; ctx.fillStyle = state.color; ctx.font = `${Math.max(12, state.size * 2)}px Outfit, sans-serif`; ctx.textBaseline = 'top'; ctx.fillText(t, p.x, p.y); ctx.globalAlpha = 1; composite(); }
    } else {
      // shapes — use an overlay for live preview
      snapshot();
      overlay = newCanvas(W, H);
    }
    view.setPointerCapture(e.pointerId);
  });

  view.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const l = activeLayer(); if (!l) return;
    const p = canvasPos(e);
    const ctx = l.canvas.getContext('2d');

    if (state.tool === 'brush' || state.tool === 'eraser') {
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
      lastX = p.x; lastY = p.y; composite();
    } else if (overlay) {
      // preview shape on composite
      composite();
      vctx.save();
      strokeStyle(vctx);
      drawShape(vctx, state.tool, startX, startY, p.x, p.y);
      vctx.restore();
    }
  });

  view.addEventListener('pointerup', (e) => {
    if (!drawing) { return; }
    const l = activeLayer();
    const p = canvasPos(e);
    if (overlay && l) {
      const ctx = l.canvas.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      strokeStyle(ctx);
      drawShape(ctx, state.tool, startX, startY, p.x, p.y);
      ctx.globalAlpha = 1;
      overlay = null; composite();
    }
    if (l) l.canvas.getContext('2d').globalAlpha = 1;
    drawing = false;
  });

  function drawShape(ctx, tool, x0, y0, x1, y1) {
    ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    else if (tool === 'rect') { ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    else if (tool === 'ellipse') { ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
  }

  /* ---------- Adjustments / filters ---------- */
  function applyFilterToLayer(filterStr) {
    const l = activeLayer(); if (!l) return;
    snapshot();
    const tmp = newCanvas(W, H);
    const tctx = tmp.getContext('2d');
    tctx.filter = filterStr;
    tctx.drawImage(l.canvas, 0, 0);
    const lc = l.canvas.getContext('2d');
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, W, H);
    lc.filter = 'none';
    lc.drawImage(tmp, 0, 0);
    composite();
  }
  function applyAdjust() {
    const b = 100 + parseInt($('ed-brightness').value);
    const c = 100 + parseInt($('ed-contrast').value);
    const s = 100 + parseInt($('ed-saturation').value);
    applyFilterToLayer(`brightness(${b}%) contrast(${c}%) saturate(${s}%)`);
    ['ed-brightness', 'ed-contrast', 'ed-saturation'].forEach(id => { $(id).value = 0; $(id + '-val').textContent = '0'; });
  }

  /* ---------- Export ---------- */
  async function exportPng() {
    if (!layers.length) return;
    const flat = newCanvas(W, H);
    const fctx = flat.getContext('2d');
    layers.forEach(l => { if (l.visible) { fctx.globalAlpha = l.opacity; fctx.drawImage(l.canvas, 0, 0); } });
    fctx.globalAlpha = 1;
    const dataUrl = flat.toDataURL('image/png');
    if (window.electronAPI && window.electronAPI.editorExport) {
      const res = await window.electronAPI.editorExport({ dataUrl });
      if (res && res.outputPath) { /* saved */ }
    } else {
      const a = document.createElement('a'); a.href = dataUrl; a.download = 'vesper-edit.png'; a.click();
    }
  }

  /* ---------- Wire controls ---------- */
  document.querySelectorAll('.ed-tool').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.ed-tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tool = btn.dataset.tool;
  }));
  $('ed-size').addEventListener('input', (e) => { state.size = parseInt(e.target.value); $('ed-size-val').textContent = e.target.value; });
  $('ed-opacity').addEventListener('input', (e) => { state.opacity = parseInt(e.target.value) / 100; $('ed-opacity-val').textContent = e.target.value + '%'; });
  $('ed-color').addEventListener('input', (e) => { state.color = e.target.value; });

  $('ed-open').addEventListener('click', loadImageFile);
  $('ed-new').addEventListener('click', newCanvasBlank);
  $('ed-undo').addEventListener('click', undo);
  $('ed-redo').addEventListener('click', redo);
  $('ed-export').addEventListener('click', exportPng);

  $('ed-add-layer').addEventListener('click', () => { if (!layers.length) { newCanvasBlank(); return; } snapshot(); addLayer(); composite(); renderLayers(); syncLayerOpacity(); });
  $('ed-layer-del').addEventListener('click', () => { if (layers.length <= 0) return; snapshot(); layers = layers.filter(l => l.id !== activeId); activeId = layers.length ? layers[layers.length - 1].id : null; composite(); renderLayers(); syncLayerOpacity(); });
  $('ed-layer-up').addEventListener('click', () => moveLayer(1));
  $('ed-layer-down').addEventListener('click', () => moveLayer(-1));
  function moveLayer(dir) {
    const i = layers.findIndex(l => l.id === activeId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layers.length) return;
    snapshot();
    [layers[i], layers[j]] = [layers[j], layers[i]];
    composite(); renderLayers();
  }
  $('ed-layer-opacity').addEventListener('input', (e) => { const l = activeLayer(); if (!l) return; l.opacity = parseInt(e.target.value) / 100; $('ed-layer-opacity-val').textContent = e.target.value + '%'; composite(); });

  ['brightness', 'contrast', 'saturation'].forEach(k => $('ed-' + k).addEventListener('input', (e) => { $('ed-' + k + '-val').textContent = e.target.value; }));
  $('ed-apply-adjust').addEventListener('click', applyAdjust);
  document.querySelectorAll('.ed-filters .ed-chip').forEach(btn => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    const map = { grayscale: 'grayscale(1)', invert: 'invert(1)', sepia: 'sepia(1)', blur: 'blur(2px)' };
    applyFilterToLayer(map[f] || 'none');
  }));

  // Keyboard shortcuts (only when the editor tab is active)
  document.addEventListener('keydown', (e) => {
    const editorActive = $('tab-editor') && $('tab-editor').classList.contains('active');
    if (!editorActive) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (e.key === 'b') selectTool('brush');
    else if (e.key === 'e') selectTool('eraser');
  });
  function selectTool(t) {
    const btn = document.querySelector(`.ed-tool[data-tool="${t}"]`);
    if (btn) btn.click();
  }

  // Initialise a blank canvas view (checkerboard) until the user opens something.
  composite();
  renderLayers();
})();
