# Modelo de datos

ValorGrid usa SQLite local como base principal. El ledger contable vive en tablas persistentes; las tablas de histórico, snapshots y caché son derivadas o regenerables.

Este documento describe el **schema fresh actual** de la aplicación. No documenta ni mantiene migraciones históricas en runtime.

## Tablas contables principales

### `instrument_groups`

Define agrupaciones visuales y funcionales.

Campos principales:

- `id`
- `name`
- `color`
- `display_order`
- `show_in_distribution`
- `show_in_monthly`
- `is_expandable`
- `active`

Se usa para distribucion actual, revision YTD, desglose del donut y organizacion de instrumentos. Estos flags no definen la frecuencia de aportacion automatica.

### `instruments`

Define valores configurados por el usuario.

Campos principales:

- `symbol`: ticker interno.
- `yahoo_symbol`: símbolo usado para precios.
- `name`
- `type`: `etf`, `stock` o `fx`.
- `currency`
- `color`
- `base_shares`
- `fallback_price`: precio de respaldo cuando no hay datos de mercado (REAL, default 0).
- `active`
- `group_id`
- `display_order`: orden de visualización (INTEGER, default 0).
- `show_in_distribution`: controla si aparece en la distribucion del dashboard (INTEGER, default 1).
- `show_in_monthly`: controla si aparece en la revision YTD por grupos (INTEGER, default 1).

`fx` se usa para instrumentos técnicos internos de conversión y no debe aparecer como posición visible.

### `instrument_identifiers`

Guarda identificadores confirmados para resolver importaciones futuras.

Campos principales:

- `id`: clave primaria (TEXT).
- `instrument_symbol`
- `provider`
- `identifier_type`
- `identifier_value`
- `display_name`
- `currency`
- `exchange`
- `metadata_json`
- `created_at`: timestamp de creación (TEXT, default CURRENT_TIMESTAMP).

Ejemplos:

- `provider = global`, `identifier_type = isin`
- `provider = manual`, `identifier_type = ticker`
- `provider = private_adapter`, `identifier_type = external_reference`

La resolución debe priorizar identificadores confirmados por el usuario sobre heurísticas. ValorGrid Community no publica adaptadores concretos de broker; los nombres de proveedores privados solo deben existir en repositorios privados Pro/Enterprise.

### `transactions`

Es la verdad contable de compras y ventas.

Campos principales:

- `id`
- `symbol`
- `name`: nombre descriptivo del instrumento en el momento de la operación (TEXT, nullable).
- `type`: `add` o `remove`.
- `date`
- `market_date`
- `shares`
- `value_eur`
- `price`
- `currency`
- `fx_to_eur`: tipo de cambio de la divisa local a EUR (REAL). Aplica a cualquier divisa, no solo USD.
- `commission_eur`
- `cash_flow_eur`
- `color`: color del instrumento en el momento de la operación (TEXT, nullable).
- `origin`: `manual`, `auto`, `import`.
- `auto_key`
- `import_batch_id`: FK al lote de importación que creó esta transacción (TEXT, nullable).
- `external_id`: ID externo del broker (TEXT, nullable).
- `raw_hash`: hash de deduplicación para importaciones (TEXT, nullable, índice único condicional).
- `created_at`

Reglas:

- Las compras aumentan acciones.
- Las ventas reducen acciones.
- Las comisiones no cambian acciones.
- `cash_flow_eur` es firmado:
  - compra: negativo;
  - venta: positivo;
  - comisión incluida según corresponda.

### `auto_plans`

Define aportaciones automáticas.

Campos principales:

- `symbol`
- `amount_eur`
- `day`
- `enabled`
- `start_date`
- `frequency`
- `weekday`

Frecuencias:

- `daily`
- `weekly`
- `biweekly`
- `monthly`

### `auto_plan_skips`

Evita recrear una operación automática que el usuario eliminó manualmente.

Campos principales:

- `auto_key`
- `skipped_at`

## Importaciones

### `import_batches`

Representa un lote importado o previsualizado.

Campos principales:

- `id`
- `source`
- `filename`
- `file_hash`
- `status`
- `mapping_json`
- `summary_json`
- `row_count`
- `error_count`
- `first_date`
- `last_date`
- `created_at`
- `committed_at`
- `rolled_back_at`

