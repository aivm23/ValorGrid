# API local

ValorGrid expone una API HTTP local para que el frontend gestione cartera, histórico, importaciones, backups y exportaciones.

Por defecto el servidor escucha en:

```text
http://127.0.0.1:5173
```

## Sistema

```text
GET /api/version
GET /api/health
GET /api/state
GET /api/diagnostics/performance
```

- `GET /api/version`: devuelve la versión definida en `version.json`.
- `GET /api/health`: devuelve estado local, ruta de base de datos activa, versiones internas y último build histórico.
- `GET /api/state`: devuelve metadatos persistidos de estado.
- `GET /api/diagnostics/performance`: devuelve métricas de rendimiento, tamaños de caché e invalidaciones pendientes.

## Instrumentos y grupos

```text
GET /api/instruments
POST /api/instruments
PUT /api/instruments/:symbol
GET /api/instrument-groups
POST /api/instrument-groups
PUT /api/instrument-groups/:id
GET /api/instrument-identifiers
POST /api/instrument-identifiers
DELETE /api/instrument-identifiers/:id
```

- `instruments` almacena valores visibles de cartera.
- `instrument_groups` organiza distribución, revisión mensual y desglose.
- `instrument_identifiers` guarda identificadores confirmados por el usuario, como ISIN o alias de broker, para futuras importaciones.

## Onboarding

```text
GET /api/onboarding/status
POST /api/onboarding/wizard/preview
POST /api/onboarding/wizard/commit
```

El wizard permite crear grupo, instrumento, primera compra opcional y plan automático opcional de forma atómica.

## Movimientos

```text
GET /api/transactions
POST /api/transactions
POST /api/transactions/preview
DELETE /api/transactions/:id
```

Los movimientos son la verdad contable principal. Una compra o venta puede incluir:

- fecha de operación,
- fecha de mercado,
- ticker,
- tipo (`add` o `remove`),
- acciones,
- valor bruto EUR,
- precio,
- divisa,
- FX a EUR,
- comisión,
- cash-flow firmado,
- origen.

## Aportaciones automáticas

```text
GET /api/auto-plans
PUT /api/auto-plans
```

Los planes soportan frecuencia diaria, semanal, bisemanal y mensual. Cada plan tiene fecha de inicio y respeta skips si una operación automática se elimina manualmente.

## Cartera

```text
GET /api/portfolio/summary
GET /api/portfolio/performance
GET /api/portfolio/monthly?year=2026
GET /api/portfolio/history?range=ytd
GET /api/portfolio/history?range=1y
GET /api/portfolio/history?range=2y
GET /api/portfolio/history?range=5y
GET /api/portfolio/history?range=all
```

- `summary`: distribución actual, grupos e instrumentos.
- `performance`: aportado, retirado, comisiones, plusvalía y rentabilidad simple.
- `monthly`: revisión YTD por meses y grupos.
- `history`: serie histórica materializada diaria/semanal y eventos.

## Precios

```text
GET /api/quote?symbol=TICKER&date=2026-05-03
```

Devuelve precio cacheado o consultado al proveedor de mercado. Los resultados se persisten localmente.

## Backups

```text
GET /api/backups
POST /api/backups
GET /api/backups/:file
```

Los backups se guardan en `.backups/` y no deben versionarse.

## Exportaciones

```text
GET /api/export/transactions.csv
GET /api/export/transactions.json
```

Exportan el ledger de movimientos para auditoría o migración manual.

## Importaciones

```text
POST /api/import/preview
POST /api/import/commit
GET /api/import/batches
GET /api/import/batches/:id
POST /api/import/batches/:id/rollback
POST /api/import/ticker-suggestions
```

Fuentes soportadas:

```text
generic-csv
generic-xlsx
degiro-csv
ibkr-csv
```

El flujo recomendado es:

1. `preview`: parsea, normaliza, detecta instrumentos, calcula acciones importables y muestra avisos.
2. Resolución visual de instrumentos en frontend.
3. Selección de filas o grupos a importar.
4. `commit`: inserta solo filas seleccionadas y válidas de forma atómica.
5. `rollback`: revierte un lote importado si hace falta corregirlo.

## Errores

Las respuestas de error son JSON y deben mostrar mensajes orientados al usuario siempre que sea posible. En importaciones, las filas omitidas, duplicadas o ignoradas no bloquean el lote; solo bloquean las filas seleccionadas para importar que sigan siendo inválidas.
