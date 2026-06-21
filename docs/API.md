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
GET /api/extensions
GET /api/health
GET /api/state
GET /api/diagnostics/performance
```

- `GET /api/version`: devuelve la versión definida en `package.json` y la edición (`community` o `professional`).
- `GET /api/extensions`: devuelve un manifiesto público de extensiones activas. En Community devuelve una lista vacía; en ediciones profesionales puede incluir módulos web y estilos cargables sin exponer contratos privados.
- `GET /api/health`: devuelve estado local, ruta de base de datos activa, versiones internas y último build histórico.
- `GET /api/state`: devuelve el estado completo de la aplicación: instrumentos, grupos, movimientos, planes automáticos y ruta de base de datos activa.
- `GET /api/diagnostics/performance`: devuelve métricas de rendimiento, tamaños de caché e invalidaciones pendientes.

## Preferencias de interfaz

```text
GET /api/preferences/ui
PUT /api/preferences/ui
```

- `GET /api/preferences/ui`: en Community devuelve un objeto de preferencias vacío y `editable: false`. Las preferencias visuales avanzadas no forman parte del contrato público Community.
- `PUT /api/preferences/ui`: en Community devuelve `403` con mensaje `Feature available in Professional Edition`. Las ediciones profesionales pueden registrar una implementación privada mediante extensión para aceptar payloads parciales con preferencias visuales avanzadas sin publicar ese contrato interno en el repositorio Community.

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
PUT /api/instrument-groups/settings
DELETE /api/instrument-groups
PUT /api/instrument-groups/:id
DELETE /api/instrument-groups/:id
GET /api/instrument-identifiers
POST /api/instrument-identifiers
DELETE /api/instrument-identifiers/:id
PUT /api/instruments/brand-palette
```

- `POST /api/instruments/preview-delete`: devuelve estado de posición y dependencias antes de eliminar; es una previsualización y no bloquea por sí misma.
- El bloqueo real por posición o automatizaciones activas se aplica al ejecutar `DELETE /api/instruments/:symbol` o `DELETE /api/instruments`.
- `PUT /api/instruments/brand-palette`: activa o desactiva la paleta corporativa automática. Cuerpo: `{ "enabled": boolean }`. Si se activa, guarda snapshot de colores actuales, aplica colores corporativos a grupos e instrumentos y actualiza transacciones. Si se desactiva, restaura los colores del snapshot. Respuesta incluye `brandPaletteEnabled`, `snapshotCreated`, `snapshotReused`, `updatedGroups`, `updatedInstruments`, `updatedTransactions`, `restoredGroups`, `restoredInstruments`, `snapshotCleared`.
- `GET /api/instruments` y `GET /api/instrument-groups` incluyen `brandPaletteEnabled` en la respuesta.

- `instruments` almacena valores visibles de cartera.
- `instrument_groups` organiza visibilidad por dashboard, revisión YTD y desglose.
- `instrument_identifiers` guarda identificadores confirmados por el usuario, como ISIN o alias de broker, para futuras importaciones.
- `PUT /api/instrument-groups/settings`: activa o desactiva el uso de grupos. Request body: `{ "enabled": boolean }` (requerido, debe ser booleano). Al activar, los instrumentos activos sin grupo se asignan automáticamente a "grupo-cero". Response 200: `{ groupsEnabled, createdDefaultGroup, assignedInstrumentCount, defaultGroup }`. Response 400: `{ error: "enabled must be a boolean" }`.

## Onboarding

```text
GET /api/onboarding/status
POST /api/onboarding/wizard/preview
POST /api/onboarding/wizard/commit
```

El wizard permite crear grupo, instrumento, primera compra opcional y plan automático opcional de forma atómica. La respuesta `GET /api/onboarding/status` incluye `groupsEnabled` (boolean) que indica si los grupos de instrumentos están habilitados.

## Movimientos

```text
GET /api/transactions
POST /api/transactions
POST /api/transactions/preview
DELETE /api/transactions/:id
DELETE /api/transactions (bulk)
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

### Parámetros de `POST /api/transactions` y `POST /api/transactions/preview`

Se aceptan tres modos de cantidad, mutuamente excluyentes:

- **`euros`** (importe total): se calculan las acciones con `euros / priceEur` usando precio de mercado/cache.
- **`shares`** (acciones): se calcula `valueEur = shares * priceEur` usando precio de mercado/cache.
- **`shares` + `unitPrice`** (precio manual): `unitPrice` es un precio unitario introducido manualmente por el usuario. Se interpreta en la divisa del instrumento (`instrument.currency`). El cálculo es `valueEur = shares * toEur(unitPrice, currency, fxToEur)`. `unitPrice` solo es válido cuando `shares > 0` y no se puede combinar con `euros`.

Reglas de validación:

- `euros` y `shares` son XOR (no se permiten ambos).
- `unitPrice` requiere `shares > 0` y no se permite con `euros`.
- `unitPrice` requiere un instrumento existente.
- Para instrumentos no EUR con precio manual, se puede enviar `fxToEur` manual. Si no se envia, la API exige FX de mercado disponible para la fecha; no usa FX antiguo automáticamente en escrituras.

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
GET /api/portfolio/history?range=ytd&granularity=auto
GET /api/portfolio/history?range=1y
GET /api/portfolio/history?range=2y&granularity=weekly
GET /api/portfolio/history?range=5y&granularity=weekly
GET /api/portfolio/history?range=all&granularity=weekly
```

