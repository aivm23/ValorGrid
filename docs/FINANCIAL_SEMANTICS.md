# semántica financiera de métricas

Este documento fija la semántica operativa usada por la app para métricas de cartera.
No cambia endpoints ni payloads; solo define como interpretar campos y signos.

Fuentes de verdad actuales:

- `src/domains/transactions/transaction-service.js` (`buildLedgerAnalytics`, `buildPortfolioPerformance`, `previewTransaction`, `getPositionShares`)
- `src/domains/portfolio/portfolio-service.js` (`buildMonthly`, `buildSummary`, `summarizeTransactions`, `withPercentages`, `isEffectiveValuation`, `buildOnboardingStatus`)
- `src/domains/history/history-service.js` (`enrichSeriesWithContributed`)
- `src/app.js` (`minimumDisplayValueEur`)

## Convencion de signos base

- `cash_flow_eur < 0`: salida de caja (compras + comisión).
- `cash_flow_eur > 0`: entrada de caja (ventas netas de comisión).
- `netContributed > 0`: capital neto aportado a cartera.
- `netContributed < 0`: retirada neta de capital (la cartera ya devolvió más caja de la aportada).

Formula base:

- `netContributed = -SUM(cash_flow_eur)`

## métricas de `/api/portfolio/performance`

> **Ámbito**: estas métricas resumen **todo el ledger desde el primer movimiento**, no el año vigente. El `netContributed` anual de la sección Revisión YTD (`/api/portfolio/monthly`) es independiente.

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

### Porcentaje UI de plusvalía latente sobre inversión abierta

En la tarjeta **Plusvalía latente** de la sección Operativa se muestra un porcentaje calculado en el frontend (no en el backend):

- `inversión abierta = currentValue - unrealizedGain`.
- `% latente = (unrealizedGain / inversión abierta) * 100`.
- Si `inversión abierta <= 0`, se muestra `sin inversión abierta`.

Este porcentaje compara la plusvalía latente con la inversión que sigue abierta tras ventas FIFO, no con todas las compras históricas.

## métricas de `/api/portfolio/monthly` (bloque `summary`)

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

## métricas mensuales por mes (`months[]`)

Para cada mes se exponen `contributions`, `withdrawals`, `commissions`, `netContribution` con la misma semántica anterior, pero filtradas a operaciones del mes.

## Serie historica (`/api/portfolio/history`, campo `series[].contributed`)

- `series[].contributed` es acumulado de aportacion neta hasta cada punto de fecha:
  - `contributed_t = -SUM(cash_flow_eur WHERE tx.date <= point.date)`
- Se actualiza en orden cronologico de transacciones (`ORDER BY date ASC, created_at ASC`).

Consecuencia directa:

- Solo compras: `contributed` crece.
- Ventas netas: `contributed` decrece.
- Si ventas netas superan compras historicas, `contributed` puede ser negativo.

## relación entre distribucion actual e histórico

- `Distribucion actual`:
  - `buildSummary().total` suma solo las posiciones con `showInDistribution = true` y `value >= minimumDisplayValueEur`.
  - Los grupos y posiciones ocultos no entran en ese total visible.
- `Histórico`:
  - La serie materializa la cartera activa sobre el tiempo y no aplica `showInDistribution`.
  - Por eso puede incluir instrumentos que hoy estan ocultos en la distribucion actual.
- Consecuencia:
  - Ambos totales pueden diferir y seguir siendo correctos porque responden a reglas distintas.

## métricas auxiliares

### `transactionCount`

Numero total de transacciones en el ledger. Fuente: `getTransactions().length`.

### `pct` (porcentaje de distribucion)

`(value / total) * 100`. Calculado por `withPercentages` en `src/domains/portfolio/portfolio-service.js:200`. Se aplica a posiciones individuales dentro de un grupo o cartera.

### `variation` (delta mensual)

