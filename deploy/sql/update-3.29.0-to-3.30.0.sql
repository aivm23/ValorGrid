-- ValorGrid update 3.29.0 -> 3.30.0
-- Objetivo: registrar schema_version en bases existentes e iniciar el sistema
-- de migraciones automaticas con backup previo.
-- Ejecutar con scripts/run-sql-migration.ps1 o scripts/run-sql-migration.js.
-- Este script no modifica tablas ni columnas; solo registra la version de schema.

INSERT INTO app_meta (key, value)
VALUES ('schema_version', '3.30.0')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;

INSERT INTO app_meta (key, value)
VALUES ('last_migration_at', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;

INSERT INTO app_meta (key, value)
VALUES ('last_migration_from', '3.29.0')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;

INSERT INTO app_meta (key, value)
VALUES ('last_migration_to', '3.30.0')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
