// auth.js – Vollständiges Authentifizierungs-System für den KI Signal Hub
// Frontend: Feedback-Meldungen („Passwort falsch“, „Benutzer bereits registriert“)
// Backend-Logik: Hashing (PBKDF2/SHA-256 via Web Crypto), Token-Ausstellung (Sessions)
// Datenbank: users-Tabelle mit UNIQUE-Constraint auf E-Mail + auth_sessions
(function () {
  'use strict';

  const ITER = 120000; // PBKDF2-Iterationen (bcrypt-ähnliche Kosten)

  function el(id) { return document.getElementById(id); }
  function bufToHex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
  function randomHex(bytes) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return bufToHex(a); }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  // ---------- Passwort-Hashing (niemals Klartext!) ----------
  async function sha256Hex(str) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return bufToHex(d);
  }
  async function pbkdf2(password, saltHex, iter) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const salt = Uint8Array.from(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, key, 256);
    return bufToHex(bits);
  }
  async function hashPassword(password) {
    const saltHex = randomHex(16);
    if (crypto.subtle && crypto.subtle.deriveBits) {
      return 'pbkdf2-sha256$' + ITER + '$' + saltHex + '$' + (await pbkdf2(password, saltHex, ITER));
    }
    return 'sha256$' + saltHex + '$' + (await sha256Hex(saltHex + password));
  }
  async function verifyPassword(password, stored) {
    const p = String(stored || '').split('$');
    try {
      if (p[0] === 'pbkdf2-sha256') return (await pbkdf2(password, p[2], parseInt(p[1], 10))) === p[3];
      if (p[0] === 'sha256') return (await sha256Hex(p[1] + password)) === p[2];
    } catch (e) { /* ignore */ }
    return false;
  }

  // ---------- Datenbank: Users-Tabelle mit Unique-Constraint ----------
  async function ensureSchema() {
    await db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    await db.run('CREATE TABLE IF NOT EXISTS auth_sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL)');
  }

  // ---------- Session-Management (Token statt Klartext-Passwort) ----------
  async function createSession(userId) {
    const token = randomHex(32); // das „Ticket“ für den Browser
    const expires = new Date(Date.now() + 7 * 864e5).toISOString();
    await db.run('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expires]);
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('auth_token', ?)", [token]);
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('user_session', '1')");
    return token;
  }

  async function getCurrentUser() {
    try {
      const t = await db.get("SELECT value FROM settings WHERE key = 'auth_token'");
      if (!t) return null;
      const row = await db.get('SELECT u.id, u.username, u.email, s.expires_at FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', [t.value]);
      if (!row) return null;
      if (new Date(row.expires_at).getTime() < Date.now()) { await destroySession(); return null; }
      return row;
    } catch (e) { return null; }
  }

  async function destroySession() {
    try {
      const t = await db.get("SELECT value FROM settings WHERE key = 'auth_token'");
      if (t) await db.run('DELETE FROM auth_sessions WHERE token = ?', [t.value]);
      await db.run("DELETE FROM settings WHERE key IN ('auth_token', 'user_session')");
    } catch (e) { /* ignore */ }
  }

  // ---------- Feedback-System (Frontend-Meldungen) ----------
  function showFeedback(form, message, ok) {
    let box = form.querySelector('.auth-feedback');
    if (!box) {
      box = document.createElement('div');
      box.className = 'auth-feedback';
      form.insertBefore(box, form.querySelector('button[type="submit"]'));
    }
    box.textContent = message;
    box.style.cssText = 'display:block;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem;font-weight:700;margin-bottom:1rem;line-height:1.4;' +
      (ok ? 'background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);color:#34d399;'
          : 'background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#f87171;');
  }
  function busy(form, on) {
    const b = form.querySelector('button[type="submit"]');
    if (b) b.disabled = on;
  }

  // ---------- Registrierung: Daten → Hash → DB ----------
  async function handleRegister(form) {
    const name = ((form.querySelector('input[type="text"]') || {}).value || '');
    const email = ((form.querySelector('input[type="email"]') || {}).value || '').trim().toLowerCase();
    const passes = form.querySelectorAll('input[type="password"]');
    const pass = passes[0] ? passes[0].value : '';
    const confirm = passes[1] ? passes[1].value : '';

    if (name.trim().length < 2) return showFeedback(form, 'Bitte gib deinen vollständigen Namen ein.', false);
    if (!emailOk(email)) return showFeedback(form, 'Bitte gib eine gültige E-Mail-Adresse ein.', false);
    if (pass.length < 8) return showFeedback(form, 'Das Passwort muss mindestens 8 Zeichen lang sein.', false);
    if (pass !== confirm) return showFeedback(form, 'Die Passwörter stimmen nicht überein.', false);

    busy(form, true);
    try {
      const exists = await db.get('SELECT id FROM users WHERE email = ?', [email]);
      if (exists) { busy(form, false); return showFeedback(form, 'Benutzer bereits registriert – bitte direkt anmelden.', false); }
      const hash = await hashPassword(pass); // Passwort wird gehasht, nie im Klartext gespeichert
      await db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [name.trim(), email, hash]);
      const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
      await createSession(user.id); // Auto-Login nach der Registrierung
      showFeedback(form, '✓ Konto erstellt – du wirst angemeldet …', true);
      setTimeout(() => { window.location.href = 'index.html'; }, 900);
    } catch (e) {
      busy(form, false);
      showFeedback(form, 'Benutzer bereits registriert – bitte direkt anmelden.', false);
    }
  }

  // ---------- Login: Hash vergleichen → Token senden ----------
  async function handleLogin(form) {
    const email = ((form.querySelector('input[type="email"]') || {}).value || '').trim().toLowerCase();
    const pass = ((form.querySelector('input[type="password"]') || {}).value || '');
    if (!emailOk(email)) return showFeedback(form, 'Bitte gib eine gültige E-Mail-Adresse ein.', false);

    busy(form, true);
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) { busy(form, false); return showFeedback(form, 'Kein Konto mit dieser E-Mail gefunden – bitte registrieren.', false); }
    if (!(await verifyPassword(pass, user.password_hash))) {
      busy(form, false);
      return showFeedback(form, 'Passwort falsch. Bitte erneut versuchen.', false);
    }
    await createSession(user.id);
    showFeedback(form, '✓ Anmeldung erfolgreich – weiter zum Dashboard …', true);
    setTimeout(() => { window.location.href = 'index.html'; }, 700);
  }

  // ---------- Logout (räumt Token + Session weg) ----------
  async function logout() {
    await destroySession();
    window.location.href = 'login.html';
  }

  // ---------- Form-Wiring (übersteuert alte Platzhalter-Handler) ----------
  function wireForms() {
    const lf = el('login-form');
    if (lf) lf.addEventListener('submit', function (e) {
      e.preventDefault(); e.stopImmediatePropagation(); handleLogin(lf);
    }, true);
    const rf = el('register-form');
    if (rf) rf.addEventListener('submit', function (e) {
      e.preventDefault(); e.stopImmediatePropagation(); handleRegister(rf);
    }, true);
    // Logout-Buttons räumen auch das Token weg (nav.js lädt danach neu)
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#nav-logout')) destroySession();
    }, true);
  }

  // ---------- Boot ----------
  async function boot() {
    try { await ensureSchema(); } catch (e) { /* Schema existiert bereits */ }
    wireForms();
    const page = (location.pathname.split('/').pop() || 'index.html');
    const user = await getCurrentUser();
    // Eingeloggt auf Login/Registrierung? → direkt ins Dashboard (Session erkennt den Nutzer)
    if (user && (page === 'login.html' || page === 'register.html')) {
      window.location.replace('index.html');
      return;
    }
    document.dispatchEvent(new CustomEvent('authchange', { detail: { user: user } }));
  }

  // Öffentliche API: window.auth.login / register / logout / getCurrentUser
  window.auth = { login: handleLogin, register: handleRegister, logout: logout, getCurrentUser: getCurrentUser, hashPassword: hashPassword, verifyPassword: verifyPassword };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
