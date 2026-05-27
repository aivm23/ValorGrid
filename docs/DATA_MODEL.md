# Modelo de datos

ValorGrid usa SQLite local como base principal. El ledger contable vive en tablas persistentes; las tablas de histórico, snapshots y caché son derivadas o regenerables.

## Tablas contables principales

### `instrument_groups`

Define agrupaciones visuales y funcionales.

Campos principales:

- `id`
- `name`
- `color`
- `sort_order`
- `show_in_distribution`
- `show_in_monthly`
- `is_breakdown`

Se usa para distribución actual, revisión YTD, desglose del donut y organización de instrumentos.

### `instruments`

Define valores configurados por el usuario.

Campos principales:

- `symbol`: ticker interno.
- `yahoo_symbol`: símbolo usado para precios.
- `name`
- `type`: `etf`, `stock`, `fx` u otros tipos soportados.
- `currency`
- `color`
- `base_shares`
- `active`
- `group_id`

`fx` se usa para instrumentos técnicos internos de conversión y no debe aparecer como posición visible.

### `instrument_identifiers`

Guarda identificadores confirmados para resolver importaciones futuras.

Campos principales:

- `instrument_symbol`
- `provider`
- `identifier_type`
- `identifier_value`
- `display_name`
- `currency`
- `exchange`
- `metadata_json`

Ejemplos:

- `provider = global`, `identifier_type = isin`
- `provider = degiro`, `identifier_type = product_name`
- `provider = ibkr`, `identifier_type = contract`

La resolución debe priorizar identificadores confirmados por el usuario sobre heurísticas.

### `transactions`

Es la verdad contable de compras y ventas.

Campos principales:

- `id`
- `symbol`
- `type`: `add` o `remove`.
- `date`
- `market_date`
- `shares`
- `value_eur`
- `price`
- `currency`
- `usd_to_eur`: nombre histórico; en importaciones se interpreta como FX de la divisa local a EUR.
- `commission_eur`
- `cash_flow_eur`
- `origin`: `manual`, `auto`, `import`.
- `auto_key`
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

## Importaciones

### `import_batches`

Representa un lote importado o previsualizado.

Campos principales:

- `id`
- `source`
- `file_name`
- `file_hash`
- `status`
- `mapping_json`
- `summary_json`
- `created_at`
- `committed_at`
- `rolled_back_at`

`source + file_hash` permite idempotencia y reimportación controlada tras rollback.

### `import_rows`

Representa filas de un lote.

Campos principales:

- `batch_id`
- `row_number`
- `raw_json`
- `normalized_json`
- `raw_hash`
- `status`
- `errors_json`
- `transaction_id`

Permite auditoría, rollback y diagnóstico de importación.

## Precios y FX

### `price_cache`

Caché puntual de precios.

### `daily_price_cache`

Caché diaria de precios históricos por símbolo.

Campos habituales:

- `yahoo_symbol`
- `date`
- `price`
- `currency`
- `source`

### FX

Para EUR se usa `1`. Para USD se usa `USDEUR=X`. Otras divisas pueden apoyarse en precios cacheados o quedar como `missing/stale` si no hay conversión disponible.

## Histórico materializado

### `portfolio_positions_daily`

Posición diaria por instrumento.

### `portfolio_value_daily`

Valor diario total de cartera.

### `portfolio_value_weekly`

Valor semanal derivado de la serie diaria. Lo usan rangos largos para mejorar latencia y legibilidad.

### `portfolio_events`

Eventos de compras, ventas e importaciones visibles en el histórico.

### `history_invalidations`

Guarda desde qué fecha debe reconstruirse el histórico.

### `history_builds`

Registra builds del histórico, duración, estado y errores.

## Principios

- `transactions` es la fuente contable de compras y ventas.
- `instruments`, `instrument_groups` y `auto_plans` son configuración del usuario.
- Importaciones terminan en `transactions`; no crean un ledger paralelo.
- Histórico, precios y snapshots son datos derivados y regenerables.
- SQLite local sigue siendo suficiente para uso monousuario.
