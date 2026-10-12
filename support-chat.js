// support-chat.js – KI-Live-Support: schwebende, frei verschiebbare Chat-Bubble
// Auf allen Seiten. Basic: 9:00–18:00 Uhr · Pro/Elite: 24/7. Die KI kennt den
// echten Systemzustand (Plan, Guthaben, Anbieter, Keys) aus der Projekt-DB.
(function () {
  'use strict';

  var plan = 'Basic';
  var isOpen = false, busy = false;
  var bubble = null, panel = null, msgs = null, input = null, sendBtn = null, chips = null;
  var drag = null, moved = false;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function dbGet(sql, p) {
    if (!window.db || !db.get) return Promise.resolve(null);
    return db.get(sql, p).catch(function () { return null; });
  }
  function timeNow() { return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'; }

  function loadPlan() {
    var ready = window.dbReady ? window.dbReady() : Promise.resolve();
    return ready.then(function () { return dbGet('SELECT plan FROM subscription LIMIT 1'); })
      .then(function (s) { if (s && s.plan) plan = s.plan; })
      .catch(function () {});
  }

  function isPro() { return plan === 'Pro' || plan === 'Elite'; }
  function withinHours() {
    if (isPro()) return true;
    var h = new Date().getHours();
    return h >= 9 && h < 18;
  }

  var CSS = [
    '#support-bubble{position:fixed;z-index:9999;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 8px 24px rgba(16,185,129,.45);display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none;border:2px solid rgba(255,255,255,.15);user-select:none}',
    '#support-bubble:active{cursor:grabbing}',
    '#support-bubble svg{width:26px;height:26px;color:#000;pointer-events:none}',
    '#support-bubble .sc-dot{position:absolute;top:1px;right:1px;width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #020617;pointer-events:none}',
    '#support-bubble.sc-off .sc-dot{background:#ef4444}',
    '.sc-panel{position:fixed;z-index:10000;width:340px;max-width:calc(100vw - 24px);height:440px;max-height:70vh;background:rgba(2,6,23,.97);border:1px solid rgba(16,185,129,.35);border-radius:1.25rem;box-shadow:0 25px 60px rgba(0,0,0,.7);display:flex;flex-direction:column;overflow:hidden}',
    '.sc-hidden{display:none}',
    '.sc-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(16,185,129,.06)}',
    '.sc-head-l{display:flex;align-items:center;gap:10px}',
    '.sc-avatar{width:36px;height:36px;border-radius:10px;background:#10b981;color:#000;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.sc-title{color:#fff;font-weight:700;font-size:14px;margin:0}',
    '.sc-sub{color:#34d399;font-size:11px;font-weight:700;margin:0}',
    '.sc-x{background:none;border:none;color:#a1a1aa;font-size:20px;cursor:pointer;padding:2px 8px}',
    '.sc-x:hover{color:#fff}',
    '.sc-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}',
    '.sc-msg{max-width:85%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.5;color:#e4e4e7;word-break:break-word}',
    '.sc-msg b{color:#fff}',
    '.sc-msg a{color:#34d399;font-weight:700}',
    '.sc-ai{align-self:flex-start;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-bottom-left-radius:4px}',
    '.sc-user{align-self:flex-end;background:linear-gradient(135deg,#10b981,#059669);color:#04120c;font-weight:600;border-bottom-right-radius:4px}',
    '.sc-sys{align-self:center;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#f87171;font-size:12px;text-align:center}',
    '.sc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px}',
    '.sc-chip{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#34d399;font-size:11px;font-weight:700;padding:6px 10px;border-radius:9999px;cursor:pointer}',
    '.sc-chip:hover{background:rgba(16,185,129,.2)}',
    '.sc-input-row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08)}',
    '.sc-input-row input{flex:1;background:rgba(0,0,0,.4);border:1px solid #27272a;border-radius:12px;padding:10px 12px;color:#fff;font-size:13px;outline:none}',
    '.sc-input-row input:focus{border-color:rgba(16,185,129,.5)}',
    '.sc-send{background:linear-gradient(135deg,#10b981,#059669);border:none;color:#000;width:42px;border-radius:12px;font-size:15px;cursor:pointer;font-weight:700}',
    '.sc-send:hover{filter:brightness(1.1)}',
    '.sc-typing span{display:inline-block;width:6px;height:6px;margin-right:3px;border-radius:50%;background:#34d399;animation:scBlink 1.2s infinite}',
    '.sc-typing span:nth-child(2){animation-delay:.2s}.sc-typing span:nth-child(3){animation-delay:.4s}',
    '@keyframes scBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}'
  ].join('');

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 4.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 4.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  function addMsg(html, who) {
    var d = document.createElement('div');
    d.className = 'sc-msg sc-' + who;
    if (who === 'user') d.textContent = html; else d.innerHTML = html;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function showTyping() {
    var d = document.createElement('div');
    d.className = 'sc-msg sc-ai sc-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  // ---------- KI-Engine: versteht Fragen, kennt den echten Systemzustand ----------
  function aiAnswer(q) {
    var t = q.toLowerCase();
    function out(html) { return Promise.resolve(html); }

    if (/(plan|abo|subscription|mitglied|upgrade|basic|elite)/.test(t)) {
      return dbGet('SELECT plan, status, renews_at FROM subscription LIMIT 1').then(function (s) {
        var p = s && s.plan ? s.plan : plan;
        var renew = s && s.renews_at ? ' Das Abo läuft bis ' + new Date(s.renews_at).toLocaleDateString('de-DE') + '.' : '';
        var extra = (p === 'Pro' || p === 'Elite')
          ? ' Damit hast du <b>24/7</b> Zugriff auf diesen Live-Support.'
          : ' Pro-/Elite-Funktionen (unbegrenzte Signale, Auto-Invest, 24/7-Support) schaltest du mit einem Aktivierungskey frei.';
        return 'Du nutzt aktuell den <b>' + p + '</b>-Plan.' + renew + extra + ' Übersicht: <a href="pricing.html">Pricing</a>';
      });
    }
    if (/(guthaben|balance|kontostand)/.test(t)) {
      return dbGet('SELECT balance FROM wallet').then(function (w) {
        return 'Dein aktuelles Guthaben beträgt <b>$' + (w ? Number(w.balance).toFixed(2) : '0.00') + '</b>. Ein- und Auszahlen geht über die Buttons im Dashboard, Budgets pro Anbieter stellst du auf der <a href="wallet-settings.html">Wallet-Seite</a> ein.';
      });
    }
    if (/(key|aktivier|einl|lizenz)/.test(t)) {
      return out('Aktivierungskeys (Format z. B. <b>PRO-1A2B-3C4D</b>) löst du auf der <a href="profile.html">Profil-Seite</a> im Feld „Aktivierungskey einlösen“ ein – der Plan wird sofort aktiviert. Neue Keys generiert der Admin im <a href="admin.html">Admin-Panel</a>.');
    }
    if (/(auto.?invest)/.test(t)) {
      return out('<b>Auto-Invest</b> führt Signale automatisch über deine verbundenen Anbieter aus. Es ist ein Pro/Elite-Feature: erst einen Pro-/Elite-Key einlösen, dann den Schalter „Auto-Invest“ im Dashboard aktivieren. Die Budgets pro Anbieter stellst du auf der Wallet-Seite ein.');
    }
    if (/(wallet|api|anbieter|broker|verbinden|binance|coinbase|kraken|bybit|oanda|interactive)/.test(t)) {
      return out('Auf der <a href="wallet-settings.html">Wallet-&-API-Seite</a> verbindest du bis zu <b>3 Anbieter</b> gleichzeitig (Binance, Coinbase, Kraken, Bybit, Interactive Brokers, OANDA) per API-Key und vergibst pro Anbieter ein KI-Handelsbudget. Maximal 3 gleichzeitig – erst trennen, dann neu verbinden.');
    }
    if (/(preis|kosten|pricing|teuer|wie viel|kostet)/.test(t)) {
      return out('Unsere Pläne: <b>Basic</b> kostenlos (3 Signale/Tag), <b>Pro</b> 99 €/Monat (unbegrenzte Signale, Auto-Invest, Priority Support), <b>Elite</b> 249 €/Monat (Custom AI Modelle, Portfolio Manager, Enterprise API). Details: <a href="pricing.html">Pricing</a>');
    }
    if (/(signal|analys|long|short|trade|historie)/.test(t)) {
      return out('Die KI analysiert Orderflow, Chartmuster und News-Sentiment in Echtzeit und liefert LONG/SHORT-Signale mit Konfidenz-Level. Starte eine Analyse im Dashboard über „KI-ANALYSE STARTEN“ – Ergebnisse landen automatisch in der Trade-Historie.');
    }
    if (/(sicher|2fa|passwort|verschl|security)/.test(t)) {
      return out('Deine API-Keys werden AES-256-verschlüsselt gespeichert; wir empfehlen nur „Read“/„Trade“-Rechte. Zwei-Faktor-Authentisierung (E-Mail/SMS) und Konto-Löschung findest du unter <a href="security.html">Sicherheit</a>.');
    }
    if (/(faq|frage|h.ufig)/.test(t)) {
      return out('Die häufigsten Fragen (Signale, Auto-Invest, API-Sicherheit, Märkte) beantworten wir auf der <a href="faq.html">FAQ-Seite</a>.');
    }
    if (/(login|anmelden|registrier|konto erstellen)/.test(t)) {
      return out('Anmelden kannst du dich auf der <a href="login.html">Login-Seite</a>. Noch kein Konto? <a href="register.html">Jetzt registrieren</a>.');
    }
    if (/(kontakt|support|e.?mail|human|mensa?ch|mitarbeiter|telefon)/.test(t)) {
      return out('Unser Team erreichst du über das <a href="contact.html">Kontaktformular</a> oder per E-Mail an <b>support@signalhub.studio</b>. Als Basic-Nutzer ist dieser Live-Chat von 9:00–18:00 Uhr besetzt; Pro- und Elite-Mitglieder chatten rund um die Uhr (24/7).');
    }
    if (/(uhr|ffnungszeiten|erreichbar|wann|24.?7)/.test(t)) {
      return out(isPro()
        ? 'Als <b>' + plan + '</b>-Mitglied hast du 24/7 Zugriff auf den KI-Live-Support – jederzeit, auch nachts und am Wochenende.'
        : 'Der Live-Support ist für Basic-Nutzer von <b>9:00–18:00 Uhr</b> verfügbar (jetzt: ' + timeNow() + '). Mit Pro oder Elite chattest du 24/7.');
    }
    if (/^(hallo|hi|hey|moin|guten)/.test(t)) {
      return out('Hallo! 👋 Ich bin die <b>KI-Support</b>. Ich kenne dein Konto, deine Pläne und alle Funktionen – frag mich einfach!');
    }
    if (/(danke|dank|super|top|perfekt)/.test(t)) {
      return out('Gern! 😊 Wenn du später wieder Hilfe brauchst, bin ich jederzeit hier.');
    }
    return out('Dazu habe ich gerade keine sichere Antwort. 🤔 Versuch es mit Stichworten wie „Plan“, „Key einlösen“, „Auto-Invest“ oder „Wallet/API“ – oder kontaktiere unser Team über die <a href="contact.html">Kontakt-Seite</a>.');
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    if (!withinHours()) {
      addMsg('Der Live-Support ist für Basic-Nutzer von <b>9:00–18:00 Uhr</b> besetzt (jetzt: ' + timeNow() + '). Pro- und Elite-Mitglieder chatten rund um die Uhr.', 'sys');
      return;
    }
    busy = true;
    addMsg(text, 'user');
    input.value = '';
    var t = showTyping();
    await sleep(500 + Math.random() * 600);
    t.remove();
    addMsg(await aiAnswer(text), 'ai');
    busy = false;
  }

  var CHIPS = ['Welchen Plan habe ich?', 'Wie löse ich einen Key ein?', 'Was ist Auto-Invest?', 'Wallet/API verbinden', 'Preise & Pläne'];

  function renderChips() {
    chips.innerHTML = '';
    CHIPS.forEach(function (label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-chip';
      b.textContent = label;
      b.addEventListener('click', function () { send(label); });
      chips.appendChild(b);
    });
  }

  function applyAccess() {
    if (!bubble) return;
    bubble.classList.toggle('sc-off', !withinHours());
    bubble.title = withinHours()
      ? 'KI-Live-Support (24/7 verfügbar)'
      : 'KI-Live-Support – für Basic nur 9:00–18:00 Uhr';
  }

  function openPanel() {
    isOpen = true;
    panel.classList.remove('sc-hidden');
    positionPanel();
    if (!msgs.childElementCount) {
      addMsg('Hallo! 👋 Ich bin die <b>KI-Support</b> vom KI Signal Hub. Ich kenne dein Konto, deinen Plan und alle Funktionen – frag mich einfach. ' + (isPro() ? 'Als <b>' + plan + '</b>-Mitglied erreichst mich 24/7.' : 'Als Basic-Nutzer bin ich von 9:00–18:00 Uhr für dich da.'), 'ai');
      renderChips();
    }
    setTimeout(function () { input.focus(); }, 50);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.add('sc-hidden');
  }

  function positionPanel() {
    var pad = 16, w = 340, h = panel.offsetHeight || 440;
    var left = Math.min(Math.max(16, drag.x - w / 2), window.innerWidth - w - pad);
    var top = drag.y - h - 68;
    if (top < pad) top = Math.min(drag.y + 68, window.innerHeight - h - pad);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    bubble = document.createElement('div');
    bubble.id = 'support-bubble';
    bubble.innerHTML = ICON + '<span class="sc-dot"></span>';
    document.body.appendChild(bubble);

    panel = document.createElement('div');
    panel.className = 'sc-panel sc-hidden';
    panel.innerHTML =
      '<div class="sc-header"><div class="sc-head-l"><div class="sc-avatar">KI</div><div><p class="sc-title">KI-Live-Support</p><p class="sc-sub" id="sc-sub"></p></div></div><button class="sc-x" type="button" aria-label="Chat schließen">×</button></div>' +
      '<div class="sc-msgs"></div><div class="sc-chips"></div>' +
      '<div class="sc-input-row"><input type="text" placeholder="Frage stellen …" aria-label="Nachricht"><button class="sc-send" type="button" aria-label="Senden">➤</button></div>';
    document.body.appendChild(panel);

    msgs = panel.querySelector('.sc-msgs');
    chips = panel.querySelector('.sc-chips');
    input = panel.querySelector('input');
    sendBtn = panel.querySelector('.sc-send');
    panel.querySelector('.sc-x').addEventListener('click', closePanel);
    sendBtn.addEventListener('click', function () { send(input.value); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(input.value); });

    // ---- Verschieben per Pointer-Events (Maus + Touch), Klick öffnet ----
    bubble.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, bx: bubble.offsetLeft, by: bubble.offsetTop, moved: false };
      bubble.setPointerCapture(e.pointerId);
    });
    bubble.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      var nx = drag.bx + dx, ny = drag.by + dy;
      nx = Math.max(4, Math.min(nx, window.innerWidth - bubble.offsetWidth - 4));
      ny = Math.max(4, Math.min(ny, window.innerHeight - bubble.offsetHeight - 4));
      bubble.style.left = nx + 'px';
      bubble.style.top = ny + 'px';
      bubble.style.right = 'auto';
      bubble.style.bottom = 'auto';
    });
    bubble.addEventListener('pointerup', function (e) {
      var wasDrag = drag && drag.moved;
      drag = null;
      if (wasDrag) return;
      if (isOpen) { closePanel(); return; }
      if (!withinHours()) {
        openPanel();
        addMsg('Der Live-Support ist für Basic-Nutzer von <b>9:00–18:00 Uhr</b> besetzt (jetzt: ' + timeNow() + '). Pro- und Elite-Mitglieder chatten rund um die Uhr – <a href="pricing.html">hier upgraden</a>.', 'sys');
        return;
      }
      openPanel();
    });

    window.addEventListener('resize', function () {
      bubble.style.left = '';
      bubble.style.top = '';
      bubble.style.right = '20px';
      bubble.style.bottom = '20px';
      if (isOpen) positionPanel();
    });

    applyAccess();
    setInterval(applyAccess, 60000);
  }

  function boot() {
    if (document.getElementById('support-bubble')) return;
    build();
    loadPlan().then(function () {
      var sub = document.getElementById('sc-sub');
      if (sub) sub.textContent = isPro() ? plan + ' · 24/7 online' : 'Basic · 9:00–18:00 Uhr';
      applyAccess();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
