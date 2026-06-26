# Arquitectura

ValorGrid es una aplicación local monousuario con backend Node.js, SQLite local y frontend estático modular. El proyecto está organizado como un monorepo con workspaces.

## Estructura del monorepo

```
ValorGrid/
├── apps/
│   ├── server/          (backend Node.js)
│   │   ├── server.js
│   │   └── src/
│   ├── web/             (frontend estático)
│   │   ├── index.html
│   │   └── src/
│   └── desktop/         (wrapper Electron)
│       └── main.js
├── packages/
│   └── contracts/       (interfaces TypeScript compartidas)
│       └── src/
│           └── index.ts
├── docs/
├── scripts/
├── test/
└── package.json         (workspaces: ["apps/*", "packages/*"])
```

## Objetivos de arquitectura

- Mantener datos privados en la máquina del usuario.
- Evitar servicios remotos obligatorios.
- Mantener `transactions` como fuente contable única.
- Materializar histórico para lecturas rápidas.
- Separar importación, validación, commit y rollback.
- Mantener el servidor atado a `127.0.0.1` por defecto.

## Dirección de arquitectura (2026)

ValorGrid evoluciona de un monolito modular con `ctx` plano hacia este patrón objetivo:

- **Modular Monolith** (despliegue simple, una sola app local).
- **Clean-ish layering** (`routes` -> `services` -> `repositories`).
- **Dependency Injection explícita** usando un `ctx` agrupado.
- **TypeScript strict incremental** (migración activa sin big-bang, `tsconfig.json` con `strict: true`, `checkJs: false`).
- **Carpetas por bounded context** (migración activa de `apps/server/src/` plano a `apps/server/src/domains/<domain>/` agrupando service + repository + routes por dominio donde aplica, con `apps/server/src/platform/` para infraestructura compartida y `apps/server/src/shared/` para módulos transversales sin dominio propio).

Principios operativos de la migración:

- No romper API pública ni semántica funcional en cada fase.
- Fases pequeñas, pruebas completas y commit por fase.
- Convivencia temporal de capas legacy y nuevas mientras se reduce acoplamiento.
- Documentación de arquitectura actualizada en cada cambio estructural.

## Raíz del proyecto

- `package.json`: gestión de workspaces (`apps/*`, `packages/*`). No contiene runtime propio.
- `tsconfig.json`: configuración de TypeScript incremental (`strict`, `allowJs`, `checkJs: false`, `noEmit`).
- `apps/desktop/main.js`: wrapper Electron para la distribución de escritorio Windows/Linux/macOS. Arranca el servidor local en `127.0.0.1` con puerto efímero y guarda DB/backups en la carpeta de datos de usuario de la app.

### Estructura física por dominio (implementada)

Módulos organizados en carpetas por bounded context y plataforma compartida:

```
apps/server/src/
├── domains/
│   ├── instruments/    (instrument-*, route-instruments)
│   ├── transactions/   (transaction-*, route-transactions)
│   ├── dividends/      (dividend-*, route-dividends)
│   ├── data-ingestion/ (ingestion-*, route-data-ingestion)
│   ├── portfolio/      (portfolio-*, route-portfolio)
│   ├── history/        (history-*)
│   ├── market-data/    (market-data-*, route-market-data-alpha-vantage)
│   ├── meta/           (meta-repository, meta-state)
│   ├── onboarding/     (onboarding-*)
│   ├── ticker-suggestions/ (ticker-suggestions-*)
│   └── admin/          (diagnostics-*, route-admin)
├── shared/             (brand-palette, operations-metrics; cargados internamente por instrument-service y ui-preferences-service respectivamente)
├── platform/           (db, config, auth, http, backups, runtime-secrets, ctx-utils, validators, app-error, utils)
├── app.js
├── routes.js
└── ...
```

Cada dominio se migra completo: service + repository + routes (cuando aplica). `apps/server/src/app.js` y `route-*.js` mantienen el wiring externo.

