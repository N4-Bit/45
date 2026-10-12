-- schema.postgres.sql – Vollständiges PostgreSQL-Schema für den KI Signal Hub
-- Für den echten Server-Betrieb (Produktion). Das Preview-Backend verwendet
-- denselben Satz an Tabellen in SQLite (siehe db.js).

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS wallet (
  id      INTEGER PRIMARY KEY,
  balance DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trades (
  id          SERIAL PRIMARY KEY,
  asset       TEXT NOT NULL,
  type        TEXT NOT NULL,
  result      TEXT NOT NULL,
  profit_loss DOUBLE PRECISION NOT NULL,
  date        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS providers (
  name      TEXT PRIMARY KEY,
  connected INTEGER NOT NULL DEFAULT 0,
  budget    DOUBLE PRECISION NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS license_keys (
  id         SERIAL PRIMARY KEY,
  key        TEXT UNIQUE NOT NULL,
  plan       TEXT NOT NULL,
  days       INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscription (
  id        SERIAL PRIMARY KEY,
  plan      TEXT NOT NULL,
  status    TEXT NOT NULL,
  renews_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS keys (
  code        TEXT PRIMARY KEY,
  plan        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'unused',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeemed_at TIMESTAMP,
  days        INTEGER,
  expires_at  TIMESTAMP
);

-- Jedes generierte KI-Signal wird hier protokolliert (Asset, Aktion,
-- Konfidenz, realer Kurs + 24h-Veränderung und die genutzte Datenquelle).
CREATE TABLE IF NOT EXISTS signals (
  id          SERIAL PRIMARY KEY,
  asset       TEXT NOT NULL,
  action      TEXT NOT NULL,
  confidence  DOUBLE PRECISION NOT NULL,
  duration    TEXT,
  price       DOUBLE PRECISION,
  change_24h  DOUBLE PRECISION,
  source      TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_signals_created ON signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_asset   ON signals (asset);

-- Cache der zuletzt abgerufenen Live-Kurse (CoinGecko/Binance/Yahoo).
CREATE TABLE IF NOT EXISTS market_cache (
  asset      TEXT PRIMARY KEY,
  price      DOUBLE PRECISION,
  change_24h DOUBLE PRECISION,
  source     TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Verlauf des KI-Live-Supports.
CREATE TABLE IF NOT EXISTS support_messages (
  id         SERIAL PRIMARY KEY,
  role       TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Basis-Seed: Startguthaben + Basic-Abo (idempotent).
INSERT INTO wallet (id, balance)
SELECT 1, 1000.00
WHERE NOT EXISTS (SELECT 1 FROM wallet);

INSERT INTO subscription (plan, status, renews_at)
SELECT 'Basic', 'active', NOW() + INTERVAL '30 days'
WHERE NOT EXISTS (SELECT 1 FROM subscription);
