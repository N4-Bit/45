// admin.js – Admin-Session, dynamische Admin-Navigation, Key-Generator & Key-Einlösung

const ADMIN_USER = { email: 'admin@signalhub.de', password: 'admin' };

async function ensureSchema() {
  await db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  await db.run('CREATE TABLE IF NOT EXISTS subscription (id INTEGER PRIMARY KEY AUTOINCREMENT, plan TEXT, status TEXT, renews_at TEXT)');
  await db.run("CREATE TABLE IF NOT EXISTS keys (code TEXT PRIMARY KEY, plan TEXT, status TEXT DEFAULT 'unused', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, redeemed_at DATETIME)");
  await db.run('ALTER TABLE keys ADD COLUMN days INTEGER').catch(() => {});
  await db.run('ALTER TABLE keys ADD COLUMN expires_at DATETIME').catch(() => {});
}

async function isAdmin() {
  const r = await db.get("SELECT value FROM settings WHERE key = 'is_admin'");
  return !!r && r.value === '1';
}

async function setAdmin(value) {
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['is_admin', value]);
}

window.clearSession = async () => {
  try { await db.run("UPDATE settings SET value = '0' WHERE key = 'is_admin'"); } catch (e) { /* ignore */ }
};

/* ---------- Navigation: Admin-Punkt nur für angemeldete Admins ---------- */
async function injectAdminNav() {
  if (!(await isAdmin())) return;
  const desktop = [...document.querySelectorAll('nav div')]
    .find(d => typeof d.className === 'string' && d.className.includes('md:flex'));
  if (desktop && !desktop.querySelector('a[href="admin.html"]')) {
    const a = document.createElement('a');
    a.href = 'admin.html';
    a.className = 'admin-pill bg-zinc-900/80 px-3 py-1.5 rounded-full text-xs flex items-center gap-2';
    a.innerHTML = '<i data-lucide="shield-check" class="w-3 h-3"></i> Admin';
    desktop.insertBefore(a, desktop.querySelector('#btn-logout'));
  }
  const mobile = document.getElementById('mobile-menu');
  if (mobile && !mobile.querySelector('a[href="admin.html"]')) {
    const a = document.createElement('a');
    a.href = 'admin.html';
    a.className = 'admin-pill flex items-center gap-3 p-3 rounded-xl';
    a.innerHTML = '<i data-lucide="shield-check" class="w-5 h-5"></i> Admin';
    mobile.insertBefore(a, document.getElementById('btn-logout-mobile'));
  }
}

/* ---------- Login / Registrierung ---------- */
function initLogin() {
  const f = document.getElementById('login-form');
  if (!f) return;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (f.querySelector('input[type="email"]').value || '').trim().toLowerCase();
    const pass = f.querySelector('input[type="password"]').value;
    const ok = email === ADMIN_USER.email && pass === ADMIN_USER.password;
    await setAdmin(ok ? '1' : '0');
    window.location.href = ok ? 'admin.html' : 'index.html';
  });
}

function initRegister() {
  const f = document.getElementById('register-form');
  if (!f) return;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await setAdmin('0');
    window.location.href = 'index.html';
  });
}

/* ---------- Admin-Panel ---------- */
let selectedTier = 'Pro';

function keySegment() {
  return Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0');
}
function keyFor(tier) {
  return `${tier === 'Pro' ? 'KIH-PRO' : 'KIH-ELT'}-${keySegment()}-${keySegment()}`;
}
async function uniqueKey(tier) {
  let k;
  do { k = keyFor(tier); } while (await db.get('SELECT code FROM keys WHERE code = ?', [k]));
  return k;
}

async function renderKeys() {
  const keys = await db.all('SELECT * FROM keys ORDER BY created_at DESC, rowid DESC');
  const tbody = document.getElementById('keys-body');
  const st = { total: document.getElementById('stat-total'), free: document.getElementById('stat-free'), used: document.getElementById('stat-used') };
  const free = keys.filter(k => k.status !== 'redeemed' && !k.expires_at || (k.status !== 'redeemed' && new Date(k.expires_at).getTime() > Date.now())).length;
  if (st.total) st.total.textContent = keys.length;
  if (st.free) st.free.textContent = free;
  if (st.used) st.used.textContent = keys.length - free;
  if (!tbody) return;
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-zinc-500 text-sm">Noch keine Keys generiert.</td></tr>';
    return;
  }
  const now = Date.now();
  const fmtDays = d => `${d} Tage`;
  const fmtLeft = exp => {
    if (!exp) return '–';
    const ms = new Date(exp).getTime() - now;
    if (ms <= 0) return 'abgelaufen';
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
    return `noch ${d}d ${h}h`;
  };
  tbody.innerHTML = keys.map(k => {
    const expired = k.expires_at && new Date(k.expires_at).getTime() <= now;
    const statusTxt = k.status === 'redeemed' ? 'EINGELÖST' : (expired ? 'ABGELAUFEN' : 'OFFEN');
    const statusCls = k.status === 'redeemed' ? 'text-zinc-500' : (expired ? 'text-red-400' : 'text-emerald-400');
    return `
    <tr class="hover:bg-zinc-800/50 transition-colors">
      <td class="px-6 py-3 font-mono text-white text-sm">${k.code}</td>
      <td class="px-6 py-3"><span class="plan-badge-${k.plan.toLowerCase()}">${k.plan}</span></td>
      <td class="px-6 py-3 text-xs font-bold ${statusCls}">${statusTxt}</td>
      <td class="px-6 py-3 text-zinc-400 text-xs">${k.days ? fmtDays(k.days) : '–'}</td>
      <td class="px-6 py-3 text-zinc-400 text-xs">${fmtLeft(k.expires_at)}</td>
      <td class="px-6 py-3 text-zinc-500 text-xs">${k.created_at || '–'}</td>
      <td class="px-6 py-3 text-right">
        ${k.status !== 'redeemed' ? `<button class="btn-glass key-delete px-3 py-1 rounded-lg text-xs font-bold" data-code="${k.code}">Löschen</button>` : ''}
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.key-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Key ${btn.dataset.code} löschen?`)) return;
      await db.run('DELETE FROM keys WHERE code = ? AND status != \'redeemed\'', [btn.dataset.code]);
      await renderKeys();
    });
  });
}