## Backend

### `apps/server/server.js`

Bootstrap mínimo: delega en `apps/server/src/app.js` para toda la lógica. Solo arranca el listener HTTP cuando se ejecuta directamente.

### `apps/server/src/app.js`

Orquestador del backend:

- crea el objeto `ctx` compartido,
- inicializa namespaces agrupados (`ctx.config`, `ctx.cache`, `ctx.logger`, `ctx.repositories`, `ctx.services`),
- carga un array explícito de módulos en orden con `require(modulePath)(ctx)`,
- cada módulo declara dependencias necesarias de `ctx` de forma explícita,
- cada módulo exporta funciones vía `Object.assign(ctx, { ... })`,
- hidrata aliases agrupados desde APIs legacy al terminar la carga de módulos,
- llama a `ctx.initDatabase()` para ejecutar creación de schema idempotente (fresh-only, sin migraciones históricas runtime).

### Namespaces objetivo de `ctx` (transición)

El estado actual mantiene exports planos por compatibilidad. El estado objetivo concentra dependencias en grupos:

```text
ctx.config
ctx.cache
ctx.logger
ctx.db
ctx.repositories.<domain>
ctx.services.<domain>
```

Reglas de transición:

- Se permiten aliases legacy en `ctx` mientras se migra por fases.
- Todo módulo nuevo/refactorizado debe preferir los namespaces agrupados.
- `ctx.http` se conserva como primitiva Node por compatibilidad; APIs HTTP se agrupan en `ctx.services.http`.
- No se reintroduce `with (ctx)` en backend ni frontend.
- SQL vive exclusivamente en repositories (`ctx.repositories.<domain>`). Services y rutas no ejecutan SQL directo.
- `backups.js` es la excepción técnica permitida para mantenimiento SQLite (`PRAGMA wal_checkpoint` antes de copiar backups).
- Las transacciones SQLite deben usar los helpers de `apps/server/src/platform/db.js` (`withTransaction` / `withTransactionAsync`), no `BEGIN/COMMIT/ROLLBACK` manuales en services.

### `apps/server/src/` y `apps/server/src/platform/`

**Infraestructura compartida en `apps/server/src/platform/`:**

- `config.js`: host, puerto, rutas, versión, DB activa y auth opcional.
- `auth.js`: Basic Auth monousuario opt-in para despliegues Docker/CasaOS (importado por `http.js`, no cargado directamente en `app.js`).
- `db.js`: apertura SQLite, PRAGMAs, helpers `withTransaction`/`withTransactionAsync`.
- `http.js`: servidor HTTP estático, Basic Auth opt-in y listener.
- `backups.js`: creación, listado y descarga de backups SQLite.
- `ctx-utils.js`: `assertCtxDeps`, `getCtxDep`.
- `utils.js`: helpers compartidos (formato, fechas, HTTP, caché).
- `validators.js`: validadores de entrada (`assertPresent`, `assertXor`, etc.).
- `app-error.js`: clase `AppError` con `statusCode` + `errorCode`.
- `runtime-secrets.js`: persistencia local de claves API (Alpha Vantage) en `secrets.json`, fuera de SQLite. En desktop vive bajo `app.getPath('userData')`; en Docker/CasaOS vive en el volumen de datos (`/data/secrets.json`). Cargado antes del bucle de módulos.
- `extensions.js`: fábrica `createExtensionHost` que normaliza extensiones, resuelve assets web y registra adaptadores de importación profesionales.
- `extensions-runtime.js`: carga la extensión configurada en `VALORGRID_EXTENSION_PATH` y la registra en el host de extensiones antes de montar rutas HTTP. Cargado en paso 28 del bucle.

**Archivos raíz en `apps/server/src/`:**

