# Arquitectura

ValorGrid es una aplicación local monousuario con backend Node.js, SQLite local y frontend estático modular.

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
- **Carpetas por bounded context** (migración activa de `src/` plano a `src/domains/<domain>/` agrupando service + repository + routes por dominio, con `src/platform/` para infraestructura compartida).

Principios operativos de la migración:

- No romper API pública ni semántica funcional en cada fase.
- Fases pequeñas, pruebas completas y commit por fase.
- Convivencia temporal de capas legacy y nuevas mientras se reduce acoplamiento.
- Documentación de arquitectura actualizada en cada cambio estructural.

## Raíz del proyecto

- `tsconfig.json`: configuración de TypeScript incremental (`strict`, `allowJs`, `checkJs: false`, `noEmit`).
- `desktop/main.js`: wrapper Electron para la distribucion Windows. Arranca el servidor local en `127.0.0.1` con puerto efímero y guarda DB/backups en la carpeta de datos de usuario de la app.

### Estructura física por dominio (implementada)

Módulos organizados en carpetas por bounded context y plataforma compartida:

```
src/
├── domains/
│   ├── instruments/    (instrument-*, route-instruments)
│   ├── transactions/   (transaction-*, route-transactions)
│   ├── data-ingestion/ (ingestion-*, route-data-ingestion)
│   ├── portfolio/      (portfolio-*, route-portfolio)
│   ├── history/        (history-*)
│   ├── market-data/    (market-data-*)
│   ├── meta/           (meta-repository, meta-state)
│   ├── onboarding/     (onboarding-*)
│   ├── ticker-suggestions/ (ticker-suggestions-*)
│   └── admin/          (diagnostics-*, route-admin)
├── platform/           (db, config, http, backups, ctx-utils, validators, app-error, utils)
├── types.ts
├── app.js
├── routes.js
└── ...
```

Cada dominio se migra completo: service + repository + routes. `src/app.js` y `route-*.js` mantienen el wiring externo.

## Backend

### `server.js`

Bootstrap mínimo (9 líneas): delega en `src/app.js` para toda la lógica. Solo arranca el listener HTTP cuando se ejecuta directamente.

### `src/app.js`

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
- Las transacciones SQLite deben usar los helpers de `src/platform/db.js` (`withTransaction` / `withTransactionAsync`), no `BEGIN/COMMIT/ROLLBACK` manuales en services.

### `src/` y `src/platform/`

**Infraestructura compartida en `src/platform/`:**

- `config.js`: host, puerto, rutas, versión, DB activa y auth opcional.
- `auth.js`: Basic Auth monousuario opt-in para despliegues Docker/CasaOS (importado por `http.js`, no cargado directamente en `app.js`).
- `db.js`: apertura SQLite, PRAGMAs, helpers `withTransaction`/`withTransactionAsync`.
- `http.js`: servidor HTTP estático, Basic Auth opt-in y listener.
- `backups.js`: creación, listado y descarga de backups SQLite.
- `ctx-utils.js`: `assertCtxDeps`, `getCtxDep`.
- `utils.js`: helpers compartidos (formato, fechas, HTTP, caché).
- `validators.js`: validadores de entrada (`assertPresent`, `assertXor`, etc.).
- `app-error.js`: clase `AppError` con `statusCode` + `errorCode`.

**Archivos raíz en `src/`:**

- `types.ts`: interfaces de dominio TypeScript.
- `route-service-bindings.js`: resolución de handlers desde `ctx.services.*`.
- `routes.js`: delegador HTTP que despacha a `route-*.js` por dominio.
- `app.js`: composition root y orquestador de módulos (backend).
- `app-core.js`: re-export de `src/app.js`.
- `schema.js`: creación fresh idempotente de tablas.
- `schema-seed.js`: datos iniciales de instrumentos y planes automáticos.

**Dominios en `src/domains/`**:

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
5. `utils`: helpers compartidos (formato, validación, fechas).
6. `domains/instruments/instrument-repository`: acceso SQL de instrumentos, grupos e identificadores.
7. `domains/portfolio/portfolio-repository`: lecturas SQL de onboarding y lookup de instrumentos.
8. `domains/ticker-suggestions/ticker-suggestions-repository`: lookup SQL de sugerencias de ticker por ISIN histórico.
9. `domains/instruments/instrument-service`: reglas de negocio y flujo de instrumentos.
10. `domains/ticker-suggestions/ticker-suggestions`: resolución de tickers por ISIN, nombre o historial.
11. `domains/market-data/market-data-repository`: acceso a `price_cache` y `daily_price_cache`.
12. `domains/market-data/market-data`: precios, Yahoo Finance, caché y FX.
13. `domains/transactions/transaction-repository`: acceso SQL de transacciones, auto planes y skips.
14. `domains/transactions/transaction-service`: CRUD de transacciones, preview y planes automáticos.
15. `domains/data-ingestion/ingestion-repository`: acceso SQL de lotes importados, filas, rollback y matching en `ctx.repositories.dataIngestion`.
16. `domains/data-ingestion/ingestion-service`: orquestación de importaciones (preview, commit, rollback).
17. `domains/onboarding/onboarding-repository`: acceso SQL del wizard (grupos, auto-planes).
18. `domains/onboarding/onboarding-service`: wizard de configuración inicial.
19. `domains/portfolio/portfolio-service`: resumen de cartera, revisión mensual y métricas.
20. `domains/history/history-repository`: acceso SQL de builds, invalidaciones, precios y eventos.
21. `domains/history/history-core`: motor de materialización de histórico.
22. `domains/history/history-service`: API de histórico, invalidaciones y reconstrucción.
23. `domains/admin/diagnostics-repository`: acceso SQL para counts, invalidaciones y PRAGMAs de diagnóstico.
24. `domains/admin/diagnostics-service`: métricas de rendimiento, tamaños de caché y exportación XLSX de movimientos.
25. `routes`: enrutado HTTP --- delegador que despacha a `route-*.js` por dominio.
26. `http`: servidor HTTP estático, Basic Auth opt-in y listener.

