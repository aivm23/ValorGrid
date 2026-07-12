-- ValorGrid update 3.31.4 -> 3.32.0
-- Objetivo: almacenar notas opcionales en compras y ventas del ledger.
-- Ejecutar con scripts/run-sql-migration.ps1 o scripts/run-sql-migration.js.
-- La migracion no modifica movimientos existentes: las notas previas quedan NULL.

ALTER TABLE transactions ADD COLUMN note TEXT;

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '3.32.0', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;

INSERT INTO app_meta (key, value, updated_at)
VALUES ('last_migration_at', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;

INSERT INTO app_meta (key, value, updated_at)
VALUES ('last_migration_from', '3.31.4', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;

INSERT INTO app_meta (key, value, updated_at)
VALUES ('last_migration_to', '3.32.0', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