async function initAdminPage() {
  const panel = document.getElementById('admin-panel');
  const guard = document.getElementById('admin-guard');
  if (!panel || !guard) return;
  if (!(await isAdmin())) {
    panel.classList.add('hidden');
    guard.classList.remove('hidden');
    return;
  }
  guard.classList.add('hidden');
  panel.classList.remove('hidden');

  document.querySelectorAll('.tier-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedTier = card.dataset.tier;
      document.querySelectorAll('.tier-card').forEach(c => c.classList.toggle('selected-tier', c === card));
      document.getElementById('gen-tier-label').textContent = selectedTier;
    });
  });

  document.getElementById('btn-gen-key')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const days = Math.max(1, parseInt(document.getElementById('key-days')?.value, 10) || 30);
    const code = await uniqueKey(selectedTier);
    await db.run('INSERT INTO keys (code, plan, days, expires_at) VALUES (?, ?, ?, ?)', [code, selectedTier, days, new Date(Date.now() + days * 864e5).toISOString()]);
    const res = document.getElementById('key-result');
    const out = document.getElementById('generated-key');
    if (out) out.textContent = code;
    if (res) { res.classList.remove('hidden'); res.classList.add('flex'); }
    btn.disabled = false;
    await renderKeys();
  });

  document.getElementById('btn-copy-generated')?.addEventListener('click', async () => {
    const key = document.getElementById('generated-key').textContent;
    try { await navigator.clipboard.writeText(key); } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = key; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    const b = document.getElementById('btn-copy-generated');
    if (b) { const o = b.textContent; b.textContent = '✓ Kopiert'; setTimeout(() => { b.textContent = o; }, 1500); }
  });

  await renderKeys();
}

/* ---------- Key-Einlösung (Pricing-Seite) ---------- */
async function initRedeem() {
  const btn = document.getElementById('btn-redeem');
  if (!btn) return;
  const chip = document.getElementById('current-plan-chip');
  const updChip = async () => {
    if (!chip) return;
    const s = await db.get('SELECT plan FROM subscription LIMIT 1');
    chip.textContent = s ? `Aktueller Plan: ${s.plan}` : 'Aktueller Plan: Basic';
  };
  await updChip();
  btn.addEventListener('click', async () => {
    const inp = document.getElementById('redeem-key');
    const msg = document.getElementById('redeem-msg');
    const code = ((inp && inp.value) || '').trim().toUpperCase();
    if (!code) { alert('Bitte einen Key eingeben.'); return; }
    const k = await db.get('SELECT * FROM keys WHERE code = ?', [code]);
    if (!k) { alert('Key nicht gefunden. Überprüfe die Eingabe.'); return; }
    if (k.status === 'redeemed') { alert('Dieser Key wurde bereits eingelöst.'); return; }
    if (k.expires_at && new Date(k.expires_at).getTime() <= Date.now()) { alert('Dieser Key ist abgelaufen.'); return; }
    await db.run("UPDATE keys SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP WHERE code = ?", [code]);
    const sub = await db.get('SELECT id FROM subscription LIMIT 1');
    if (sub) {
      await db.run("UPDATE subscription SET plan = ?, status = 'active' WHERE id = ?", [k.plan, sub.id]);
    } else {
      await db.run("INSERT INTO subscription (plan, status, renews_at) VALUES (?, 'active', ?)", [k.plan, new Date(Date.now() + 30 * 864e5).toISOString()]);
    }
    if (msg) { msg.textContent = `✓ Key eingelöst – ${k.plan}-Funktionen sind aktiviert!`; msg.classList.remove('hidden'); }
    if (inp) inp.value = '';
    // Plan-Anzeige auf der Profil-Seite sofort aktualisieren
    const planEl2 = document.getElementById('sub-plan');
    const featEl2 = document.getElementById('plan-features');
    if (planEl2) planEl2.textContent = k.plan;
    if (featEl2) featEl2.textContent = k.plan === 'Elite'
      ? 'Signale: unbegrenzt · Auto-Invest · Custom AI Modelle · API Enterprise'
      : k.plan === 'Pro'
        ? 'Signale: unbegrenzt · Auto-Invest · Priority Support'
        : 'Signale: 3 pro Tag · Basis-Analyse · Kein Auto-Invest';
    await updChip();
  });
}

/* ---------- Auto-Invest nur mit Pro/Elite-Key ---------- */
async function initAutoInvestGate() {
  const t = document.getElementById('auto-invest-toggle');
  if (!t) return;
  t.addEventListener('change', async () => {
    if (!t.checked) return;
    const s = await db.get('SELECT plan FROM subscription LIMIT 1');
    if (!s || (s.plan !== 'Pro' && s.plan !== 'Elite')) {
      t.checked = false;
      alert('Auto-Invest ist ein Pro/Elite-Feature.\n\nLöse einen Aktivierungskey auf der Profil-Seite ein, um es freizuschalten.');
    }
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  try { await ensureSchema(); } catch (e) { /* ignore */ }
  await injectAdminNav();
  initLogin();
  initRegister();
  initRedeem();
  initAutoInvestGate();
  await initAdminPage();
  if (typeof lucide !== 'undefined') lucide.createIcons();
});
