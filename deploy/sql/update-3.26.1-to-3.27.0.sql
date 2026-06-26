-- ValorGrid update 3.26.1 -> 3.27.0
-- Objetivo: habilitar dividendos detectados desde Yahoo Finance, borradores revisables,
-- auto-inclusion por instrumento y movimientos de tipo dividend.
-- Ejecutar con scripts/run-sql-migration.ps1 o scripts/run-sql-migration.js.
-- El script de migracion crea backup automatico y verifica integridad.
-- Este SQL no consulta Yahoo Finance, no recalcula cartera y no crea dividendos retroactivos.

PRAGMA foreign_keys = off;

CREATE TABLE IF NOT EXISTS transactions_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('add', 'remove', 'dividend')),
  symbol TEXT NOT NULL,
  name TEXT,
  date TEXT NOT NULL,
  market_date TEXT,
  shares REAL NOT NULL,
  value_eur REAL NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  fx_to_eur REAL NOT NULL,
  commission_eur REAL NOT NULL DEFAULT 0,
  cash_flow_eur REAL NOT NULL DEFAULT 0,
  color TEXT,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'auto', 'import')),
  auto_key TEXT UNIQUE,
  import_batch_id TEXT,
  external_id TEXT,
  raw_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO transactions_new
  (id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
   fx_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key,
   import_batch_id, external_id, raw_hash, created_at)
SELECT
  id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
  fx_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key,
  import_batch_id, external_id, raw_hash, created_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

PRAGMA foreign_keys = on;

CREATE TABLE IF NOT EXISTS dividend_events (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  yahoo_symbol TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Yahoo Finance',
  source_event_id TEXT NOT NULL,
  ex_date TEXT NOT NULL,
  pay_date TEXT,
  currency TEXT NOT NULL,
  detected_amount_per_share REAL NOT NULL,
  detected_shares REAL NOT NULL,
  detected_total_original REAL NOT NULL,
  detected_total_eur REAL NOT NULL,
  effective_amount_per_share REAL NOT NULL,
  effective_shares REAL NOT NULL,
  effective_total_eur REAL NOT NULL,
  fx_to_eur REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ignored', 'confirmed')),
  confirmed_automatically INTEGER NOT NULL DEFAULT 0,
  transaction_id TEXT,
  has_split_notice INTEGER NOT NULL DEFAULT 0,
  split_notice TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  ignored_at TEXT,
  UNIQUE(symbol, source_event_id)
);

CREATE TABLE IF NOT EXISTS dividend_instrument_settings (
  symbol TEXT PRIMARY KEY,
  auto_include INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dividend_scan_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'startup' CHECK (mode IN ('startup', 'api', 'test')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  scanned_symbols INTEGER NOT NULL DEFAULT 0,
  detected_events INTEGER NOT NULL DEFAULT 0,
  created_drafts INTEGER NOT NULL DEFAULT 0,
  updated_drafts INTEGER NOT NULL DEFAULT 0,
  auto_confirmed INTEGER NOT NULL DEFAULT 0,
  ignored_no_shares INTEGER NOT NULL DEFAULT 0,
  split_notice_count INTEGER NOT NULL DEFAULT 0,
  failed_symbols_json TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_symbol_date_created
  ON transactions (symbol, date, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_date_created
  ON transactions (date, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_origin_auto_key
  ON transactions (origin, auto_key);
CREATE INDEX IF NOT EXISTS idx_transactions_import_batch
  ON transactions (import_batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_raw_hash_import
  ON transactions (raw_hash)
  WHERE raw_hash IS NOT NULL AND origin = 'import';
CREATE INDEX IF NOT EXISTS idx_dividend_events_symbol_date
  ON dividend_events (symbol, ex_date);
CREATE INDEX IF NOT EXISTS idx_dividend_events_status_date
  ON dividend_events (status, ex_date);
CREATE INDEX IF NOT EXISTS idx_dividend_events_transaction
  ON dividend_events (transaction_id);
CREATE INDEX IF NOT EXISTS idx_dividend_scan_runs_started
  ON dividend_scan_runs (started_at);
