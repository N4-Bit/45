async function initDb() {
  await db.run('CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL);');
  await db.run('CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, asset TEXT, type TEXT, result TEXT, profit_loss REAL, date DATETIME DEFAULT CURRENT_TIMESTAMP);');
  await db.run('CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT, asset TEXT, action TEXT, confidence REAL, duration TEXT, price REAL, change_24h REAL, source TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)').catch(() => {});;
  await db.run("CREATE TABLE IF NOT EXISTS providers (name TEXT PRIMARY KEY, connected INTEGER, budget REAL DEFAULT 100)");
  await db.run('ALTER TABLE providers ADD COLUMN budget REAL DEFAULT 100').catch(() => {});
  await db.run('CREATE TABLE IF NOT EXISTS license_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, plan TEXT, days INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at TEXT, used INTEGER DEFAULT 0)');
  await db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  const wallet = await db.get('SELECT * FROM wallet');
  if (!wallet) await db.run('INSERT INTO wallet (balance) VALUES (1000.00)');
}

async function renderProviders() {
  const wrap = document.getElementById('connected-wallets');
  if (!wrap) return;
  const providers = await db.all('SELECT name, budget FROM providers WHERE connected = 1 ORDER BY name');
  if (!providers.length) {
    wrap.innerHTML = '<p class="text-zinc-500 text-sm">Keine Anbieter verbunden. <a href="wallet-settings.html" class="text-emerald-400 hover:text-emerald-300">Jetzt verbinden →</a></p>';
    return;
  }
  wrap.innerHTML = providers.map(p => `
    <div class="p-4 bg-black/40 rounded-2xl border border-zinc-800">
      <div class="flex items-center justify-between mb-3">
        <p class="text-white font-bold">${p.name}</p>
        <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">VERBUNDEN</span>
      </div>
      <label class="text-xs uppercase font-bold text-zinc-500 block mb-1">KI-Handelsbudget ($)</label>
      <div class="flex gap-2">
        <input type="number" min="0" step="10" value="${p.budget ?? 100}" data-budget-input="${p.name}" class="w-full bg-black/40 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500/50 transition-colors">
        <button class="budget-save btn-glass shrink-0 px-3 py-2 rounded-lg text-xs font-bold" data-provider="${p.name}">Speichern</button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('.budget-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = wrap.querySelector(`[data-budget-input="${btn.dataset.provider}"]`);
      const val = parseFloat(input.value);
      if (isNaN(val) || val < 0) { alert('Bitte einen gültigen Betrag eingeben.'); return; }
      await db.run('UPDATE providers SET budget = ? WHERE name = ?', [val, btn.dataset.provider]);
      btn.textContent = '✓ Gespeichert';
      setTimeout(() => { btn.textContent = 'Speichern'; }, 1500);
    });
  });
}

async function updateBalanceDisplay() {
  const row = await db.get('SELECT balance FROM wallet');
  const bal = row ? row.balance : 0;
  const bDisp = document.getElementById('balance-display');
  const bAmt = document.getElementById('balance-amount');
  const bAmtMobile = document.getElementById('balance-amount-mobile');
  if (bDisp) bDisp.textContent = bal.toFixed(2);
  if (bAmt) bAmt.textContent = `$${bal.toFixed(2)}`;
  if (bAmtMobile) bAmtMobile.textContent = `$${bal.toFixed(2)}`;
}

async function loadTrades() {
  const trades = await db.all('SELECT * FROM trades ORDER BY date DESC LIMIT 10');
  const tbody = document.getElementById('trade-history-body');
  if (!tbody) return;
  tbody.innerHTML = trades.map(t => `
    <tr class="hover:bg-zinc-800/50 transition-colors">
      <td class="px-6 py-4 text-white font-medium">${t.asset}</td>
      <td class="px-6 py-4 text-zinc-400">${t.type}</td>
      <td class="px-6 py-4">
        <span class="px-2 py-1 rounded-full text-xs font-bold ${t.result === 'Win' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}">${t.result}</span>
      </td>
      <td class="px-6 py-4 text-right font-mono ${t.profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}">${t.profit_loss > 0 ? '+' : ''}${t.profit_loss.toFixed(2)}%</td>
    </tr>
  `).join('');
}

async function fetchMarketData(assetId) {
  if (window.marketData && window.marketData.getQuote) {
    try { return await window.marketData.getQuote(assetId); } catch (e) { /* weiter unten fallback */ }
  }
  // Notfall-Fallback, falls market-data.js nicht geladen wurde
  const cryptoMapping = { 'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana' };
  try {
    const id = cryptoMapping[assetId];
    if (!id) throw new Error('kein Krypto-Asset');
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
    const data = await response.json();
    if (data[id]) return { price: data[id].usd, change: data[id].usd_24h_change, source: 'CoinGecko (live)', live: true };
  } catch (e) { /* ignore */ }
  return { price: 0, change: Math.random() * 4 - 2, source: 'Fallback-Simulation', live: false };
}

// Chart der analysierten Kursreihe zeichnen (Chart.js, falls geladen)
let _signalChart = null;
function drawSignalChart(asset, action, series) {
  const canvas = document.getElementById('signal-chart');
  if (!canvas || !series || !series.length) return;
  if (typeof Chart === 'undefined') { canvas.closest('.chart-wrap')?.classList.add('hidden'); return; }
  canvas.closest('.chart-wrap')?.classList.remove('hidden');
  const labels = series.map((_, i) => 'T-' + (series.length - 1 - i));
  const color = action === 'LONG' ? '#10b981' : '#ef4444';
  if (_signalChart) _signalChart.destroy();
  _signalChart = new Chart(canvas, {
    type: 'line',
    data: { labels: labels, datasets: [{ label: asset + ' · 30 Tage', data: series, borderColor: color, backgroundColor: action === 'LONG' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#71717a', maxTicksLimit: 6, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#71717a', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

async function startAnalysis() {
  const btn = document.getElementById('btn-analyze');
  const btnText = document.getElementById('btn-text');
  const loader = document.getElementById('loader');
  const signalCard = document.getElementById('signal-card');
  if (!btn) return;

  // PLAN-GATE: Basic = 3 Signale pro Tag (nur Basis-Analyse) · Pro/Elite = unbegrenzt
  const plan = await getCurrentPlan();
  if (plan === 'Basic' && (await signalsUsedToday()) >= 3) {
    alert('Basis-Analyse-Limit erreicht: Im Basic-Plan sind 3 Signale pro Tag enthalten.\n\nUnbegrenzte Signale, Auto-Invest und Priority Support erhältst du mit Pro – Custom AI Modelle und API Enterprise mit Elite. Löse einen Aktivierungskey auf der Profil-Seite ein (siehe pricing.html).');
    return;
  }

  btn.disabled = true;
  if (btnText) btnText.classList.add('hidden');
  if (loader) loader.classList.remove('hidden');
  if (signalCard) signalCard.classList.add('hidden', 'scale-95', 'opacity-0');
  // Sicherheitsnetz: Button immer wiederherstellen, egal was passiert
  const restoreBtn = () => {
    btn.disabled = false;
    if (btnText) btnText.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
  };
  setTimeout(restoreBtn, 15000);

  const assets = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'NVDA', 'TSLA', 'AAPL'];
  const asset = assets[Math.floor(Math.random() * assets.length)];
  // Echte technische Analyse: SMA(7)/SMA(25)-Crossover + RSI(14) aus Live-Kursreihe
  let an;
  try { an = window.marketData && window.marketData.getAnalysis ? await window.marketData.getAnalysis(asset) : null; } catch (e) { an = null; }
  if (!an) {
    const q = await fetchMarketData(asset);
    an = { action: (q.change || 0) >= 0 ? 'LONG' : 'SHORT', confidence: 60, reason: 'Nur 24h-Change verfügbar', series: null, source: q.source, live: !!q.live, price: q.price };
  }
  const action = an.action;
  const conf = String(an.confidence);
  const duration = ['24h', '1 Woche', 'Scalp'][Math.floor(Math.random() * 3)];
  const price = an.price || (an.series && an.series.length ? an.series[an.series.length - 1] : 0);

  await new Promise(r => setTimeout(r, 1200));

  document.getElementById('signal-action').textContent = action;
  document.getElementById('signal-asset').textContent = asset;
  document.getElementById('signal-confidence').textContent = `${conf}%`;
  document.getElementById('signal-duration').textContent = duration;

  // Datenquelle + realer Kurs + ECHTE Indikator-Begründung (Transparenz)
  const depth = plan === 'Elite' ? 'Custom AI Modelle (Elite)' : plan === 'Pro' ? 'Advanced AI Analytics (Pro)' : 'Basis-Analyse (Basic)';
  const srcEl = document.getElementById('signal-source');
  if (srcEl) srcEl.textContent = `${an.source} · Kurs: $${price ? price.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '–'} · ${an.reason || ''} · ${depth}`;

  // Signal in der DB protokollieren (Audit für Präzisions-Analysen)
  try {
    await db.run('INSERT INTO signals (asset, action, confidence, duration, price, change_24h, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [asset, action, parseFloat(conf), duration, price || 0, 0, an.source || 'unbekannt']);
  } catch (e) { /* Protokollierung ist optional */ }

  // Chart der Kursreihe zeichnen (Punkt 8)
  drawSignalChart(asset, action, an.series);
  
  const glow = document.getElementById('signal-glow');
  if (glow) glow.className = `absolute top-0 left-0 w-full h-1 transition-colors duration-500 ${action === 'LONG' ? 'bg-emerald-500' : 'bg-red-500'}`;
  
  const actionEl = document.getElementById('signal-action');
  if (actionEl) actionEl.className = `text-5xl font-black mb-4 tracking-tighter ${action === 'LONG' ? 'signal-long' : 'signal-short'}`;
  
  btn.disabled = false;
  if (btnText) btnText.classList.remove('hidden');
  if (loader) loader.classList.add('hidden');
  if (signalCard) {
    signalCard.classList.remove('hidden');
    setTimeout(() => {
      signalCard.classList.remove('scale-95', 'opacity-0');
      signalCard.classList.add('scale-100', 'opacity-100');
    }, 50);
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();

  if (document.getElementById('auto-invest-toggle')?.checked && await planAllows('auto-invest')) {
    const row = await db.get('SELECT balance FROM wallet');
    if (row && row.balance > 0) {
      setTimeout(async () => {
        const win = Math.random() > 0.45;
        const pl = win ? (Math.random() * 4 + 1) : -(Math.random() * 3 + 1);
        const provs = await db.all('SELECT budget FROM providers WHERE connected = 1');
            const stake = provs.reduce((s, p) => s + (p.budget || 0), 0) || row.balance * 0.1;
            const profitAmount = stake * pl / 100;
        await db.run('UPDATE wallet SET balance = balance + ?', [profitAmount]);
        await db.run('INSERT INTO trades (asset, type, result, profit_loss) VALUES (?, ?, ?, ?)', [asset, action, win ? 'Win' : 'Loss', pl]);
        await updateBalanceDisplay();
        await loadTrades();
      }, 2000);
    }
  }
}

// ==================== PLAN-SYSTEM (Basic/Pro/Elite) ====================
// Quota-Helfer: Basic hat 3 Signale pro Tag (nur Basis-Analyse)
async function signalsUsedToday() {
  try {
    const r = await db.get("SELECT COUNT(*) AS n FROM signals WHERE created_at >= date('now', 'start of day')");
    return r && r.n ? r.n : 0;
  } catch (e) { return 0; }
}

async function basicQuotaLeft() {
  return Math.max(0, 3 - (await signalsUsedToday()));
}

async function getCurrentPlan() {
  try {
    const s = await db.get('SELECT plan FROM subscription LIMIT 1');
    return s ? s.plan : 'Basic';
  } catch (e) { return 'Basic'; }
}

async function planAllows(feature) {
  const plan = await getCurrentPlan();
  if (plan === 'Elite') return true;               // Elite: alles aus Pro + Custom AI + API Enterprise
  if (plan === 'Pro') return feature !== 'elite';  // Pro: unbegrenzte Signale, Auto-Invest, Priority Support
  return false;                                    // Basic: nur Basis-Analyse
}

function generateLicenseKey(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h + seed.charCodeAt(i)) | 0; }
  const seg = n => Math.abs(h * 2654435761 + n * 40503).toString(16).toUpperCase().slice(-4).padStart(4, 'X');
  return `KIH-${seg(1)}-${seg(2)}-${seg(3)}-${seg(4)}`;
}

async function initProfileEntry() {
  const keyEl = document.getElementById('license-key');
  if (!keyEl) return;
  await db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  await db.run('CREATE TABLE IF NOT EXISTS subscription (id INTEGER PRIMARY KEY AUTOINCREMENT, plan TEXT, status TEXT, renews_at TEXT)');
  let keyRow = await db.get("SELECT value FROM settings WHERE key = 'license_key'");
  if (!keyRow) {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['license_key', generateLicenseKey('johndoe_trade')]);
    keyRow = await db.get("SELECT value FROM settings WHERE key = 'license_key'");
  }
  keyEl.textContent = keyRow.value;
  let sub = await db.get('SELECT * FROM subscription LIMIT 1');
  if (!sub) {
    const renews = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.run("INSERT INTO subscription (plan, status, renews_at) VALUES ('Basic', 'active', ?)", [renews]);
    sub = await db.get('SELECT * FROM subscription LIMIT 1');
  }
  const planEl = document.getElementById('sub-plan');
  const statusEl = document.getElementById('sub-status');
  const renewsEl = document.getElementById('sub-renews');
  if (planEl) planEl.textContent = sub.plan;
  // Feature-Liste dynamisch nach Plan (Basic = 3 Signale/Tag + Basis-Analyse)
  const featEl = document.getElementById('plan-features');
  if (featEl) featEl.textContent = sub.plan === 'Elite'
    ? 'Signale: unbegrenzt · Auto-Invest · Custom AI Modelle · API Enterprise'
    : sub.plan === 'Pro'
      ? 'Signale: unbegrenzt · Auto-Invest · Priority Support'
      : 'Signale: 3 pro Tag · Basis-Analyse';
  if (statusEl) {
    statusEl.textContent = sub.status.toUpperCase();
    statusEl.className = sub.status === 'active'
      ? 'px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20'
      : 'px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-bold border border-red-500/20';
  }
  if (renewsEl && sub.renews_at) renewsEl.textContent = new Date(sub.renews_at).toLocaleDateString('de-DE');
  document.getElementById('btn-copy-key')?.addEventListener('click', async () => {
    const key = document.getElementById('license-key').textContent;
    try { await navigator.clipboard.writeText(key); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = key; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    const btn = document.getElementById('btn-copy-key');
    if (btn) { const old = btn.innerHTML; btn.textContent = '✓ Kopiert'; setTimeout(() => { btn.innerHTML = old; if (typeof lucide !== 'undefined') lucide.createIcons(); }, 1500); }
  });
}

// ==================== DROPDOWN-NAVIGATION ====================
const NAV_ITEMS = [
  ['home', 'Dashboard', 'index.html'],
  ['user', 'Profil', 'profile.html'],
  ['credit-card', 'Wallet', 'wallet-settings.html'],
  ['tag', 'Pricing', 'pricing.html'],
  ['help-circle', 'FAQ', 'faq.html'],
  ['mail', 'Kontakt', 'contact.html'],
  ['settings', 'Einstellungen', 'settings.html']
];

function buildDropdownNav() {
  const nav = document.querySelector('nav');
  if (!nav || document.getElementById('nav-dropdown-btn')) return;
  const mBtn = document.getElementById('mobile-menu-btn');
  if (mBtn && mBtn.parentElement) mBtn.parentElement.remove();
  const mMenu = document.getElementById('mobile-menu');
  if (mMenu) mMenu.remove();
  const old = [...nav.querySelectorAll('div')].find(d => typeof d.className === 'string' && d.className.includes('md:flex'));
  const hasAdminLogout = !!(old && old.querySelector('#admin-logout'));
  const logoutId = hasAdminLogout ? 'admin-logout' : 'btn-logout';
  const here = location.pathname.split('/').pop() || 'index.html';
  const linksHtml = NAV_ITEMS.map(it =>
    `<a href="${it[2]}" class="nav-dropdown-item${it[2] === here ? ' nav-active' : ''}"><i data-lucide="${it[0]}" class="w-4 h-4"></i>${it[1]}</a>`
  ).join('');
  const logoutHtml = `<button id="${logoutId}" class="nav-dropdown-item nav-dropdown-danger w-full text-left"><i data-lucide="log-out" class="w-4 h-4"></i> Logout</button>`;
  const wrap = document.createElement('div');
  wrap.className = 'nav-actions relative flex items-center gap-2 md:flex';
  wrap.innerHTML =
    `<button id="nav-dropdown-btn" class="btn-glass px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2" aria-expanded="false" aria-controls="nav-dropdown-panel"><i data-lucide="menu" class="w-4 h-4"></i><span>MENÜ</span><i data-lucide="chevron-down" class="w-3 h-3 caret"></i></button>` +
    `<div id="nav-dropdown-panel" class="hidden nav-dropdown-panel absolute right-0 top-full mt-3 w-64 z-50">${linksHtml}<a id="admin-nav-link" href="admin.html" class="nav-dropdown-item hidden"><i data-lucide="shield-check" class="w-4 h-4"></i> Admin</a><div class="nav-dropdown-sep"></div>${logoutHtml}</div>`;
  if (old) old.replaceWith(wrap);
  else {
    const brandRow = nav.querySelector(':scope > div');
    if (brandRow) brandRow.appendChild(wrap);
  }
  wireNavDropdown();
}

function wireNavDropdown() {
  if (document.body.dataset.navDropdownWired) return;
  document.body.dataset.navDropdownWired = '1';
  const closePanel = () => {
    const panel = document.getElementById('nav-dropdown-panel');
    const btn = document.getElementById('nav-dropdown-btn');
    if (panel) panel.classList.add('hidden');
    if (btn) { btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  };
  document.addEventListener('click', (e) => {
    const btn = document.getElementById('nav-dropdown-btn');
    const panel = document.getElementById('nav-dropdown-panel');
    if (!btn || !panel) return;
    if (e.target.closest('#nav-dropdown-btn')) {
      const open = panel.classList.toggle('hidden') === false;
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      return;
    }
    if (!panel.classList.contains('hidden') && !e.target.closest('#nav-dropdown-panel')) closePanel();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
}

window.addEventListener('DOMContentLoaded', async () => {
  await initDb();
  await initProfileEntry();
  await initAdminLogin();
  await initAdminPanel();
  await updateAdminNavLink();
  await updateBalanceDisplay();
  if (await isUserLoggedIn()) await loadTrades();
  
  document.getElementById('btn-analyze')?.addEventListener('click', startAnalysis);

  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  document.getElementById('btn-logout-mobile')?.addEventListener('click', () => {
    if(confirm('Möchten Sie sich wirklich ausloggen?')) {
      alert('Sie wurden erfolgreich ausgeloggt!');
      window.location.reload();
    }
  });
  document.getElementById('btn-deposit')?.addEventListener('click', async () => {
    const amount = prompt('Betrag einzahlen ($):');
    if (amount && !isNaN(amount)) {
      await db.run('UPDATE wallet SET balance = balance + ?', [parseFloat(amount)]);
      updateBalanceDisplay();
    }
  });
  document.getElementById('btn-withdraw')?.addEventListener('click', async () => {
    const amount = prompt('Betrag abheben ($):');
    if (amount && !isNaN(amount)) {
      const row = await db.get('SELECT balance FROM wallet');
      if (parseFloat(amount) <= (row?.balance || 0)) {
        await db.run('UPDATE wallet SET balance = balance - ?', [parseFloat(amount)]);
        updateBalanceDisplay();
      } else alert('Unzureichendes Guthaben!');
    }
  });
  const MAX_PROVIDERS = 3;
  const updateProviderCounter = async () => {
    const counter = document.getElementById('provider-counter');
    if (!counter) return;
    const conn = await db.all('SELECT name FROM providers WHERE connected = 1');
    counter.textContent = `${conn.length}/3 verbunden`;
    counter.classList.toggle('text-emerald-400', conn.length >= MAX_PROVIDERS);
  };

  document.querySelectorAll('.provider-connect').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isConnected = btn.classList.contains('glow-button');
      if (isConnected) {
        if (!confirm(`${btn.dataset.provider} trennen?`)) return;
        await db.run('DELETE FROM providers WHERE name = ?', [btn.dataset.provider]);
        btn.textContent = 'Verbinden';
        btn.classList.remove('glow-button');
        btn.classList.add('btn-glass');
        await updateProviderCounter();
        return;
      }
      const connectedCount = (await db.all('SELECT name FROM providers WHERE connected = 1')).length;
      if (connectedCount >= MAX_PROVIDERS) {
        alert('Maximal 3 Anbieter können gleichzeitig verknüpft sein!\nBitte zuerst eine Verbindung trennen.');
        return;
      }
      const provider = btn.dataset.provider;
      const key = prompt(`API-Key für ${provider} eingeben:`);
      if (!key) return;
      const secret = prompt(`${provider} Secret-Key eingeben:`);
      if (!secret) return;
      btn.textContent = 'Verbinde...';
      btn.disabled = true;
      await new Promise(r => setTimeout(r, 800));
      try {
        await db.run('CREATE TABLE IF NOT EXISTS providers (name TEXT PRIMARY KEY, connected INTEGER)');
        await db.run('INSERT OR REPLACE INTO providers (name, connected) VALUES (?, 1)', [provider]);
        btn.textContent = '✓ Verbunden';
        btn.classList.remove('btn-glass');
        btn.classList.add('glow-button');
        await updateProviderCounter();
      } catch (e) {
        btn.textContent = 'Verbinden';
        btn.disabled = false;
      }
    });
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if(confirm('Möchten Sie sich wirklich ausloggen?')) {
      await clearUserSession();
      window.location.href = 'login.html';
    }
  });
  // Restore connected provider states from DB
  try {
    const connected = await db.all('SELECT name FROM providers WHERE connected = 1');
    connected.forEach(p => {
      document.querySelectorAll('.provider-connect').forEach(btn => {
        if (btn.dataset.provider === p.name) {
          btn.textContent = '✓ Verbunden';
          btn.classList.remove('btn-glass');
          btn.classList.add('glow-button');
        }
      });
    });
    if (await isUserLoggedIn()) await renderProviders();
  } catch (e) { /* table might not exist yet */ }

  if (typeof lucide !== 'undefined') lucide.createIcons();
});

// ==================== ADMIN KEY SYSTEM ====================
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'SignalHub2024!';

function randomKeyString(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function generatePlanKey(plan) {
  const prefix = plan === 'Elite' ? 'ELITE' : 'PRO';
  return `${prefix}-${randomKeyString(4)}-${randomKeyString(4)}-${randomKeyString(4)}`;
}

async function isAdminLogged() {
  try {
    const row = await db.get("SELECT value FROM settings WHERE key = 'admin_session'");
    return !!row;
  } catch (e) { return false; }
}

async function initAdminLogin() {
  const form = document.getElementById('admin-login-form');
  if (!form) return;
  if (await isAdminLogged()) { window.location.href = 'admin.html'; return; }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('admin-user').value.trim();
    const p = document.getElementById('admin-pass').value;
    const errBox = document.getElementById('login-error');
    if (u === ADMIN_USERNAME && p === ADMIN_PASSWORD) {
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_session', ?)", [String(Date.now())]);
      window.location.href = 'admin.html';
    } else if (errBox) {
      errBox.textContent = 'Falscher Benutzername oder Passwort.';
      errBox.classList.remove('hidden');
    }
  });
}

async function renderAdminKeys() {
  const tbody = document.getElementById('keys-table-body');
  if (!tbody) return;
  const keys = await db.all('SELECT * FROM license_keys ORDER BY id DESC');
  const count = document.getElementById('keys-count');
  if (count) count.textContent = `${keys.length} ${keys.length === 1 ? 'Key' : 'Keys'}`;
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-zinc-500 text-sm">Noch keine Keys generiert.</td></tr>';
    return;
  }
  const now = Date.now();
  tbody.innerHTML = keys.map(k => {
    const expired = k.expires_at && (new Date(k.expires_at).getTime() < now);
    const status = expired ? 'ABGELAUFEN' : (k.used ? 'AKTIV' : 'OFFEN');
    const statusCls = expired ? 'bg-red-500/10 text-red-400 border border-red-500/20'
      : k.used ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
      : 'bg-zinc-800 text-zinc-400 border border-zinc-700';
    return `<tr class="hover:bg-zinc-800/50 transition-colors">
      <td class="px-6 py-4 font-mono text-white text-sm break-all">${k.key}</td>
      <td class="px-6 py-4"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${k.plan === 'Elite' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}">${k.plan}</span></td>
      <td class="px-6 py-4 text-zinc-400 text-sm">${k.expires_at ? new Date(k.expires_at).toLocaleDateString('de-DE') : '–'}</td>
      <td class="px-6 py-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusCls}">${status}</span></td>
      <td class="px-6 py-4 text-right"><button class="btn-danger px-3 py-1.5 rounded-lg text-xs font-bold" data-del-key="${k.id}">Löschen</button></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-del-key]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Diesen Key löschen?')) return;
      await db.run('DELETE FROM license_keys WHERE id = ?', [parseInt(btn.dataset.delKey)]);
      await renderAdminKeys();
    });
  });
}