- `summary`: distribución actual, grupos e instrumentos. Respuesta incluye `groupsEnabled` (boolean) que indica si los grupos de instrumentos están habilitados.
- `performance`: aportado, retirado, comisiones, plusvalía y rentabilidad simple.
- `monthly`: revisión YTD por meses y grupos. La respuesta devuelve `months` (array con insight por mes: `month`, `label`, `total`, `transactions`, `cells`) y `summary` (métricas agregadas: `currentValue`, `netContributed`, `resultYtd`, `valueStart`, `contributions`, `withdrawals`, `commissions`, `completedMonths`, `latestMonth`, `activeGroups`) como contratos canónicos.
- `history`: serie histórica materializada diaria/semanal y eventos. Acepta `granularity` (`auto` | `daily` | `weekly`, default `auto`).
- Semántica de fórmulas y signos: `docs/FINANCIAL_SEMANTICS.md`.

Las vistas de cartera son tolerantes a fallos del proveedor de mercado: `summary` incluye `marketDataStatus` (`ok`, `stale` o `missing`) y las posiciones pueden incluir `dataQuality`, `priceSource`, `priceAgeDays` y `valuationAvailable`.

## Precios

```text
GET /api/quote?symbol=TICKER&date=2026-05-03
GET /api/market-data/sources
GET /api/market-data/alpha-vantage/status
POST /api/market-data/alpha-vantage/key
DELETE /api/market-data/alpha-vantage/key
```

`GET /api/quote` devuelve precio cacheado o consultado al proveedor de mercado. La selección de proveedor es automática según el tipo de instrumento:

- **ETF, Stock, Crypto**: Yahoo Finance
- **Commodity**: Alpha Vantage (requiere clave API configurada)

Si el instrumento tiene fuentes configuradas, se consultan por prioridad. Yahoo es el respaldo por defecto si la fuente primaria no responde.

Si el proveedor no responde y existe un precio local anterior, la respuesta puede ser `200` con `stale: true`, `dataQuality: "stale"`, `fallbackReason` y `priceAgeDays`. Si no hay dato local, devuelve un error accionable.

`GET /api/market-data/sources` lista proveedores disponibles y su estado local.

### Alpha Vantage (commodities)

`GET /api/market-data/alpha-vantage/status` devuelve el estado de la configuración de Alpha Vantage:

```json
{
  "configured": false,
  "mode": "desktop",
  "source": null,
  "hint": "Abre https://www.alphavantage.co/support/#api-key para obtener tu clave gratuita"
}
```

- `configured`: `true` si hay clave configurada, `false` si no.
- `mode`: `"desktop"` si se ejecuta como app de escritorio Electron, `"server"` en modo Node puro.
- `source`: `"local"` si se guardó desde el asistente, `"env"` si se configuró por variable de entorno, `null` si no hay clave.
- `hint`: mensaje accionable para el usuario según el modo.

`POST /api/market-data/alpha-vantage/key` guarda una nueva clave de Alpha Vantage (solo modo desktop). Validación:

- El campo `apiKey` debe tener 16 caracteres alfanuméricos mayúsculas.
- Se valida con una llamada real a `GOLD_SILVER_SPOT` antes de guardar.
- Si la clave es inválida o el límite diario está activo, devuelve `400` con mensaje explicativo.
- En modo servidor (no desktop), devuelve `400` e indica que use variable de entorno.

Respuesta:

```json
{
  "message": "Clave de Alpha Vantage guardada correctamente"
}
```

`DELETE /api/market-data/alpha-vantage/key` elimina la clave guardada (solo modo desktop). En modo servidor devuelve `400`.

### Gestión local de la clave

- **Windows Desktop**: la clave se guarda en `secrets.json` junto al directorio de backups dentro de la carpeta privada de Electron (`app.getPath('userData')`). ValorGrid nunca la expone por API ni la envía a servidores externos (salvo a la API oficial de Alpha Vantage para consultar precios).
- **Docker/dev**: la clave se configura exclusivamente mediante la variable de entorno `VALORGRID_ALPHA_VANTAGE_API_KEY` (también compatible con `ALPHA_VANTAGE_API_KEY`). No hay persistencia local de secretos en este modo.

## Backups

```text
GET /api/backups
POST /api/backups
GET /api/backups/:file
DELETE /api/backups/:file
```

Los backups se guardan en `local/valorgrid/backups/` y no deben versionarse.

- `GET /api/backups` — lista todos los backups disponibles.
- `POST /api/backups` — crea un nuevo backup de la base de datos activa.
- `GET /api/backups/:file` — descarga un backup específico.
- `DELETE /api/backups/:file` — elimina un backup específico.
- Las operaciones de riesgo (bulk delete transactions, replace auto-plans, delete instruments, delete groups, import commit, import rollback) pueden devolver un campo `backup` con el backup automático creado antes de la operación.

## Exportaciones

```text
GET /api/export/transactions.xlsx
```

Exporta el ledger de movimientos como Excel importable por ValorGrid. El libro contiene una sola hoja `Movimientos`, sin instrucciones ni ejemplos, con los encabezados oficiales de la plantilla de importación: `Tipo`, `Fecha`, `Ticker`, `Yahoo`, `Acciones`, `Precio`, `Divisa`, `FX a EUR`, `Valor EUR`, `Comision EUR` y `Referencia`.

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
    {
      "key": "valorgrid-xlsx",
      "label": "Plantilla Excel de ValorGrid",
      "edition": "community",
      "available": true
    },
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

Las fuentes de ediciones profesionales pueden aparecer en el catálogo con `edition: "professional"` y `available: false` cuando no están habilitadas. Su configuración, contratos de adaptación y detalles operativos se documentan solo en materiales privados de ValorGrid Pro/Enterprise. Cuando una edición privada está cargada mediante el host de extensiones, sus fuentes pueden aparecer como `available: true` sin que Community publique el adaptador ni su contrato interno.

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
