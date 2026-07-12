-- ValorGrid 3.30.0 -> 3.31.0
-- Objetivo: registrar splits/reverse splits automaticos de acciones y ETF
-- como acciones corporativas separadas del ledger contable.

CREATE TABLE IF NOT EXISTS corporate_actions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'split' CHECK (type IN ('split')),
  symbol TEXT NOT NULL,
  yahoo_symbol TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Yahoo Finance',
  source_event_id TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  old_shares REAL NOT NULL CHECK (old_shares > 0),
  new_shares REAL NOT NULL CHECK (new_shares > 0),
  ratio REAL NOT NULL CHECK (ratio > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol_date
  ON corporate_actions (symbol, effective_date);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_type_date
  ON corporate_actions (type, effective_date);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '3.31.0', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
