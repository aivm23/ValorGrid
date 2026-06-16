-- ValorGrid update 3.17.0 -> 3.18.0
-- Objetivo: persistir el ajuste de paleta corporativa automática.
-- Ejecutar solo tras crear backup de la DB productiva.
-- Idempotente: no modifica colores existentes ni datos financieros.

INSERT INTO app_meta (key, value)
VALUES ('brand_palette_enabled', '0')
ON CONFLICT(key) DO NOTHING;