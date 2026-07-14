# semántica financiera de métricas

Este documento fija la semántica operativa usada por la app para métricas de cartera.
No cambia endpoints ni payloads; solo define como interpretar campos y signos.

Fuentes de verdad actuales:

- `apps/server/src/domains/transactions/transaction-service.js` (`buildLedgerAnalytics`, `buildPortfolioPerformance`, `previewTransaction`, `getPositionShares`)
- `apps/server/src/domains/portfolio/portfolio-service.js` (`buildMonthly`, `buildSummary`, `summarizeTransactions`, `withPercentages`, `isEffectiveValuation`, `buildOnboardingStatus`)
- `apps/server/src/domains/history/history-service.js` (`enrichSeriesWithContributed`)
- `apps/server/src/app.js` (`minimumDisplayValueEur`)

> Nota: Los cambios de paleta corporativa (`brand_palette_enabled`) son visuales; no alteran importes, cantidades, cash-flow, rentabilidad ni FIFO. La restauración de colores al desactivar la paleta tampoco afecta a cálculos financieros.

> Nota: Las cuentas de liquidez (`type = cash`) representan saldo actual. Suman al total visible actual si están marcadas como visibles, pero no crean movimientos, no alteran `cash_flow_eur`, no entran en FIFO y no generan histórico/YTD.

> Nota: Corregir una compra o venta recalcula `value_eur` y `cash_flow_eur` desde sus datos de ejecución y vuelve a materializar el histórico desde la primera fecha afectada. La nota opcional de un movimiento no interviene en ningún cálculo financiero.

## Acciones corporativas y posición histórica

- Un split automático solo modifica acciones cuando Yahoo informa `1:N` o `N:1`, la posición al cierre del día anterior es positiva y el resultado es entero.
- Ratios como `21:20` o `3:2`, posiciones inexistentes y resultados fraccionarios se omiten sin alterar ledger, FIFO ni histórico.
- La elegibilidad se decide en la fecha del evento. Un split o dividendo legítimo se conserva aunque la posición se venda por completo más adelante.
- Los dividendos posteriores a una venta completa se omiten porque en su `exDate` ya no había acciones con derecho.
- Una pareja técnica de compra/venta importada solo se marca `corporate_action_ignored` si sus cantidades, precios, valor, divisa, fecha e identidad coinciden exactamente con un split Yahoo elegible. No genera cash-flow ni movimientos reales.

## Convencion de signos base

- `cash_flow_eur < 0`: salida de caja (compras + comisión).
- `cash_flow_eur > 0`: entrada de caja (ventas netas de comisión).
- Los dividendos confirmados usan `cash_flow_eur > 0` y no cambian la cantidad de la posición.
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
- `dividendIncomeEur`:
  - Suma de `value_eur` de dividendos confirmados (`type = dividend`).
- `dividendCount`:
  - Numero de movimientos `type = dividend`.
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
  - `totalGain - realizedGain - dividendIncomeEur`.
  - Los dividendos aumentan el resultado total, pero no deben inflar la plusvalia latente de posiciones abiertas.
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
  - Valor de la última fila mensual completada del año solicitado.
- `contributions`:
  - Suma anual de `value_eur` en compras.
- `withdrawals`:
  - Suma anual de `value_eur` en ventas.
- `dividends`:
  - Suma anual de `value_eur` en dividendos confirmados.
- `dividendCount`:
  - Numero anual de dividendos confirmados.
- `commissions`:
  - Suma anual de `commission_eur`.
- `netContributed`:
  - `-SUM(cash_flow_eur)` del ano.
- `resultYtd`:
  - `currentValue - valueStart - netContributed`.
  - Equivale al resultado del periodo YTD (mercado + realizado + dividendos - comisiones), partiendo del valor inicial.

## métricas mensuales por mes (`months[]`)

Para cada mes se exponen `contributions`, `withdrawals`, `dividends`, `dividendCount`, `commissions`, `netContribution`, `autoContributions` y `autoDividends` con la misma semántica anterior, pero filtradas a operaciones del mes.

## Serie histórica (`/api/portfolio/history`, campo `series[].contributed`)

- `series[].contributed` es acumulado de aportación neta hasta cada punto de fecha:
  - `contributed_t = -SUM(cash_flow_eur WHERE tx.date <= point.date)`
- Se actualiza en orden cronologico de transacciones (`ORDER BY date ASC, created_at ASC`).

Consecuencia directa:

- Solo compras: `contributed` crece.
- Ventas netas: `contributed` decrece.
- Dividendos: `contributed` decrece porque son entrada de caja.
- Si ventas netas superan compras historicas, `contributed` puede ser negativo.

## Relación entre distribución actual e histórico

- `Distribucion actual`:
  - `buildSummary().total` suma solo las posiciones con `showInDistribution = true` y `value >= minimumDisplayValueEur`.
  - Los grupos y posiciones ocultos no entran en ese total visible.
- `Histórico`:
  - La serie materializa la cartera activa sobre el tiempo y no aplica `showInDistribution`.
  - Por eso puede incluir instrumentos que hoy están ocultos en la distribución actual.
- Consecuencia:
  - Ambos totales pueden diferir y seguir siendo correctos porque responden a reglas distintas.

## métricas auxiliares

### `transactionCount`

Numero total de transacciones en el ledger. Fuente: `getTransactions().length`.

### `pct` (porcentaje de distribución)

`(value / total) * 100`. Calculado por `withPercentages` en `apps/server/src/domains/portfolio/portfolio-service.js:200`. Se aplica a posiciones individuales dentro de un grupo o cartera.

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

