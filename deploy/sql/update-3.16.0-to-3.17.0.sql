-- ValorGrid update 3.16.0 -> 3.17.0
-- Objetivo: persisitir el ajuste de grupos opcionales en app_meta.
-- Ejecutar solo tras crear backup de la DB productiva.
-- Idempotente: no modifica grupos ni instrumentos existentes.

INSERT INTO app_meta (key, value)
VALUES ('instr_groups_enabled', '1')
ON CONFLICT(key) DO NOTHING;