**Route modules (cargados por `routes.js`):**

- `domains/instruments/route-instruments.js`
- `domains/transactions/route-transactions.js`
- `domains/data-ingestion/route-data-ingestion.js`
- `domains/portfolio/route-portfolio.js`
- `domains/admin/route-admin.js`

**Sub-módulos de import-service (cargados internamente):**

- `ingestion-parser`: parseo ExcelJS de la plantilla XLSX oficial de ValorGrid a formato canónico, con hojas permitidas, encabezados exactos, límite de tamaño, límite de filas y rechazo de fórmulas.
- `ingestion-preview`: generación de preview y detección de instrumentos.
- `ingestion-preview-helpers`: utilidades para renderizado de preview.
- `ingestion-reconcile`: conciliación de filas con instrumentos existentes.
- `ingestion-entities`: creación de instrumentos y grupos nuevos.
- `ingestion-profiles`: definicion de la plantilla Community `valorgrid-xlsx` y listado de fuentes disponibles por edición (`listImportSources()`), sin documentar detalles operativos de conectores profesionales en la documentación pública.
- `ingestion-hash`: cálculo de hashes para deduplicación.
- `ingestion-sale-rules`: reglas de validación de ventas.
- `template-generator`: generación de plantilla XLSX oficial de ValorGrid.

`node:sqlite` debe quedar aislado detrás de `src/platform/db.js`.

### Estado actual

La arquitectura vigente es un monolito modular con `ctx` agrupado, repositories por dominio, rutas delegadas por bounded context, TypeScript incremental con `noEmit` y frontend ESM nativo.

Reglas que deben mantenerse en cada cambio estructural:

- no romper API pública ni semántica funcional;
- mantener SQL en repositories y `node:sqlite` aislado en `src/platform/db.js`;
- preferir `ctx.services.<domain>` y `ctx.repositories.<domain>` para código nuevo o refactorizado;
- validar con `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` y `npm run verify:publication`.

**Decisión ESM:** el backend se mantiene en CommonJS. El frontend ya usa ESM nativo del navegador. No se introduce `"type": "module"` ni compilación a `dist`. Si en el futuro se requiere compilación TypeScript real o ESM en backend, debe tratarse como fase independiente.

## Frontend

### `index.html`

Punto de entrada del frontend. Carga `./client/app.js` como `<script type="module">`.

### `client/app.js`

Orquestador del frontend:

- vive en `client/`,

- crea `ctx` con primitivas del navegador y helpers API,
- registra módulos `client/*.js` en orden fijo con `attach(ctx)`,
- inicializa tema, privacidad y primer render del dashboard/histórico.

### `client/`

Módulos principales:

- `api.js`: fetch local, errores y timeouts.
- `api-client.js`: wrapper HTTP tipado con JSDoc para cada endpoint de la API.
- `state.js`: estado global de UI.
- `dom.js`: referencias a nodos.
- `charts.js`: donut e histórico SVG.
- `format.js`: formato monetario, fechas, porcentajes y privacidad de saldos.
- `events.js`: eventos de UI.
- `operations.js`: instrumentos, grupos, backups y administración.
- `ledger.js`: movimientos y filtros.
- `monthly.js`: revisión YTD.
- `history.js`: histórico lineal.
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
- `onboarding.js`: wizard de onboarding.
- `summary.js`: resumen de cartera expandido.

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
La API y los scripts operativos comparten la misma `backupDir` resuelta por `src/platform/config.js`; las rutas admin consumen esta capacidad desde `ctx.services.admin`.

## Docker y CasaOS

Docker ejecuta la app como servicio local con:

- `HOST=0.0.0.0`
- `PORT=1325`
- `PORTFOLIO_DB_PATH=/data/portfolio.sqlite`

Los volúmenes guardan datos y backups fuera del contenedor.

## Seguridad

La app incluye Basic Auth monousuario opcional para despliegues Docker/CasaOS expuestos. Para uso doméstico sin `VALORGRID_AUTH_PASSWORD`, debe quedarse en:

- localhost,
- LAN privada,
- VPN,
- o reverse proxy con HTTPS y `VALORGRID_AUTH_PASSWORD`.

No debe exponerse directamente a Internet sin HTTPS y autenticación.
