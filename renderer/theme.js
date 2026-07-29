'use strict';

(function () {
  const root = document.documentElement;
  const norm = (n) => (n === 'glass' ? 'glass' : 'mauve');

  function paint(name) {
    document.querySelectorAll('.theme-option').forEach(b => b.classList.toggle('active', b.dataset.theme === name));
  }
  function apply(name) { name = norm(name); root.dataset.theme = name; paint(name); }

  try { apply(localStorage.getItem('vesper-theme') || 'mauve'); } catch { apply('mauve'); }

  function set(name) {
    name = norm(name);
    apply(name);
    try { localStorage.setItem('vesper-theme', name); } catch {}
    if (window.electronAPI && window.electronAPI.saveSettings) window.electronAPI.saveSettings({ theme: name });
  }

  document.querySelectorAll('.theme-option').forEach(b => b.addEventListener('click', () => set(b.dataset.theme)));

  if (window.electronAPI && window.electronAPI.loadSettings) {
    window.electronAPI.loadSettings().then(s => {
      if (s && s.theme) { apply(s.theme); try { localStorage.setItem('vesper-theme', s.theme); } catch {} }
    }).catch(() => {});
  }

  window.VesperTheme = { apply, set };
})();
