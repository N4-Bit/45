// i18n.js – Zentrale Sprachsteuerung für die gesamte Website
// 14 Sprachen · Auswahl auf der Einstellungs-Seite UND im Gast-Dashboard
// Speicherung in der Projekt-DB (settings.ui_language) · RTL für Arabisch
// MutationObserver übersetzt auch dynamisch nachgebaute Navigationen.
(function () {
  'use strict';

  const LANGS = {
    de: 'Deutsch', en: 'English', fr: 'Français', es: 'Español',
    it: 'Italiano', pt: 'Português', nl: 'Nederlands', pl: 'Polski',
    tr: 'Türkçe', ru: 'Русский', ja: '日本語', zh: '中文',
    ar: 'العربية', hi: 'हिन्दी'
  };

  // Übersetzungs-Wörterbuch: Navigation + häufige UI-Texte
  const T = {
    de: { dashboard: 'Dashboard', profile: 'Profil', wallet: 'Wallet', pricing: 'Pricing', faq: 'FAQ', contact: 'Kontakt', settings: 'Einstellungen', admin: 'Admin', logout: 'Abmelden', login: 'Anmelden', register: 'Registrieren', analyze: 'KI-ANALYSE STARTEN', language: 'Sprache', language_desc: 'Wähle die Sprache, in der die Website angezeigt wird.' },
    en: { dashboard: 'Dashboard', profile: 'Profile', wallet: 'Wallet', pricing: 'Pricing', faq: 'FAQ', contact: 'Contact', settings: 'Settings', admin: 'Admin', logout: 'Log out', login: 'Sign in', register: 'Sign up', analyze: 'START AI ANALYSIS', language: 'Language', language_desc: 'Choose the language in which the website is displayed.' },
    fr: { dashboard: 'Tableau de bord', profile: 'Profil', wallet: 'Portefeuille', pricing: 'Tarifs', faq: 'FAQ', contact: 'Contact', settings: 'Paramètres', admin: 'Admin', logout: 'Déconnexion', login: 'Connexion', register: 'S\u2019inscrire', analyze: 'LANCER L\u2019ANALYSE IA', language: 'Langue', language_desc: 'Choisissez la langue d\u2019affichage du site.' },
    es: { dashboard: 'Panel', profile: 'Perfil', wallet: 'Cartera', pricing: 'Precios', faq: 'FAQ', contact: 'Contacto', settings: 'Ajustes', admin: 'Admin', logout: 'Cerrar sesión', login: 'Iniciar sesión', register: 'Registrarse', analyze: 'INICIAR ANÁLISIS IA', language: 'Idioma', language_desc: 'Elige el idioma en el que se muestra la web.' },
    it: { dashboard: 'Dashboard', profile: 'Profilo', wallet: 'Portafoglio', pricing: 'Prezzi', faq: 'FAQ', contact: 'Contatti', settings: 'Impostazioni', admin: 'Admin', logout: 'Esci', login: 'Accedi', register: 'Registrati', analyze: 'AVVIA ANALISI IA', language: 'Lingua', language_desc: 'Scegli la lingua in cui viene mostrato il sito.' },
    pt: { dashboard: 'Painel', profile: 'Perfil', wallet: 'Carteira', pricing: 'Preços', faq: 'FAQ', contact: 'Contacto', settings: 'Definições', admin: 'Admin', logout: 'Sair', login: 'Entrar', register: 'Registar', analyze: 'INICIAR ANÁLISE IA', language: 'Idioma', language_desc: 'Escolha o idioma em que o site é exibido.' },
    nl: { dashboard: 'Dashboard', profile: 'Profiel', wallet: 'Wallet', pricing: 'Prijzen', faq: 'FAQ', contact: 'Contact', settings: 'Instellingen', admin: 'Admin', logout: 'Uitloggen', login: 'Inloggen', register: 'Registreren', analyze: 'START AI-ANALYSE', language: 'Taal', language_desc: 'Kies de taal waarin de website wordt weergegeven.' },
    pl: { dashboard: 'Pulpit', profile: 'Profil', wallet: 'Portfel', pricing: 'Cennik', faq: 'FAQ', contact: 'Kontakt', settings: 'Ustawienia', admin: 'Admin', logout: 'Wyloguj', login: 'Zaloguj', register: 'Zarejestruj', analyze: 'URUCHOM ANALIZĘ AI', language: 'Język', language_desc: 'Wybierz język, w którym wyświetlana jest strona.' },
    tr: { dashboard: 'Panel', profile: 'Profil', wallet: 'Cüzdan', pricing: 'Fiyatlar', faq: 'SSS', contact: 'İletişim', settings: 'Ayarlar', admin: 'Admin', logout: 'Çıkış', login: 'Giriş', register: 'Kayıt Ol', analyze: 'YAPAY ZEKÂ ANALİZİ BAŞLAT', language: 'Dil', language_desc: 'Web sitesinin görüntüleneceği dili seçin.' },
    ru: { dashboard: 'Главная', profile: 'Профиль', wallet: 'Кошелёк', pricing: 'Тарифы', faq: 'Вопросы', contact: 'Контакты', settings: 'Настройки', admin: 'Админ', logout: 'Выйти', login: 'Войти', register: 'Регистрация', analyze: 'ЗАПУСТИТЬ ИИ-АНАЛИЗ', language: 'Язык', language_desc: 'Выберите язык отображения сайта.' },
    ja: { dashboard: 'ダッシュボード', profile: 'プロフィール', wallet: 'ウォレット', pricing: '料金', faq: 'FAQ', contact: 'お問い合わせ', settings: '設定', admin: '管理', logout: 'ログアウト', login: 'ログイン', register: '登録', analyze: 'AI分析を開始', language: '言語', language_desc: 'サイトの表示言語を選択してください。' },
    zh: { dashboard: '仪表板', profile: '个人资料', wallet: '钱包', pricing: '价格', faq: '常见问题', contact: '联系我们', settings: '设置', admin: '管理', logout: '退出登录', login: '登录', register: '注册', analyze: '开始AI分析', language: '语言', language_desc: '选择网站的显示语言。' },
    ar: { dashboard: 'لوحة التحكم', profile: 'الملف الشخصي', wallet: 'المحفظة', pricing: 'الأسعار', faq: 'الأسئلة الشائعة', contact: 'اتصل بنا', settings: 'الإعدادات', admin: 'المسؤول', logout: 'تسجيل الخروج', login: 'تسجيل الدخول', register: 'إنشاء حساب', analyze: 'ابدأ تحليل الذكاء الاصطناعي', language: 'اللغة', language_desc: 'اختر اللغة التي يُعرض بها الموقع.' },
    hi: { dashboard: 'डैशबोर्ड', profile: 'प्रोफ़ाइल', wallet: 'वॉलेट', pricing: 'मूल्य', faq: 'सामान्य प्रश्न', contact: 'संपर्क', settings: 'सेटिंग्स', admin: 'एडमिन', logout: 'लॉग आउट', login: 'लॉग इन', register: 'पंजीकरण', analyze: 'एआई विश्लेषण शुरू करें', language: 'भाषा', language_desc: 'वेबसाइट की प्रदर्शन भाषा चुनें।' }
  };

  const NAV_MAP = {
    'index.html': 'dashboard', 'profile.html': 'profile', 'wallet-settings.html': 'wallet',
    'pricing.html': 'pricing', 'faq.html': 'faq', 'contact.html': 'contact',
    'settings.html': 'settings', 'admin.html': 'admin'
  };

  let current = 'de';

  function t(key) { return (T[current] && T[current][key]) || T.de[key] || key; }

  async function getLang() {
    try {
      const r = await db.get("SELECT value FROM settings WHERE key = 'ui_language'");
      return (r && r.value && LANGS[r.value]) ? r.value : 'de';
    } catch (e) { return 'de'; }
  }

  function applyLang(code) {
    if (!T[code]) code = 'de';
    current = code;
    document.documentElement.lang = code;
    document.documentElement.dir = (code === 'ar') ? 'rtl' : 'ltr';
    // 1) Statische data-i18n Elemente
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    // 2) Navigation per href (funktioniert statisch + dynamisch)
    document.querySelectorAll('nav a[href]').forEach(a => {
      if (a.classList.contains('nav-brand') || a.querySelector('.nav-logo')) return;
      const href = (a.getAttribute('href') || '').split('/').pop();
      const key = NAV_MAP[href];
      if (!key) return;
      const span = a.querySelector('span');
      if (span) span.textContent = t(key); else a.textContent = t(key);
    });
    // 3) Logout-Button (nav.js baut ihn dynamisch ein)
    const lg = document.getElementById('nav-logout');
    if (lg) { lg.innerHTML = '<i data-lucide="log-out"></i> ' + t('logout'); if (window.lucide) lucide.createIcons(); }
    // 4) Login/Register-Pills
    document.querySelectorAll('a[href="login.html"].nav-pill').forEach(a => { a.textContent = t('login'); });
    document.querySelectorAll('a[href="register.html"].nav-pill').forEach(a => { a.textContent = t('register'); });
    // 5) Analyse-Button
    const btnText = document.getElementById('btn-text');
    if (btnText) btnText.textContent = t('analyze');
    // 6) Sprachauswahlen synchronisieren
    document.querySelectorAll('select.lang-select').forEach(sel => { sel.value = code; });
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: code } }));
  }

  async function setLang(code) {
    if (!LANGS[code]) return;
    try { await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ui_language', ?)", [code]); } catch (e) { /* DB optional */ }
    applyLang(code);
  }

  function buildSelects() {
    document.querySelectorAll('select.lang-select').forEach(sel => {
      if (!sel.options.length) {
        Object.keys(LANGS).forEach(c => {
          const o = document.createElement('option');
          o.value = c;
          o.textContent = LANGS[c];
          sel.appendChild(o);
        });
      }
      sel.value = current;
      if (!sel.dataset.wired) {
        sel.dataset.wired = '1';
        sel.addEventListener('change', () => setLang(sel.value));
      }
    });
  }

  async function boot() {
    current = await getLang();
    applyLang(current);
    buildSelects();
    // Dynamisch nachgebaute Navis (nav.js) ebenfalls übersetzen
    let scheduled = null;
    const obs = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = setTimeout(() => { scheduled = null; applyLang(current); buildSelects(); }, 120);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Öffentliche API
  window.i18n = { getLang, setLang, applyLang, LANGS, t };
})();
