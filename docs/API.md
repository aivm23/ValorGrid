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
GET /api/update/status
GET /api/update/docker-commands
```

- `GET /api/version`: devuelve la versión definida en `package.json` y la edición (`community` o `professional`).
- `GET /api/extensions`: devuelve un manifiesto público de extensiones activas. En Community devuelve una lista vacía; en ediciones profesionales puede incluir módulos web y estilos cargables sin exponer contratos privados.
- `GET /api/health`: devuelve estado local, ruta de base de datos activa, versiones internas y último build histórico.
- `GET /api/state`: devuelve el estado completo de la aplicación: instrumentos, grupos, movimientos, planes automáticos y ruta de base de datos activa.
- `GET /api/diagnostics/performance`: devuelve métricas de rendimiento, tamaños de caché e invalidaciones pendientes.
- `GET /api/update/status`: consulta la última release estable en GitHub Releases y la compara con la versión actual. Devuelve `currentVersion`, `latestVersion`, `updateAvailable`, `runtimeMode` (`desktop`, `docker` o `server`), `releaseUrl`, `recommendedAsset` (solo desktop, con `name` y `downloadUrl`), `dockerImage` (tag GHCR esperado) y `checkedAt`. Si GitHub no responde, devuelve `updateAvailable: false` y `error` sin interrumpir la app.
- `GET /api/update/docker-commands?version=X.Y.Z`: devuelve los comandos Docker de actualización (`docker pull`, `docker compose pull`, `docker compose up -d`) para la versión indicada.

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
GET /api/liquidity
POST /api/liquidity/accounts
PUT /api/liquidity/accounts/:symbol
DELETE /api/liquidity/accounts/:symbol
```