- `route-service-bindings.js`: resolución de handlers desde `ctx.services.*`.
- `routes.js`: delegador HTTP que despacha a `route-*.js` por dominio.
- `app.js`: composition root y orquestador de módulos (backend).
- `bind-ctx-namespaces.js`: agrupación de funciones planas de `ctx` en namespaces `ctx.services.*` y `ctx.repositories.*`. Cargado por `app.js` tras el bucle de módulos.
- `app-core.js`: re-export de `apps/server/src/app.js`.
- `schema.js`: creación fresh idempotente de tablas.
- `schema-seed.js`: datos iniciales de instrumentos y planes automáticos.

**Interfaces TypeScript compartidas en `packages/contracts/src/index.ts`:** definiciones de tipos de dominio compartidos entre backend y frontend.

**Dominios en `apps/server/src/domains/`**:

La lógica principal vive en módulos. Orden de carga en `app.js`:

**Cargados vía `require()` directo (antes del bucle):**

- `config`: host, puerto, rutas, versión, DB activa y auth opcional.
- `db`: apertura SQLite, PRAGMAs, helpers y transacciones.
- `backups`: creación, listado y descarga de backups SQLite.

**Cargados en bucle `for...of` (orden secuencial):**

1. `schema`: creación fresh idempotente de tablas.
2. `schema-seed`: datos iniciales de instrumentos y planes automáticos.
3. `domains/meta/meta-repository`: acceso SQL de `app_meta` e invalidaciones.
4. `domains/meta/meta-state`: gestión de versiones e invalidaciones desde repository.
5. `domains/meta/ui-preferences-service`: respuesta pública no editable para preferencias UI. Community no persiste preferencias visuales avanzadas; Operativa e Histórico configurables se registran desde extensiones profesionales privadas.
6. `utils`: helpers compartidos (formato, validación, fechas).
7. `domains/instruments/instrument-repository`: acceso SQL de instrumentos, grupos e identificadores.
8. `domains/portfolio/portfolio-repository`: lecturas SQL de onboarding y lookup de instrumentos.
9. `domains/ticker-suggestions/ticker-suggestions-repository`: lookup SQL de sugerencias de ticker por ISIN histórico.
10. `domains/instruments/instrument-service`: reglas de negocio y flujo de instrumentos. Carga internamente `instrument-brand-palette` para gestión de paleta corporativa automática, `instrument-group-service` para operaciones CRUD de grupos e `instrument-price-sources` para normalizar fuentes de precio por instrumento.
11. `domains/ticker-suggestions/ticker-suggestions`: resolución de tickers por ISIN, nombre o historial.
12. `domains/market-data/market-data-repository`: acceso a `price_cache`, `daily_price_cache` y tablas de fuentes/precios alternativos.
13. `domains/market-data/market-data`: precios, Yahoo Finance, fuentes alternativas, precios manuales, FX y eventos de dividendos. Carga internamente `market-data-providers`, `market-data-admin` y `market-data-dividends`.
14. `domains/market-data/route-market-data-alpha-vantage`: ruta HTTP para status, guardado y borrado de claves Alpha Vantage. Se carga en el bucle principal (no vía `routes.js`) y se invoca desde `routes.js` a través de `ctx.handleAlphaVantageKeyRoutes`.
15. `domains/transactions/transaction-repository`: acceso SQL de transacciones, auto planes y skips.
16. `domains/transactions/transaction-service`: CRUD de transacciones, preview y planes automáticos. Carga internamente `transaction-pricing` para resolución estricta de FX en escrituras.
17. `domains/transactions/auto-plan-date-service`: cálculo de fechas de planes automáticos (frecuencias diaria, semanal, bisemanal, mensual).
18. `domains/dividends/dividend-repository`: SQL de eventos de dividendos, settings por instrumento, scans y confirmación atómica en ledger.
19. `domains/dividends/dividend-service`: detección desde Yahoo Finance, borradores, edición, confirmación y auto-inclusión.
20. `domains/data-ingestion/ingestion-repository`: acceso SQL de lotes importados, filas, rollback y matching en `ctx.repositories.dataIngestion`.
21. `domains/data-ingestion/ingestion-service`: orquestación de importaciones (preview, commit, rollback) y registro genérico de adaptadores profesionales aportados por extensiones privadas.
22. `domains/onboarding/onboarding-repository`: acceso SQL del wizard (grupos, auto-planes).
23. `domains/onboarding/onboarding-service`: wizard de configuración inicial.
24. `domains/portfolio/portfolio-service`: resumen de cartera, revisión mensual y métricas.
25. `domains/history/history-repository`: acceso SQL de builds, invalidaciones, precios y eventos.
26. `domains/history/history-core`: motor de materialización de histórico.
27. `domains/history/history-service`: API de histórico, invalidaciones y reconstrucción.
28. `domains/admin/diagnostics-repository`: acceso SQL para counts, invalidaciones y PRAGMAs de diagnóstico.
29. `domains/admin/diagnostics-service`: métricas de rendimiento, tamaños de caché y exportación XLSX de movimientos.
30. `platform/extensions-runtime`: registra extensiones opcionales ya resueltas por el composition root antes de montar rutas HTTP.
31. `routes`: enrutado HTTP --- delegador que despacha a `route-*.js` por dominio.
32. `http`: servidor HTTP estático, Basic Auth opt-in y listener.

