'use strict';

/* ============================================================================
   Vesper — Pipelines
   Chain single-file op-tools into a reusable workflow. Each step's output
   feeds the next; the whole chain runs across every chosen file. Import/export
   as JSON. Runs entirely locally via the pipeline:run IPC.
============================================================================ */
(function () {
  const $ = id => document.getElementById(id);
  const pipeView = $('tools-pipeline');
  if (!pipeView) return;
  const catalogView = $('tools-catalog');
  const workspaceView = $('tools-workspace');
  const stepsUl = $('pipe-steps');
  const addSelect = $('pipe-add-select');
  const statusEl = $('pipe-status');
  const filesLabel = $('pipe-files-label');

  let steps = [];   // { op, label, options, schema }
  let files = [];

  const opTools = () => (window.VesperUI && window.VesperUI.opTools) || [];

  function buildAddSelect() {
    opTools().forEach(t => {
      const o = document.createElement('option');
      o.value = t.op; o.textContent = t.label;
      addSelect.appendChild(o);
    });
  }

  function showPipe() { catalogView.style.display = 'none'; workspaceView.style.display = 'none'; pipeView.style.display = 'flex'; }
  function hidePipe() { pipeView.style.display = 'none'; catalogView.style.display = 'flex'; }

  function addStep(op) {
    const t = opTools().find(x => x.op === op);
    if (!t) return;
    const options = {};
    (t.options || []).forEach(o => { options[o.key] = (o.def != null ? o.def : ''); });
    steps.push({ op: t.op, label: t.label, options, schema: t.options || [] });
    renderSteps();
  }

  function renderSteps() {
    stepsUl.innerHTML = '';
    if (!steps.length) { stepsUl.innerHTML = '<li class="pipe-empty">No steps yet — add one above.</li>'; return; }
    steps.forEach((s, idx) => {
      const li = document.createElement('li');
      li.className = 'pipe-step';
      const head = document.createElement('div');
      head.className = 'pipe-step-head';
      head.innerHTML = `<span class="pipe-step-num">${idx + 1}</span><span class="pipe-step-name">${s.label}</span><span class="ed-spacer"></span><button class="ed-mini" data-act="up" title="Up">↑</button><button class="ed-mini" data-act="down" title="Down">↓</button><button class="ed-mini ed-danger" data-act="del" title="Remove">✕</button>`;
      const body = document.createElement('div');
      body.className = 'pipe-step-body';
      (s.schema || []).forEach(opt => {
        const row = document.createElement('div'); row.className = 'op-row';
        const lab = document.createElement('label'); lab.className = 'op-label'; lab.textContent = opt.label;
        let field;
        if (opt.type === 'select') {
          field = document.createElement('select'); field.className = 'option-select';
          (opt.choices || []).forEach(c => { const o = document.createElement('option'); o.value = c.v; o.textContent = c.l; field.appendChild(o); });
        } else {
          field = document.createElement('input');
          field.type = opt.type === 'number' ? 'number' : (opt.type === 'range' ? 'range' : 'text');
          field.className = 'option-input';
          if (opt.min != null) field.min = opt.min;
          if (opt.max != null) field.max = opt.max;
          if (opt.step != null) field.step = opt.step;
          if (opt.placeholder) field.placeholder = opt.placeholder;
        }
        field.value = (s.options[opt.key] != null ? s.options[opt.key] : (opt.def != null ? opt.def : ''));
        field.addEventListener('input', () => { s.options[opt.key] = field.value; });
        row.appendChild(lab); row.appendChild(field); body.appendChild(row);
      });
      head.querySelector('[data-act="del"]').addEventListener('click', () => { steps.splice(idx, 1); renderSteps(); });
      head.querySelector('[data-act="up"]').addEventListener('click', () => { if (idx > 0) { [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]]; renderSteps(); } });
      head.querySelector('[data-act="down"]').addEventListener('click', () => { if (idx < steps.length - 1) { [steps[idx + 1], steps[idx]] = [steps[idx], steps[idx + 1]]; renderSteps(); } });
      li.appendChild(head); li.appendChild(body);
      stepsUl.appendChild(li);
    });
  }

  addSelect.addEventListener('change', () => { if (addSelect.value) { addStep(addSelect.value); addSelect.value = ''; } });
  $('pipe-open').addEventListener('click', showPipe);
  $('pipe-back').addEventListener('click', hidePipe);

  $('pipe-choose-files').addEventListener('click', async () => {
    const p = await window.electronAPI.openFilesDialog();
    if (p && p.length) { files = p; filesLabel.textContent = `${p.length} file${p.length > 1 ? 's' : ''} chosen`; }
  });

  $('pipe-run').addEventListener('click', async () => {
    if (!steps.length) { statusEl.textContent = 'Add at least one step.'; return; }
    if (!files.length) { statusEl.textContent = 'Choose files first.'; return; }
    statusEl.textContent = 'Starting…';
    window.electronAPI.onProgress(({ percent, message }) => { statusEl.textContent = `${Math.round(percent)}% · ${message || ''}`; });
    const payload = { steps: steps.map(s => ({ op: s.op, options: s.options })), filePaths: files };
    const res = await window.electronAPI.runPipeline(payload);
    window.electronAPI.removeProgressListener();
    if (res.error) { statusEl.textContent = 'Error: ' + res.error; }
    else {
      statusEl.textContent = `Done — ${res.count} file(s). Saved near: ${res.outputPath}`;
      if (typeof addHistory === 'function') addHistory({ status: 'success', inputName: `${files.length} file(s)`, outputName: 'pipeline output', outputPath: res.outputPath, sizeBefore: 0, sizeAfter: res.outputSize });
    }
  });

  $('pipe-export').addEventListener('click', () => {
    const data = JSON.stringify({ steps: steps.map(s => ({ op: s.op, options: s.options })) }, null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
    a.download = 'vesper-pipeline.json';
    a.click();
  });

  $('pipe-import').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const j = JSON.parse(rd.result);
          steps = (j.steps || []).map(st => {
            const t = opTools().find(x => x.op === st.op);
            return { op: st.op, label: t ? t.label : st.op, options: st.options || {}, schema: t ? (t.options || []) : [] };
          });
          renderSteps();
          statusEl.textContent = 'Pipeline imported.';
        } catch { statusEl.textContent = 'Invalid pipeline file.'; }
      };
      rd.readAsText(f);
    };
    inp.click();
  });

  buildAddSelect();
  renderSteps();
})();