- `POST /api/instruments/preview-delete`: devuelve estado de posición y dependencias antes de eliminar; es una previsualización y no bloquea por sí misma.
- El bloqueo real por posición o automatizaciones activas se aplica al ejecutar `DELETE /api/instruments/:symbol` o `DELETE /api/instruments`.
- `PUT /api/instruments/brand-palette`: activa o desactiva la paleta corporativa automática. Cuerpo: `{ "enabled": boolean }`. Si se activa, guarda snapshot de colores actuales, aplica colores corporativos a grupos e instrumentos y actualiza transacciones. Si se desactiva, restaura los colores del snapshot. Respuesta incluye `brandPaletteEnabled`, `snapshotCreated`, `snapshotReused`, `updatedGroups`, `updatedInstruments`, `updatedTransactions`, `restoredGroups`, `restoredInstruments`, `snapshotCleared`.
- `GET /api/instruments` y `GET /api/instrument-groups` incluyen `brandPaletteEnabled` en la respuesta.
- `GET /api/liquidity`: devuelve el grupo técnico de liquidez, cuentas activas y total EUR actual.
- `POST /api/liquidity/accounts`: crea una cuenta de liquidez con `{ name, cashBalance, currency, color }`. No crea movimientos.
- `PUT /api/liquidity/accounts/:symbol`: actualiza nombre, saldo actual, divisa, color y visibilidad en dashboard.
- `DELETE /api/liquidity/accounts/:symbol`: desactiva la cuenta de liquidez y pone su saldo a cero.

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
POST /api/transactions/:id/preview
PUT /api/transactions/:id
DELETE /api/transactions/:id
DELETE /api/transactions (bulk)
```

Los movimientos son la verdad contable principal. Una compra o venta puede incluir:

- fecha de operación,
- fecha de mercado,
- ticker,
- tipo (`add` o `remove`),
- cantidad (`shares`, visible como acciones o unidades según el tipo de instrumento),
- valor bruto EUR,
- precio,
- divisa,
- FX a EUR,
- comisión,
- cash-flow firmado,
- origen.
- nota opcional.

### Parámetros de `POST /api/transactions` y `POST /api/transactions/preview`

`entryMode` es opcional para compatibilidad. Si se envía, acepta tres modos:

- **`market_eur`** (`euros`): se calcula la cantidad con `euros / priceEur` usando precio de mercado/cache. Si se envía explícitamente, solo es válido para compras.
- **`manual_total_eur`** (`shares` + `euros`): registra una ejecución liquidada en euros. No consulta mercado; guarda `price = euros / shares`, `currency = EUR` y `fxToEur = 1`.
- **`manual_unit_price`** (`shares` + `unitPrice`): registra un precio unitario manual. `priceCurrency` permite indicar la divisa de ejecución; si falta, se usa la divisa del instrumento. Si la divisa no es EUR, `fxToEur` es obligatorio cuando `entryMode = manual_unit_price`.

Sin `entryMode`, se mantiene la inferencia histórica:

- **`euros`**: se calcula la cantidad con precio de mercado/cache.
- **`shares`**: se calcula `valueEur = shares * priceEur` usando precio de mercado/cache.
- **`shares` + `unitPrice`**: usa precio manual y conserva la resolución previa de FX.

Reglas de validación:

- En `market_eur`, se exige `euros` y no se permite `shares`.
- En ventas nuevas, la UI usa `manual_total_eur`: cantidad vendida + importe bruto de venta en EUR + comisión EUR. La API rechaza ventas explícitas con `entryMode = market_eur`.
- En `manual_total_eur`, se exigen `euros` y `shares`, y no se permite `unitPrice`.
- En `manual_unit_price`, `unitPrice` requiere `shares > 0` y no se permite con `euros`.
- Sin `entryMode`, `euros` y `shares` siguen siendo XOR (no se permiten ambos), salvo `shares + unitPrice`.
- `unitPrice` requiere `shares > 0` y no se permite con `euros`.
- `unitPrice` requiere un instrumento existente.
- Para instrumentos no EUR con precio manual legacy, se puede enviar `fxToEur` manual. Si no se envia, la API exige FX de mercado disponible para la fecha; no usa FX antiguo automáticamente en escrituras.
- `type = dividend` no se acepta en estos endpoints. Los dividendos solo se crean desde eventos de Yahoo Finance revisados o auto-confirmados por `/api/dividends/*`.

### Corrección de un movimiento existente

`POST /api/transactions/:id/preview` valida una corrección sin escribir nada y devuelve los importes derivados. `PUT /api/transactions/:id` aplica exactamente la misma validación, crea un backup automático y devuelve el movimiento actualizado junto al backup creado.

El cuerpo de corrección admite `date`, `shares`, `price`, `currency`, `fxToEur`, `commissionEur` y `note`. El servidor recalcula `valueEur` y `cashFlowEur`; no consulta proveedores de mercado. No se pueden modificar ticker, tipo, origen, fecha de mercado ni metadatos de importación o automatismo. Los dividendos no usan este flujo.

## Dividendos

```text
GET /api/dividends/summary
GET /api/dividends/drafts
POST /api/dividends/scan
PATCH /api/dividends/drafts/:id
POST /api/dividends/drafts/:id/confirm
POST /api/dividends/drafts/:id/ignore
PUT /api/dividends/settings/:symbol
```

- `GET /api/dividends/summary`: devuelve contadores de borradores pendientes, total pendiente, dividendos confirmados, simbolos con auto-inclusion y ultimo scan.
- `GET /api/dividends/drafts`: devuelve borradores `draft` detectados desde Yahoo Finance.
- `POST /api/dividends/scan`: lanza una busqueda de dividendos. El frontend la usa automáticamente al arrancar; no hay boton manual público en Community.
- `PATCH /api/dividends/drafts/:id`: actualiza importe por accion, acciones con derecho y total EUR efectivo.
- `POST /api/dividends/drafts/:id/confirm`: crea un movimiento real `transactions.type = dividend` desde el borrador.
- `POST /api/dividends/drafts/:id/ignore`: descarta el borrador sin crear movimiento.
- `PUT /api/dividends/settings/:symbol`: activa/desactiva `autoInclude` para proximos dividendos del instrumento.

Reglas:

- Solo se escanean instrumentos `stock` y `etf`.
- El primer dividendo de un instrumento queda como borrador porque `autoInclude` empieza desactivado.
- Si `autoInclude` esta activo, los siguientes dividendos se confirman automáticamente salvo que Yahoo informe split/dividend split.
- Los avisos de dividend split siguen siendo informativos. Los splits/reverse splits de acciones y ETF se tratan como acciones corporativas automáticas, separadas de dividendos.
- No se pueden crear dividendos manuales sin evento Yahoo.

## Acciones corporativas

```text
GET /api/corporate-actions
GET /api/corporate-actions?symbol=GOOG
POST /api/corporate-actions/scan
```

- `GET /api/corporate-actions`: lista splits/reverse splits registrados automáticamente desde Yahoo Finance. Acepta filtros opcionales `symbol`, `fromDate` y `toDate`.
- `POST /api/corporate-actions/scan`: escanea Yahoo Finance para instrumentos `stock` y `etf` con `yahoo_symbol`. Body opcional: `{ "symbols": ["GOOG"], "fromDate": "2026-01-01", "toDate": "2026-12-31" }`.
- Los eventos se registran de forma idempotente por `symbol + source_event_id`.
- Registrar o actualizar un split inválida el histórico desde `effective_date` vía `ledger_version`; no modifica `price_version`.
- No existe confirmación manual: el mercado ya cotiza con el split/reverse split aplicado.
- No se crean movimientos en `transactions`; no hay cash-flow, comisión, dividendo ni compra/venta asociada.

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
GET /api/portfolio/returns
GET /api/portfolio/monthly?year=2026
GET /api/portfolio/history?range=ytd&granularity=auto
GET /api/portfolio/history?range=1y
GET /api/portfolio/history?range=2y&granularity=weekly
GET /api/portfolio/history?range=5y&granularity=weekly
GET /api/portfolio/history?range=all&granularity=weekly
```

- `summary`: distribución actual, grupos e instrumentos. Respuesta incluye `groupsEnabled` (boolean) que indica si los grupos de instrumentos están habilitados.
- `performance`: aportado, retirado, comisiones, plusvalía y rentabilidad simple.
- `returns`: en Community devuelve `403` con mensaje `Feature available in Professional Edition`. Las ediciones profesionales pueden registrar una implementación privada para rentabilidad por instrumento o grupo sin publicar ese contrato interno en el repositorio Community.
- `monthly`: revisión YTD por meses y grupos. La respuesta devuelve `months` (array con insight por mes: `month`, `label`, `total`, `transactions`, `cells`) y `summary` (métricas agregadas: `currentValue`, `netContributed`, `resultYtd`, `valueStart`, `contributions`, `withdrawals`, `dividends`, `dividendCount`, `commissions`, `completedMonths`, `latestMonth`, `activeGroups`) como contratos canónicos.
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

`GET /api/market-data/sources` lista proveedores disponibles y su estado local. La respuesta incluye:

- `providers`: array con `key`, `label`, `enabled` y `primary` de cada proveedor (yahoo, alpha_vantage, manual).
- `states`: array con el último estado operativo registrado de cada proveedor (`provider`, `status` — `ok` o `error` —, `reason`, `retry_after`, `updated_at`). Los estados se actualizan cuando la app consulta precios; no se hacen llamadas extra a los proveedores para calcularlos.

### Alpha Vantage (commodities)

`GET /api/market-data/alpha-vantage/status` devuelve el estado de la configuración de Alpha Vantage:

```json
{
  "configured": false,
  "mode": "desktop",
  "source": null,
  "canSaveKey": true,
  "hint": "Abre https://www.alphavantage.co/support/#api-key para obtener tu clave gratuita"
}
```

- `configured`: `true` si hay clave configurada, `false` si no.
- `mode`: `"desktop"` si se ejecuta como app de escritorio Electron, `"server"` en modo Node puro.
- `source`: `"local"` si se guardó desde el asistente, `"env"` si se configuró por variable de entorno, `null` si no hay clave.
- `canSaveKey`: `true` si la API puede guardar una clave local en caliente. Es `false` cuando la clave está gestionada por variable de entorno.
- `hint`: mensaje accionable para el usuario según el modo.

`POST /api/market-data/alpha-vantage/key` guarda una nueva clave de Alpha Vantage desde el asistente local. Funciona en desktop y en Docker/CasaOS cuando la clave no está gestionada por variable de entorno. Validación:

- El campo `apiKey` debe tener 16 caracteres alfanuméricos mayúsculas.
- Se valida con una llamada real a `GOLD_SILVER_SPOT` antes de guardar.
- Si la clave es inválida o el límite diario está activo, devuelve `400` con mensaje explicativo.
- Si `VALORGRID_ALPHA_VANTAGE_API_KEY` está configurada por entorno, devuelve `400` e indica que la clave se cambie en la configuración del contenedor o proceso.

Respuesta:

```json
{
  "message": "Clave de Alpha Vantage guardada correctamente"
}
```

`DELETE /api/market-data/alpha-vantage/key` elimina la clave guardada localmente. Si la clave viene de variable de entorno, devuelve `400`.

### Gestión local de la clave

- **App de escritorio**: la clave se guarda en `secrets.json` junto al directorio de backups dentro de la carpeta privada de Electron (`app.getPath('userData')`). ValorGrid nunca la expone por API ni la envía a servidores externos (salvo a la API oficial de Alpha Vantage para consultar precios).
- **Docker/CasaOS**: si no se configura variable de entorno, la misma vista de configuración permite pegar la clave y guardarla en el volumen persistente de datos (`/data/secrets.json`) sin reiniciar el contenedor.
- **Servidor/dev avanzado**: `VALORGRID_ALPHA_VANTAGE_API_KEY` tiene prioridad sobre la clave local persistida. `ALPHA_VANTAGE_API_KEY` sigue aceptada por compatibilidad.

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
GET /api/export/transactions.xlsx?symbol=AAPL
GET /api/export/transactions.xlsx?origin=manual&type=add
GET /api/export/transactions.xlsx?from=2026-01-01&to=2026-12-31
```

Exporta el ledger de movimientos como Excel importable por ValorGrid. El libro contiene una sola hoja `Movimientos`, sin instrucciones ni ejemplos, con los encabezados oficiales de la plantilla de importación: `Tipo`, `Fecha`, `Ticker`, `Yahoo`, `Acciones`, `Precio`, `Divisa`, `FX a EUR`, `Valor EUR`, `Comision EUR` y `Referencia`.

Sin parámetros, exporta todos los movimientos. Parámetros opcionales de filtro:

| Parámetro | Descripción                                    | Ejemplo           |
| --------- | ---------------------------------------------- | ----------------- |
| `symbol`  | Filtra por símbolo (case-insensitive, parcial) | `symbol=AAPL`     |
| `origin`  | Filtra por origen: `manual`, `auto`, `import`  | `origin=auto`     |
| `type`    | Filtra por tipo: `add`, `remove`, `dividend`   | `type=add`        |
| `from`    | Fecha mínima (`YYYY-MM-DD`)                    | `from=2026-01-01` |
| `to`      | Fecha máxima (`YYYY-MM-DD`)                    | `to=2026-06-30`   |

Los parámetros se combinan con AND. Una consulta inválida devuelve `400` con mensaje de error.

Las compras se exportan como `compra` con cantidad positiva, las ventas como `venta` con cantidad negativa y los dividendos como `dividendo` con acciones informativas. En el Excel esa cantidad usa el encabezado `Acciones` por compatibilidad. `Referencia` usa `externalId` si existe o el `id` interno si no existe.

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
- `Acciones`: cantidad del instrumento; positiva para compra, negativa para venta si no se usa `Tipo`.
- `Divisa` y `FX a EUR` son obligatorios para operaciones no EUR.
- `Valor EUR` es opcional; si falta, se calcula como `abs(Acciones) * Precio * FX a EUR`.
- No se busca FX automáticamente durante importación.

El flujo recomendado es:

1. Descargar la plantilla con `GET /api/import/template.xlsx`.
2. Rellenar la hoja `Movimientos` con las operaciones.
3. `preview`: parsea, normaliza, detecta instrumentos, calcula cantidades importables y muestra avisos.
4. Resolución visual de instrumentos en frontend.
5. Selección de filas o grupos a importar.
6. `commit`: inserta solo filas seleccionadas y válidas de forma atómica.
7. `rollback`: revierte un lote importado si hace falta corregirlo.

ValorGrid Community acepta la plantilla Excel oficial como fuente predeterminada. Las fuentes legacy (`generic-csv`, `csv`, `generic-xlsx`, `xlsx`) devuelven error 400 con el mensaje "usa la plantilla Excel de ValorGrid".

## Errores

Las respuestas de error son JSON y deben mostrar mensajes orientados al usuario siempre que sea posible. En importaciones, las filas omitidas, duplicadas o ignoradas no bloquean el lote; solo bloquean las filas seleccionadas para importar que sigan siendo inválidas.
