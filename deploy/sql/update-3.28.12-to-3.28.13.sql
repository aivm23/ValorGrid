-- ValorGrid update 3.28.12 -> 3.28.13
-- Objetivo: habilitar cuentas de liquidez como instrumentos tecnicos de tipo cash.
-- Ejecutar con scripts/run-sql-migration.ps1 o scripts/run-sql-migration.js.
-- El script de migracion crea backup automatico y verifica integridad.
-- Este SQL no crea movimientos, no recalcula historico y no modifica posiciones existentes.

PRAGMA foreign_keys = off;

CREATE TABLE IF NOT EXISTS instruments_new (
  symbol TEXT PRIMARY KEY,
  yahoo_symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('etf', 'stock', 'crypto', 'commodity', 'fx', 'cash')),
  currency TEXT NOT NULL,
  color TEXT NOT NULL,
  base_shares REAL NOT NULL DEFAULT 0,
  cash_balance REAL NOT NULL DEFAULT 0,
  cash_balance_updated_at TEXT,
  fallback_price REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  group_id TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  show_in_distribution INTEGER NOT NULL DEFAULT 1,
  show_in_monthly INTEGER NOT NULL DEFAULT 1
);

INSERT INTO instruments_new
  (symbol, yahoo_symbol, name, type, currency, color, base_shares, cash_balance,
   cash_balance_updated_at, fallback_price, active, group_id, display_order,
   show_in_distribution, show_in_monthly)
SELECT
  symbol, yahoo_symbol, name, type, currency, color, base_shares, 0,
  NULL, fallback_price, active, group_id, display_order,
  show_in_distribution, show_in_monthly
FROM instruments;

DROP TABLE instruments;
ALTER TABLE instruments_new RENAME TO instruments;

PRAGMA foreign_keys = on;

CREATE INDEX IF NOT EXISTS idx_instruments_type_active
  ON instruments (type, active);
CREATE INDEX IF NOT EXISTS idx_instruments_group_active
  ON instruments (group_id, active);