Estas reglas aplican a la plantilla pública `valorgrid-xlsx` y al ledger de Community.

## Cálculos de posición

### `getPositionShares(symbol, asOfDate)`

Itera una linea temporal ordenada por fecha con `base_shares`, transacciones y splits confirmados:

- compras: suman `shares`;
- ventas: restan `shares`;
- dividendos: no modifican cantidad;
- split/reverse split: multiplica la posición abierta por `ratio`.

Los splits se aplican al inicio de `effective_date`; las compras/ventas con la misma fecha se interpretan en unidades post-split. Si se pasa `asOfDate`, solo se consideran transacciones y splits hasta esa fecha.

### Splits y reverse splits

Los splits de acciones/ETF se registran en `corporate_actions` desde Yahoo Finance y no son movimientos contables.

Reglas financieras:

- No generan `cash_flow_eur`.
- No cambian `grossInvested`, `grossWithdrawn`, `netCashFlow`, `netContributed`, dividendos ni comisiones.
- No reescalan precios historicos cacheados del proveedor.
- Ajustan las acciones abiertas y los lotes FIFO desde `effective_date`.

FIFO:

- Cada split multiplica `lot.shares *= ratio`.
- `lot.cost` se mantiene igual.
- El coste unitario cambia de forma implicita.

Ejemplo: compra de 1 accion GOOG por 1.000 EUR, split `1 -> 20`, venta de 3 acciones. ValorGrid consume 150 EUR de coste FIFO y deja 17 acciones con 850 EUR de coste pendiente.

### `isEffectiveValuation(item)`

`abs(shares) > 0.0000001 AND value >= minimumDisplayValueEur`. Un instrumento se considera "efectivo" si tiene al menos una cantidad minima y su valor supera el umbral de visibilidad. Fuente: portfolio-service.

### `minimumDisplayValueEur`

Umbral de visibilidad: `0.01` EUR. Definido en `apps/server/src/app.js`. Las posiciones con valor inferior no se muestran en distribución ni monthly.

## Fuentes de precio por instrumento

- La selección de proveedor es automática según el tipo de instrumento:
  - **ETF, Stock, Crypto**: Yahoo Finance (fuente por defecto).
  - **Commodity**: Alpha Vantage (requiere clave API configurada desde el asistente o el despliegue).
- Alpha Vantage para commodities usa los endpoints `GOLD_SILVER_HISTORY` y `GOLD_SILVER_SPOT` en lugar de `FX_DAILY`.
- Los precios de proveedores alternativos se cachean en `market_price_points`.
- Las escrituras de transacciones siguen siendo estrictas: no usan caché antiguo de Yahoo de forma automática.

## Notas sobre crypto y commodity

- `crypto` puede tener cotización en sábado/domingo si la fuente de precios la devuelve.
- `commodity` usa Alpha Vantage con los endpoints `GOLD_SILVER_HISTORY`/`GOLD_SILVER_SPOT`. No requiere símbolo Yahoo.
- La app no decide por calendario; decide por disponibilidad de cotización.

## Preview de transaccion

### `previewTransaction(input)`

Calcula la vista previa de una operación sin persistirla:

- **Tipo**: `input.type === 'remove' ? 'remove' : 'add'`.
- **Symbol**: `normalizeSymbol(input.symbol || input.ticker)`.
- **Fecha**: `input.date || getToday()`.
- **Modos de cantidad**:
  - **`entryMode = market_eur`**: requiere `euros`; calcula `shares = euros / priceEur` usando precio de mercado/cache. Si se envía explícitamente, solo es válido para compras.
  - **`entryMode = manual_total_eur`**: requiere `shares + euros`; no consulta mercado y registra la ejecución en EUR con `price = euros / shares`, `currency = EUR` y `fxToEur = 1`.
  - **`entryMode = manual_unit_price`**: requiere `shares + unitPrice`; `priceCurrency` indica la divisa de ejecución y, si no es EUR, requiere `fxToEur` explícito.
  - **Sin `entryMode`**: conserva la inferencia histórica (`euros`, `shares`, o `shares + unitPrice`) para compatibilidad.
- **comisión**: `abs(input.commissionEur ?? input.commission)`, por defecto `0`.
- **FX manual**: en operaciones legacy con `unitPrice` sobre instrumentos no EUR, `fxToEur` debe venir del mercado en la fecha o del input manual; no se usa FX antiguo automáticamente para escrituras. En `manual_unit_price` explícito con divisa no EUR, `fxToEur` debe venir del usuario.
- **ventas manuales UI**: se registran como `manual_total_eur` con cantidad vendida e importe bruto EUR. No consultan mercado; el efectivo neto se obtiene con `valueEur - commissionEur`.
- **`cashFlowEur`**:
  - Compra: `-(valueEur + commissionEur)`.
  - Venta: `valueEur - commissionEur`.
- **validación de venta**: si `type === 'remove'`, se verifica que `getPositionShares(symbol, date) >= shares`.

## Onboarding

### `buildOnboardingStatus()`

Determina si el wizard de configuración inicial está completo:

- `setupComplete = true` si `instruments > 0 AND transactions > 0`.
- Si los grupos están habilitados (`useGroup` flag), se requiere además `groups > 0`.
- Fuente: portfolio-service, se expone en `/api/onboarding/status` y dentro de `buildSummary().onboarding`.

## Agregación de cartera

La cartera puede agregarse por grupos de instrumentos (cuando están habilitados) o directamente por instrumentos. Cuando los grupos están deshabilitados, todas las posiciones se agrupan bajo un único grupo sintético "Sin grupo" y la distribución se muestra plana.