async function initAdminPanel() {
  const keyForm = document.getElementById('key-gen-form');
  if (!keyForm) return;
  if (!(await isAdminLogged())) { window.location.href = 'admin-login.html'; return; }
  keyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const plan = document.getElementById('key-type').value;
    const days = Math.max(1, parseInt(document.getElementById('key-days').value, 10) || 30);
    const newKey = generatePlanKey(plan);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await db.run('INSERT INTO license_keys (key, plan, days, expires_at) VALUES (?, ?, ?, ?)', [newKey, plan, days, expiresAt]);
    const box = document.getElementById('generated-key-box');
    const keyEl = document.getElementById('generated-key');
    if (keyEl) keyEl.textContent = newKey;
    if (box) box.classList.remove('hidden');
    await renderAdminKeys();
  });
  document.getElementById('btn-copy-gen')?.addEventListener('click', async () => {
    const key = document.getElementById('generated-key').textContent;
    try { await navigator.clipboard.writeText(key); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = key; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    const b = document.getElementById('btn-copy-gen');
    if (b) { const old = b.textContent; b.textContent = '✓ Kopiert'; setTimeout(() => { b.textContent = old; }, 1500); }
  });
  document.getElementById('admin-logout')?.addEventListener('click', async () => {
    await db.run("DELETE FROM settings WHERE key = 'admin_session'");
    window.location.href = 'index.html';
  });
  await renderAdminKeys();
}

