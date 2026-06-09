# API local

ValorGrid expone una API HTTP local para que el frontend gestione cartera, histórico, importaciones, backups y exportaciones.

Por defecto el servidor escucha en:

```text
http://127.0.0.1:1325
```

Si `VALORGRID_AUTH_PASSWORD` está configurado, toda la API queda protegida con Basic Auth monousuario. El usuario por defecto es `valorgrid` y puede cambiarse con `VALORGRID_AUTH_USER`.

## Sistema

```text
GET /api/version
GET /api/health
GET /api/state
GET /api/diagnostics/performance
```

- `GET /api/version`: devuelve la versión definida en `package.json` y la edición (`community` o `professional`).
- `GET /api/health`: devuelve estado local, ruta de base de datos activa, versiones internas y último build histórico.
- `GET /api/state`: devuelve el estado completo de la aplicación: instrumentos, grupos, movimientos, planes automáticos y ruta de base de datos activa.
- `GET /api/diagnostics/performance`: devuelve métricas de rendimiento, tamaños de caché e invalidaciones pendientes.

## Instrumentos y grupos

```text
GET /api/instruments
POST /api/instruments
DELETE /api/instruments
POST /api/instruments/preview-delete
PUT /api/instruments/:symbol
DELETE /api/instruments/:symbol
GET /api/instrument-groups
POST /api/instrument-groups
DELETE /api/instrument-groups
PUT /api/instrument-groups/:id
DELETE /api/instrument-groups/:id
GET /api/instrument-identifiers
POST /api/instrument-identifiers
DELETE /api/instrument-identifiers/:id
```

- `POST /api/instruments/preview-delete`: devuelve estado de posición y dependencias antes de eliminar; es una previsualización y no bloquea por sí misma.
- El bloqueo real por posición o automatizaciones activas se aplica al ejecutar `DELETE /api/instruments/:symbol` o `DELETE /api/instruments`.

- `instruments` almacena valores visibles de cartera.
- `instrument_groups` organiza visibilidad por dashboard, revisión YTD y desglose.
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
POST /api/auto-plans/preview
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
- Semántica de fórmulas y signos: `docs/FINANCIAL_SEMANTICS.md`.

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
GET /api/export/transactions.xlsx
```

Exporta el ledger de movimientos como Excel importable por ValorGrid. El libro contiene una sola hoja `Movimientos`, sin instrucciones ni ejemplos, con los encabezados oficiales de la plantilla de importación: `Tipo`, `Fecha`, `Ticker`, `Acciones`, `Precio`, `Divisa`, `FX a EUR`, `Valor EUR`, `Comision EUR` y `Referencia`.

Las compras se exportan como `compra` con acciones positivas, las ventas como `venta` con acciones negativas, y `Referencia` usa `externalId` si existe o el `id` interno si no existe.

## Importaciones

```text
GET /api/import/sources
GET /api/import/template.xlsx
POST /api/import/preview
POST /api/import/commit
GET /api/import/batches
GET /api/import/batches/:id
POST /api/import/batches/:id/rollback
GET /api/import/rollback-log
POST /api/import/ticker-suggestions
```

### Catálogo de fuentes

`GET /api/import/sources` — devuelve la lista de fuentes de importación disponibles con su estado de disponibilidad según la edición activa (`community` o `professional`).

Respuesta:

```json
{
  "sources": [
    { "key": "valorgrid-xlsx", "label": "Plantilla Excel de ValorGrid", "edition": "community", "available": true },
    {
      "key": "<fuente-profesional>",
      "label": "<Fuente profesional>",
      "edition": "professional",
      "available": false,
      "comingSoon": true
    }
  ]
}
```

- `available: true` — la fuente puede usarse para importar.
- `available: false` — la fuente pertenece a otra edición y no está habilitada.
- `comingSoon: true` — la fuente está en desarrollo y no está disponible en ninguna edición.

### Fuentes soportadas

```text
valorgrid-xlsx  (plantilla Excel de ValorGrid — recomendado, siempre disponible)
```

Las fuentes de ediciones profesionales pueden aparecer en el catálogo con `edition: "professional"` y `available: false` cuando no están habilitadas. Su configuración, contratos de adaptación y detalles operativos se documentan solo en materiales privados de ValorGrid Pro/Enterprise.

### Descarga de plantilla

`GET /api/import/template.xlsx` — descarga la plantilla Excel oficial de ValorGrid con tres hojas:

- `Movimientos` (primera hoja, importable): encabezados `Tipo`, `Fecha`, `Ticker`, `Acciones`, `Precio`, `Divisa`, `FX a EUR`, `Valor EUR`, `Comision EUR`, `Referencia`.
- `Instrucciones`: guía de uso.
- `Ejemplos`: datos de ejemplo.

La respuesta incluye `Content-Disposition: attachment` y MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

La plantilla se procesa internamente con ExcelJS. El parser solo acepta `.xlsx` moderno, limita el archivo a 2 MB, exige la hoja `Movimientos`, bloquea hojas no permitidas, valida encabezados exactos, rechaza fórmulas y limita Community a 500 movimientos por importación.

### Semántica de importación con plantilla

- `Tipo`: compra/venta, o se infiere por signo si se deja vacío.
- `Acciones`: positivo para compra, negativo para venta si no se usa `Tipo`.
- `Divisa` y `FX a EUR` son obligatorios para operaciones no EUR.
- `Valor EUR` es opcional; si falta, se calcula como `abs(Acciones) * Precio * FX a EUR`.
- No se busca FX automáticamente durante importación.

El flujo recomendado es:

1. Descargar la plantilla con `GET /api/import/template.xlsx`.
2. Rellenar la hoja `Movimientos` con las operaciones.
3. `preview`: parsea, normaliza, detecta instrumentos, calcula acciones importables y muestra avisos.
4. Resolución visual de instrumentos en frontend.
5. Selección de filas o grupos a importar.
6. `commit`: inserta solo filas seleccionadas y válidas de forma atómica.
7. `rollback`: revierte un lote importado si hace falta corregirlo.

ValorGrid Community acepta la plantilla Excel oficial como fuente predeterminada. Las fuentes legacy (`generic-csv`, `csv`, `generic-xlsx`, `xlsx`) devuelven error 400 con el mensaje "usa la plantilla Excel de ValorGrid".

## Errores

Las respuestas de error son JSON y deben mostrar mensajes orientados al usuario siempre que sea posible. En importaciones, las filas omitidas, duplicadas o ignoradas no bloquean el lote; solo bloquean las filas seleccionadas para importar que sigan siendo inválidas.
