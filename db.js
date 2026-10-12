// db.js – ZENTRALE Datenbank-Schicht für die GESAMTE Website
// Alle Seiten (Dashboard, Profil, Wallet, Pricing, Admin, ...) teilen sich
// dieselbe projektweite Datenbank. Dieses Modul ist die EINZIGE Quelle für
// das Schema – es läuft idempotent auf jeder Seite und seedet die Basics.
(function () {
  // Ein Schema für die ganze Anwendung (SQLite-Dialekt des Preview-Backends).
  // Die PostgreSQL-Version für den echten Server-Betrieb liegt in schema.postgres.sql.
  const SCHEMA_SQL = [
    'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)',
    'CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL)',
    'CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, asset TEXT, type TEXT, result TEXT, profit_loss REAL, date DATETIME DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS providers (name TEXT PRIMARY KEY, connected INTEGER, budget REAL DEFAULT 100)',
    'CREATE TABLE IF NOT EXISTS license_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, plan TEXT, days INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at TEXT, used INTEGER DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS subscription (id INTEGER PRIMARY KEY AUTOINCREMENT, plan TEXT, status TEXT, renews_at TEXT)',
    'CREATE TABLE IF NOT EXISTS keys (code TEXT PRIMARY KEY, plan TEXT, status TEXT DEFAULT \'unused\', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, redeemed_at DATETIME, days INTEGER, expires_at DATETIME)',
    'CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT, asset TEXT, action TEXT, confidence REAL, duration TEXT, price REAL, change_24h REAL, source TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
  ];

  let readyPromise = null;

  async function ensureSchema() {
    for (const sql of SCHEMA_SQL) {
      try { await db.run(sql); } catch (e) { /* Tabelle existiert bereits */ }
    }
    // Nachträgliche Spalten für Bestands-DBs absichern
    try { await db.run('ALTER TABLE providers ADD COLUMN budget REAL DEFAULT 100'); } catch (e) {}
    try { await db.run('ALTER TABLE keys ADD COLUMN days INTEGER'); } catch (e) {}
    try { await db.run('ALTER TABLE keys ADD COLUMN expires_at DATETIME'); } catch (e) {}
    // Basis-Seed: Startguthaben + Basic-Abo, falls noch nicht vorhanden
    const wallet = await db.get('SELECT id FROM wallet LIMIT 1');
    if (!wallet) await db.run('INSERT INTO wallet (balance) VALUES (1000.00)');
    const sub = await db.get('SELECT id FROM subscription LIMIT 1');
    if (!sub) {
      const renews = new Date(Date.now() + 30 * 864e5).toISOString();
      await db.run("INSERT INTO subscription (plan, status, renews_at) VALUES ('Basic', 'active', ?)", [renews]);
    }
  }

  // Einmalig pro Seitenladung initialisieren – von jeder Seite aufrufbar.
  window.dbReady = function () {
    if (!readyPromise) readyPromise = ensureSchema();
    return readyPromise;
  };

  // Auto-Start: Sobald das DOM steht, ist das Schema auf JEDER Seite garantiert da.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.dbReady().catch(() => {}); });
  } else {
    window.dbReady().catch(() => {});
  }
})();
