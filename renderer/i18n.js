'use strict';

/* ============================================================================
   Vesper — Internationalisation
   A lightweight i18n layer: [data-i18n] elements are translated on language
   change, the selected language persists, and Arabic switches the app to RTL.
   English is the default and the fallback for any missing string.
   (Chrome strings are translated for a starter set of languages; more strings
   and languages plug straight into DICT below.)
============================================================================ */
(function () {
  const LANGS = [
    { c: 'en', n: 'English' }, { c: 'ar', n: 'العربية' }, { c: 'zh', n: '中文 (简体)' },
    { c: 'zh-TW', n: '中文 (繁體)' }, { c: 'nl', n: 'Nederlands' }, { c: 'fr', n: 'Français' },
    { c: 'de', n: 'Deutsch' }, { c: 'hi', n: 'हिन्दी' }, { c: 'id', n: 'Bahasa Indonesia' },
    { c: 'it', n: 'Italiano' }, { c: 'ja', n: '日本語' }, { c: 'ko', n: '한국어' },
    { c: 'pl', n: 'Polski' }, { c: 'pt', n: 'Português' }, { c: 'ru', n: 'Русский' },
    { c: 'es', n: 'Español' }, { c: 'sv', n: 'Svenska' }, { c: 'th', n: 'ไทย' },
    { c: 'tr', n: 'Türkçe' }, { c: 'uk', n: 'Українська' }, { c: 'vi', n: 'Tiếng Việt' },
  ];

  const DICT = {
    en: { tools: 'Tools', download: 'Download', editor: 'Photo Editor', settings: 'Settings', pipelines: '⚡ Pipelines', tools_title: 'Tools', download_title: 'Download from URL', settings_title: 'Settings' },
    es: { tools: 'Herramientas', download: 'Descargar', editor: 'Editor de Fotos', settings: 'Ajustes', pipelines: '⚡ Flujos', tools_title: 'Herramientas', download_title: 'Descargar desde URL', settings_title: 'Ajustes' },
    fr: { tools: 'Outils', download: 'Télécharger', editor: 'Éditeur Photo', settings: 'Paramètres', pipelines: '⚡ Pipelines', tools_title: 'Outils', download_title: "Télécharger depuis une URL", settings_title: 'Paramètres' },
    de: { tools: 'Werkzeuge', download: 'Herunterladen', editor: 'Fotoeditor', settings: 'Einstellungen', pipelines: '⚡ Pipelines', tools_title: 'Werkzeuge', download_title: 'Von URL herunterladen', settings_title: 'Einstellungen' },
    pt: { tools: 'Ferramentas', download: 'Baixar', editor: 'Editor de Fotos', settings: 'Configurações', pipelines: '⚡ Pipelines', tools_title: 'Ferramentas', download_title: 'Baixar de URL', settings_title: 'Configurações' },
    it: { tools: 'Strumenti', download: 'Scarica', editor: 'Editor Foto', settings: 'Impostazioni', pipelines: '⚡ Pipeline', tools_title: 'Strumenti', download_title: 'Scarica da URL', settings_title: 'Impostazioni' },
    hi: { tools: 'उपकरण', download: 'डाउनलोड', editor: 'फ़ोटो एडिटर', settings: 'सेटिंग्स', pipelines: '⚡ पाइपलाइन', tools_title: 'उपकरण', download_title: 'URL से डाउनलोड करें', settings_title: 'सेटिंग्स' },
    ar: { tools: 'الأدوات', download: 'تنزيل', editor: 'محرر الصور', settings: 'الإعدادات', pipelines: '⚡ سلاسل', tools_title: 'الأدوات', download_title: 'التنزيل من رابط', settings_title: 'الإعدادات' },
    ru: { tools: 'Инструменты', download: 'Загрузка', editor: 'Фоторедактор', settings: 'Настройки', pipelines: '⚡ Конвейеры', tools_title: 'Инструменты', download_title: 'Загрузка по ссылке', settings_title: 'Настройки' },
    ja: { tools: 'ツール', download: 'ダウンロード', editor: '写真エディター', settings: '設定', pipelines: '⚡ パイプライン', tools_title: 'ツール', download_title: 'URLからダウンロード', settings_title: '設定' },
  };
  const RTL = new Set(['ar']);

  function t(key, lang) {
    const d = DICT[lang] || DICT.en;
    return d[key] != null ? d[key] : (DICT.en[key] != null ? DICT.en[key] : key);
  }
  function apply(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n, lang); });
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', RTL.has(lang) ? 'rtl' : 'ltr');
  }

  const sel = document.getElementById('app-language');
  if (sel) {
    sel.innerHTML = '';
    LANGS.forEach(l => { const o = document.createElement('option'); o.value = l.c; o.textContent = l.n; sel.appendChild(o); });
  }

  function setLang(lang, persist) {
    apply(lang);
    if (sel) sel.value = lang;
    if (persist && window.electronAPI && window.electronAPI.saveSettings) window.electronAPI.saveSettings({ language: lang });
  }

  if (sel) sel.addEventListener('change', () => setLang(sel.value, true));

  if (window.electronAPI && window.electronAPI.loadSettings) {
    window.electronAPI.loadSettings().then(s => setLang((s && s.language) || 'en', false)).catch(() => apply('en'));
  } else {
    apply('en');
  }

  window.VesperI18n = { t, apply, setLang };
})();
