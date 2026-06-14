-- ValorGrid update 3.15.0 -> 3.16.0
-- Objetivo: permitir instruments.type = 'crypto' en bases existentes.
-- Ejecutar solo tras crear backup de la DB productiva.
-- Este script reconstruye instruments porque SQLite no permite modificar un CHECK existente.

PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

CREATE TABLE instruments_new (
  symbol TEXT PRIMARY KEY,
  yahoo_symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('etf', 'stock', 'crypto', 'fx')),
  currency TEXT NOT NULL,
  color TEXT NOT NULL,
  base_shares REAL NOT NULL DEFAULT 0,
  fallback_price REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  group_id TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  show_in_distribution INTEGER NOT NULL DEFAULT 1,
  show_in_monthly INTEGER NOT NULL DEFAULT 1
);

INSERT INTO instruments_new (
  symbol,
  yahoo_symbol,
  name,
  type,
  currency,
  color,
  base_shares,
  fallback_price,
  active,
  group_id,
  display_order,
  show_in_distribution,
  show_in_monthly
)
SELECT
  symbol,
  yahoo_symbol,
  name,
  type,
  currency,
  color,
  base_shares,
  fallback_price,
  active,
  group_id,
  display_order,
  show_in_distribution,
  show_in_monthly
FROM instruments;

DROP TABLE instruments;

ALTER TABLE instruments_new RENAME TO instruments;

CREATE INDEX IF NOT EXISTS idx_instruments_type_active
  ON instruments (type, active);

CREATE INDEX IF NOT EXISTS idx_instruments_group_active
  ON instruments (group_id, active);

COMMIT;

PRAGMA foreign_keys = ON;