**Route modules (cargados por `routes.js`):**

- `domains/instruments/route-instruments.js`
- `domains/transactions/route-transactions.js`
- `domains/dividends/route-dividends.js`
- `domains/data-ingestion/route-data-ingestion.js`
- `domains/portfolio/route-portfolio.js`
- `domains/admin/route-admin.js`

**Route modules (cargados en el bucle principal, invocados desde `routes.js`):**

- `domains/market-data/route-market-data-alpha-vantage.js` — se registra vía `ctx.handleAlphaVantageKeyRoutes` en `routes.js`.

**Sub-módulos de portfolio-service (cargados internamente):**

- `portfolio-market-data`: helpers puros para estado agregado de precios y valoración base degradable.
- `portfolio-dates`: helpers puros de fechas mensuales y fechas programadas.
- `portfolio-flows`: helpers puros de resumen de compras, ventas, dividendos, comisiones y cash-flow por periodo.

**Sub-módulos de transaction-service (cargados internamente):**

- `transaction-pricing`: resolución estricta de precios/FX para escrituras de movimientos.
- `transaction-analytics`: cálculo puro de Operativa/FIFO, incluyendo dividendos sin alterar posiciones.

**Sub-módulos de import-service (cargados internamente):**

- `ingestion-parser`: parseo ExcelJS de la plantilla XLSX oficial de ValorGrid a formato canónico, con hojas permitidas, encabezados exactos, límite de tamaño, límite de filas y rechazo de fórmulas.
- `ingestion-preview`: generación de preview y detección de instrumentos.
- `ingestion-preview-helpers`: utilidades para renderizado de preview.
- `ingestion-reconcile`: conciliación de filas con instrumentos existentes.
- `ingestion-entities`: creación de instrumentos y grupos nuevos.
- `ingestion-profiles`: definición de la plantilla Community `valorgrid-xlsx` y listado de fuentes disponibles por edición (`listImportSources()`), sin documentar detalles operativos de conectores profesionales en la documentación pública.
- `ingestion-hash`: cálculo de hashes para deduplicación.
- `ingestion-sale-rules`: reglas de validación de ventas.
- `template-generator`: generación de plantilla XLSX oficial de ValorGrid.

`node:sqlite` debe quedar aislado detrás de `apps/server/src/platform/db.js`.

### Estado actual

La arquitectura vigente es un monolito modular con `ctx` agrupado, repositories por dominio, rutas delegadas por bounded context, TypeScript incremental con `noEmit` y frontend ESM nativo.

Reglas que deben mantenerse en cada cambio estructural:

- no romper API pública ni semántica funcional;
- mantener SQL en repositories y `node:sqlite` aislado en `apps/server/src/platform/db.js`;
- preferir `ctx.services.<domain>` y `ctx.repositories.<domain>` para código nuevo o refactorizado;
- validar con `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` y `npm run verify:publication`.

**Decisión ESM:** el backend se mantiene en CommonJS. El frontend ya usa ESM nativo del navegador. No se introduce `"type": "module"` ni compilación a `dist`. Si en el futuro se requiere compilación TypeScript real o ESM en backend, debe tratarse como fase independiente.

## Frontend

### `apps/web/index.html`

Punto de entrada del frontend. Carga `./src/app.js` como `<script type="module">`.

### `apps/web/src/app.js`

Orquestador del frontend:

- vive en `apps/web/src/`,
- crea `ctx` con primitivas del navegador y helpers API,
- registra módulos `apps/web/src/*.js` en orden fijo con `attach(ctx)`,
- inicializa tema, privacidad y primer render del dashboard/histórico.

### `apps/web/src/`

Módulos principales:

- `storage.js`: wrapper seguro para preferencias del usuario con fallback a cookies.
- `api.js`: fetch local, errores y timeouts.
- `api-client.js`: wrapper HTTP tipado con JSDoc para cada endpoint de la API.
- `state.js`: estado global de UI.
- `dom.js`: referencias a nodos.
- `extensions.js`: carga módulos web de extensiones profesionales registradas por el host de extensiones.
- `charts.js`: donut e histórico SVG.
- `format.js`: formato monetario, fechas, porcentajes y privacidad de saldos.
- `events.js`: eventos de UI.
- `instrument-create-market-data.js`: helpers de fuente de precio y NAV inicial en creación de instrumentos.
- `operations.js`: instrumentos, grupos, backups y administración.
- `operations-metrics.js`: catálogo de métricas de Operativa (registry de tarjetas de performance).
- `ledger.js`: movimientos y filtros.
- `dividends.js`: alerta de toolbar, modal de borradores y scan automatico de dividendos al arrancar.
- `monthly.js`: revisión YTD.
- `history.js`: histórico lineal.
- `history-preferences.js`: teaser de preferencias profesionales del gráfico Histórico y sincronización visual del panel de edición.
- `return-breakdown-preferences.js`: teaser de rentabilidad avanzada Professional Edition.
- `instrument-colors.js`: sincronización de paleta corporativa automática y bloqueo de inputs de color.
- `dashboard.js`: arranque de UI y boot overlay.
- `imports.js`: orquestación del asistente de importación, carga de fuentes desde `GET /api/import/sources` (`loadImportSources()`), y gestión de visibilidad de teasers PRO.
- `import-workflow.js`: lógica de flujo y validación de importación.
- `import-workflow-helpers.js`: constantes y helpers puros del flujo de importación.
- `import-preview-renderer.js`: renderizado de preview de importación.
- `import-confirm-renderer.js`: renderizado del paso de confirmación del asistente de importación.
- `import-file-zone.js`: zona de arrastre y selección de archivo para importación.
- `bulk-actions.js`: acciones masivas de selección y borrado.
- `privacy.js`: ocultación de saldos.
- `theme.js`: tema claro/oscuro.
- `forms.js`: helpers de formularios.
- `alpha-vantage-setup.js`: diálogo de configuración de clave API de Alpha Vantage (input, validación y persistencia via `/api/market-data/alpha-vantage/key`).
- `onboarding.js`: wizard de onboarding.
- `summary.js`: resumen de cartera expandido.
- `app.js`: orquestador del frontend que crea `ctx`, registra módulos en orden fijo con `attach(ctx)` e inicializa tema, privacidad y render inicial.
- `styles.css`: única hoja de estilos, cargada desde `index.html`. Contiene todos los estilos visuales de la aplicación (temas claro/oscuro, modales, tablas, botones, animaciones, scrollbar, responsive).

Los módulos de frontend ya no usan loaders dinámicos con `new Function`; cada uno exporta `attach(ctx)` y registra su API con `Object.assign(ctx, { ... })`.