`value - previousMonthValue`. Usado en insights mensuales (`monthlyInsights`) para detectar el mes con mayor variacion absoluta. Fuente: `buildMonthly` en portfolio-service.

### `autoContributions`

Conteo de transacciones con `origin = 'auto'` en un periodo. Fuente: `summarizeTransactions` en portfolio-service.

### `topMonthlyGroup`

Grupo con mayor `variation` en valor absoluto para un mes dado. Calculado en `topMonthlyGroup` comparando `abs(variation)` entre grupos.

## cálculos de importación con plantilla

La plantilla Excel de ValorGrid (`valorgrid-xlsx`) usa las siguientes reglas:

- `Valor EUR` opcional: si se omite, se calcula como `abs(Acciones) * Precio * FX a EUR`.
- `Divisa` y `FX a EUR` son obligatorios para operaciones no EUR.
- No se busca FX automáticamente durante la importación: el usuario debe proporcionarlo.
- `Tipo` (compra/venta) se infiere del signo de `Acciones` si se deja vacío.
- `Comision EUR` es siempre opcional (por defecto 0).

Estas reglas aplican al perfil público `valorgrid`. Los adaptadores privados de ValorGrid Pro/Enterprise deben normalizar sus datos a esta semántica antes de llegar al ledger.

## cálculos de posicion

### `getPositionShares(symbol, asOfDate)`

`SUM(transactionSign(type) * shares) + base_shares`. Itera sobre transacciones del symbol, aplicando signo (+1 para buys, -1 para sells). Incluye `base_shares` del instrumento (posicion inicial). Si se pasa `asOfDate`, filtra transacciones hasta esa fecha.

### `isEffectiveValuation(item)`

`abs(shares) > 0.0000001 AND value >= minimumDisplayValueEur`. Un instrumento se considera "efectivo" si tiene al menos una cantidad minima de acciones y su valor supera el umbral de visibilidad. Fuente: portfolio-service.

### `minimumDisplayValueEur`

Umbral de visibilidad: `0.01` EUR. Definido en `src/app.js`. Las posiciones con valor inferior no se muestran en distribucion ni monthly.

## Notas sobre crypto

- `crypto` puede tener cotización en sábado/domingo si la fuente de precios la devuelve.
- La app no decide por calendario; decide por disponibilidad de cotización o precio manual.

## Preview de transaccion

### `previewTransaction(input)`

Calcula la vista previa de una operación sin persistirla:

- **Tipo**: `input.type === 'remove' ? 'remove' : 'add'`.
- **Symbol**: `normalizeSymbol(input.symbol || input.ticker)`.
- **Fecha**: `input.date || getToday()`.
- **Modos de cantidad**:
  - **`euros`**: se calculan las acciones con `shares = euros / priceEur` usando precio de mercado/cache.
  - **`shares`** sin `unitPrice`: se calcula `valueEur = shares * priceEur` usando precio de mercado/cache.
  - **`shares` + `unitPrice`**: `unitPrice` es un precio manual introducido por el usuario. Se interpreta en la divisa del instrumento (`instrument.currency`). Se calcula `priceEur = toEur(unitPrice, currency, fxToEur)` y `valueEur = shares * priceEur`. `unitPrice` solo es válido con `shares > 0`, no se permite con `euros`, y requiere un instrumento existente.
- **comisión**: `abs(input.commissionEur ?? input.commission)`, por defecto `0`.
- **`cashFlowEur`**:
  - Compra: `-(valueEur + commissionEur)`.
  - Venta: `valueEur - commissionEur`.
- **validación de venta**: si `type === 'remove'`, se verifica que `getPositionShares(symbol, date) >= shares`.

## Onboarding

### `buildOnboardingStatus()`

Determina si el wizard de configuración inicial está completo:

- `setupComplete = true` si `instruments > 0 AND transactions > 0 AND groups > 0`.
- Fuente: portfolio-service, se expone en `/api/onboarding/status` y dentro de `buildSummary().onboarding`.
