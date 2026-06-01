# Semantica financiera de metricas

Este documento fija la semantica operativa usada por la app para metricas de cartera.
No cambia endpoints ni payloads; solo define como interpretar campos y signos.

Fuentes de verdad actuales:

- `src/transaction-service.js` (`buildLedgerAnalytics`, `buildPortfolioPerformance`)
- `src/portfolio-service.js` (`buildMonthly`, `summarizeTransactions`)
- `src/history-service.js` (`enrichSeriesWithContributed`)
- `src/transaction-service.js` (`previewTransaction`, calculo de `cash_flow_eur`)

## Convencion de signos base

- `cash_flow_eur < 0`: salida de caja (compras + comision).
- `cash_flow_eur > 0`: entrada de caja (ventas netas de comision).
- `netContributed > 0`: capital neto aportado a cartera.
- `netContributed < 0`: retirada neta de capital (la cartera ya devolvio mas caja de la aportada).

Formula base:

- `netContributed = -SUM(cash_flow_eur)`

## Metricas de `/api/portfolio/performance`

- `currentValue`:
  - Valor actual total (EUR) de posiciones visibles.
  - Fuente: `buildSummary().total`.
- `grossInvested`:
  - Suma de `value_eur` de compras (`type = add`), sin restar ventas.
- `grossWithdrawn`:
  - Suma de `value_eur` de ventas (`type = remove`), sin netear compras.
- `commissions`:
  - Suma de `commission_eur` de todas las operaciones.
- `netCashFlow`:
  - Suma directa de `cash_flow_eur`.
- `netContributed`:
  - `-netCashFlow`.
- `realizedGain`:
  - Plusvalia realizada por ventas con coste FIFO:
  - `SUM(value_eur_venta - commission_eur_venta - cost_basis_fifo_consumido)`.
- `totalGain`:
  - `currentValue - netContributed`.
- `unrealizedGain`:
  - `totalGain - realizedGain`.
- `simpleReturnPct`:
  - Si `netContributed > 0`: `(totalGain / netContributed) * 100`.
  - Si `netContributed <= 0`: `null`.

## Metricas de `/api/portfolio/monthly` (bloque `summary`)

- `valueStart`:
  - Valor de cartera a `YYYY-01-01`, valorando posiciones con precios de esa fecha.
  - Si falla la valoracion, cae a `0`.
- `currentValue`:
  - Valor de la ultima fila mensual completada del ano solicitado.
- `contributions`:
  - Suma anual de `value_eur` en compras.
- `withdrawals`:
  - Suma anual de `value_eur` en ventas.
- `commissions`:
  - Suma anual de `commission_eur`.
- `netContributed`:
  - `-SUM(cash_flow_eur)` del ano.
- `resultYtd`:
  - `currentValue - valueStart - netContributed`.
  - Equivale al resultado del periodo YTD (mercado + realizado - comisiones), partiendo del valor inicial.

## Metricas mensuales por mes (`months[]`)

Para cada mes se exponen `contributions`, `withdrawals`, `commissions`, `netContribution` con la misma semantica anterior, pero filtradas a operaciones del mes.

## Serie historica (`/api/portfolio/history`, campo `series[].contributed`)

- `series[].contributed` es acumulado de aportacion neta hasta cada punto de fecha:
  - `contributed_t = -SUM(cash_flow_eur WHERE tx.date <= point.date)`
- Se actualiza en orden cronologico de transacciones (`ORDER BY date ASC, created_at ASC`).

Consecuencia directa:

- Solo compras: `contributed` crece.
- Ventas netas: `contributed` decrece.
- Si ventas netas superan compras historicas, `contributed` puede ser negativo.