## Histórico

El histórico no se calcula desde cero en cada petición.

Flujo:

1. El ledger cambia.
2. Se registra invalidación desde la fecha afectada.
3. Se reconstruyen posiciones y valores derivados.
4. La API lee de tablas materializadas.

Rangos:

- `ytd` y `1y`: diario.
- `2y`, `5y` y `all`: semanal por defecto.

Tablas clave:

- `portfolio_positions_daily`
- `portfolio_value_daily`
- `portfolio_value_weekly`
- `portfolio_events`
- `history_invalidations`
- `history_builds`

## Importaciones

El importador está diseñado como un flujo de conciliación, no como una carga directa.

Fases:

1. Parseo de fuente.
2. Normalización canónica.
3. Detección de instrumentos.
4. Conciliación visual.
5. Validación contable.
6. Preview de impacto.
7. Commit atómico de filas seleccionadas.
8. Rollback por lote si hace falta corregir.

Fuentes:

- Plantilla Excel de ValorGrid (XLSX).

ValorGrid Community no incluye adaptadores concretos de broker ni muestras de exportaciones privadas. La plantilla Excel se descarga desde `GET /api/import/template.xlsx` y contiene hojas de instrucciones y ejemplos además de la hoja `Movimientos` importable. La fuente pública sigue llamándose `valorgrid-xlsx`, aunque el parser interno usa ExcelJS.

Los conectores avanzados de ValorGrid Pro/Enterprise se tratan como superficie privada. Community solo documenta el contrato público de importación y no publica contratos operativos, código ni muestras privadas de esas integraciones.

## Exportaciones

La exportación pública de movimientos usa `GET /api/export/transactions.xlsx` y devuelve un Excel con una sola hoja `Movimientos`. El formato comparte encabezados con la plantilla oficial de importación, pero no incluye hojas de instrucciones ni ejemplos, para que el archivo pueda reimportarse directamente.

## Backups

La app puede crear copias locales de SQLite con:

- API local,
- UI de administración,
- script PowerShell.

Antes de copiar, se hace checkpoint WAL para reducir riesgo de backup inconsistente.
La API y los scripts operativos comparten la misma `backupDir` resuelta por `apps/server/src/platform/config.js`; las rutas admin consumen esta capacidad desde `ctx.services.admin`.

Para migraciones de schema versionadas, existe `scripts/run-sql-migration.ps1` que automatiza backup + ejecución SQL + verificación de integridad usando los SQL de `deploy/sql/update-X-to-Y.sql`. Ver `docs/DB_OPERATIONS.md` para el flujo completo.

## Docker, CasaOS y Umbrel

Docker ejecuta la app como servicio local con:

- `HOST=0.0.0.0`
- `PORT=1325`
- `PORTFOLIO_DB_PATH=/data/portfolio.sqlite`
- `VALORGRID_BACKUP_DIR=/app/.backups`

Los volúmenes guardan datos y backups fuera del contenedor.

Umbrel no reutiliza los compose de Docker local ni CasaOS. Su paquete vive en `deploy/umbrel/`, publica la UI mediante `app_proxy`, fija la imagen por `vX.Y.Z@sha256:<digest>` y persiste todo bajo `${APP_DATA_DIR}/data`. En Umbrel, `VALORGRID_BACKUP_DIR=/data/backups` para que backups y `secrets.json` queden dentro del volumen principal de la app.

## Seguridad

La app incluye Basic Auth monousuario opcional para despliegues Docker/CasaOS expuestos. En Umbrel queda desactivado porque la autenticación la aporta `app_proxy`. Para uso doméstico sin `VALORGRID_AUTH_PASSWORD`, debe quedarse en:

- localhost,
- LAN privada,
- VPN,
- o reverse proxy con HTTPS y `VALORGRID_AUTH_PASSWORD`.

No debe exponerse directamente a Internet sin HTTPS y autenticación.