async function updateAdminNavLink() {
  const logged = await isAdminLogged();
  const desktop = document.getElementById('admin-nav-link');
  if (desktop) {
    desktop.classList.toggle('hidden', !logged);
    if (logged) desktop.classList.add('flex');
  }
  document.querySelectorAll('#admin-nav-link-mobile').forEach(el => {
    el.classList.toggle('hidden', !logged);
    el.classList.toggle('flex', logged);
  });
};

// Expose for tests/external access
window._admin = { ADMIN_USERNAME, generatePlanKey, isAdminLogged, updateAdminNavLink };

// ==================== SESSION & SHOWCASE-MODUS (index.html) ====================
function _shEl(id) { return document.getElementById(id); }

async function isUserLoggedIn() {
  try {
    const r = await db.get("SELECT value FROM settings WHERE key = 'user_session'");
    return !!r && r.value === '1';
  } catch (e) { return false; }
}

async function setUserSession() {
  await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('user_session', '1')");
}

async function clearUserSession() {
  try { await db.run("DELETE FROM settings WHERE key = 'user_session'"); } catch (e) { /* ignore */ }
}

const DEMO_ASSETS = [
  { asset: 'BTC/USD', type: 'LONG' }, { asset: 'ETH/USD', type: 'SHORT' },
  { asset: 'SOL/USD', type: 'LONG' }, { asset: 'NVDA', type: 'LONG' },
  { asset: 'TSLA', type: 'SHORT' }, { asset: 'AAPL', type: 'LONG' }
];