`source + file_hash` permite idempotencia y reimportación controlada tras rollback.

### `import_rows`

Representa filas de un lote.

Campos principales:

- `id`: clave primaria (TEXT).
- `batch_id`
- `row_index`
- `raw_json`
- `normalized_json`
- `row_hash`
- `status`
- `error`
- `transaction_id`
- `created_at`: timestamp de creación (TEXT, default CURRENT_TIMESTAMP).

Permite auditoría, rollback y diagnóstico de importación.

## Precios y FX

### `price_cache`

Caché puntual de precios.

Campos:

- `yahoo_symbol`
- `requested_date`
- `market_date`
- `price`
- `currency`
- `source`
- `created_at`

### `daily_price_cache`

Caché diaria de precios históricos por símbolo.

Campos habituales:

- `yahoo_symbol`
- `date`
- `price`
- `currency`
- `source`
- `created_at`

### FX

Para EUR se usa `1`. Para USD se usa `USDEUR=X`. Otras divisas pueden apoyarse en precios cacheados o quedar como `missing/stale` si no hay conversión disponible.

## Histórico materializado

### `portfolio_positions_daily`

Posición diaria por instrumento.

Campos principales:

- `date`
- `symbol`
- `shares`
- `price_eur`
- `value_eur`
- `data_quality`
- `created_at`

### `portfolio_value_daily`

Valor diario total de cartera.

Campos principales:

- `date`
- `value_eur`
- `data_quality`
- `created_at`

### `portfolio_value_weekly`

Valor semanal derivado de la serie diaria. Lo usan rangos largos para mejorar latencia y legibilidad.

Campos principales:

- `week_start`
- `date`
- `value_eur`
- `data_quality`
- `ledger_version`
- `price_version`
- `created_at`

### `portfolio_events`

Eventos de compras, ventas e importaciones visibles en el histórico.

Campos principales:

- `id`
- `type`
- `symbol`
- `name`
- `date`
- `market_date`
- `plot_date`
- `shares`
- `value_eur`
- `price`
- `currency`
- `origin`
- `color`
- `created_at`

### `history_invalidations`

Guarda desde qué fecha debe reconstruirse el histórico.

Campos principales:

- `id`
- `from_date`
- `reason`
- `created_at`

### `history_builds`

Registra builds del histórico, duración, estado y errores.

Campos principales:

- `build_key`
- `from_date`
- `to_date`
- `ledger_version`
- `price_version`
- `status`
- `error`
- `duration_ms`
- `points`
- `created_at`
- `updated_at`

## Metadata y control de versiones

### `app_meta`

Almacena claves de versión interna para invalidación de cachés.

Campos:

- `key`: identificador (ej. `ledger_version`, `price_version`).
- `value`: valor numérico como texto.
- `updated_at`

Se incrementa cada vez que el ledger o los precios cambian, disparando reconstrucción del histórico.

## Precios y FX (detalle)

### `market_prices_daily`

Precios diarios por símbolo interno (no Yahoo). Derivado de `daily_price_cache` tras resolución de símbolo.

Campos:

- `symbol`, `yahoo_symbol`, `date`, `price`, `currency`, `source`, `created_at`

### `fx_rates_daily`

Tipos de cambio diarios por par de divisas.

Campos:

- `pair` (ej. `USDEUR`), `date`, `rate`, `source`, `created_at`

### `daily_price_cache_ranges`

Registra qué rangos de fechas ya se consultaron al proveedor externo, evitando consultas redundantes.

Campos:

- `yahoo_symbol`, `from_date`, `to_date`, `created_at`

## Rollback de importaciones

### `import_rollback_log`

Registra cada rollback ejecutado sobre un lote de importación.

Campos:

- `id`
- `batch_id`
- `source`, `filename`
- `row_count`, `error_count`
- `first_date`, `last_date`
- `rolled_back_at`

Permite auditoría y reimportación controlada tras correcciones.

## Principios

- `transactions` es la fuente contable de compras y ventas.
- `instruments`, `instrument_groups` y `auto_plans` son configuración del usuario.
- Importaciones terminan en `transactions`; no crean un ledger paralelo.
- Histórico, precios y snapshots son datos derivados y regenerables.
- SQLite local sigue siendo suficiente para uso monousuario.
