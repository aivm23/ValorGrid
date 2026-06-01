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
- Documentación y skill de arquitectura actualizadas en cada cambio estructural.

## Raíz del proyecto

- `tsconfig.json`: configuración de TypeScript incremental (`strict`, `allowJs`, `checkJs: false`, `noEmit`).

### Estructura física por dominio (implementada)

Módulos organizados en carpetas por bounded context y plataforma compartida:

```
src/
├── domains/
│   ├── instruments/    (instrument-*, route-instruments)
│   ├── transactions/   (transaction-*, route-transactions)
│   ├── imports/        (import-*, route-imports)
│   ├── portfolio/      (portfolio-*, route-portfolio)
│   ├── history/        (history-*, route-portfolio históricos)
│   ├── market-data/    (market-data-*)
│   ├── onboarding/     (onboarding-*)
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
- llama a `ctx.initDatabase()` para ejecutar schema y migraciones idempotentes.

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
- Las transacciones SQLite deben usar los helpers de `src/db.js` (`withTransaction` / `withTransactionAsync`), no `BEGIN/COMMIT/ROLLBACK` manuales en services.

### `src/` y `src/platform/`

Archivos base e infraestructura compartida:

- `config.js`: host, puerto, rutas, versión y DB activa.
- `db.js`: apertura SQLite, PRAGMAs, helpers `withTransaction`/`withTransactionAsync`.
- `backups.js`: creación, listado y descarga de backups SQLite.
- `types.ts`: interfaces de dominio TypeScript.
- `ctx-utils.js`: `assertCtxDeps`, `getCtxDep`.
- `utils.js`: helpers compartidos (formato, fechas, HTTP, caché).
- `validators.js`: validadores de entrada (`assertPresent`, `assertXor`, etc.).
- `app-error.js`: clase `AppError` con `statusCode` + `errorCode`.
- `route-service-bindings.js`: resolución de handlers desde `ctx.services.*`.
- `routes.js`: delegador HTTP que despacha a `route-*.js` por dominio.

**Dominios en `src/domains/`**:

La lógica principal vive en módulos. Orden de carga en `app.js`:

**Cargados vía `require()` directo (antes del bucle):**

- `config`: host, puerto, rutas, versión y DB activa.
- `db`: apertura SQLite, PRAGMAs, helpers y transacciones.
- `backups`: creación, listado y descarga de backups SQLite.

**Cargados en bucle `for...of` (orden secuencial):**

1. `schema`: creación y evolución idempotente de tablas.
2. `schema-seed`: datos iniciales de instrumentos y planes automáticos.
3. `domains/meta/meta-repository`: acceso SQL de `app_meta` e invalidaciones.
4. `domains/meta/meta-state`: gestión de versiones e invalidaciones desde repository.
5. `utils`: helpers compartidos (formato, validación, fechas).
6. `domains/instruments/instrument-repository`: acceso SQL de instrumentos, grupos e identificadores.
7. `portfolio-repository`: lecturas SQL de onboarding y lookup de instrumentos.
8. `ticker-suggestions-repository`: lookup SQL de sugerencias de ticker por ISIN histórico.
9. `domains/instruments/instrument-service`: reglas de negocio y flujo de instrumentos.
10. `ticker-suggestions`: resolución de tickers por ISIN, nombre o historial.
11. `domains/market-data/market-data-repository`: acceso a `price_cache` y `daily_price_cache`.
12. `domains/market-data/market-data`: precios, Yahoo Finance, caché y FX.
13. `domains/transactions/transaction-repository`: acceso SQL de transacciones, auto planes y skips.
14. `domains/transactions/transaction-service`: CRUD de transacciones, preview y planes automáticos.
15. `domains/imports/import-repository`: acceso SQL de lotes importados, filas, rollback y matching.
16. `domains/imports/import-service`: orquestación de importaciones (preview, commit, rollback).
17. `domains/onboarding/onboarding-repository`: acceso SQL del wizard (grupos, auto-planes).
18. `domains/onboarding/onboarding-service`: wizard de configuración inicial.
19. `domains/portfolio/portfolio-service`: resumen de cartera, revisión mensual y métricas.
20. `domains/history/history-repository`: acceso SQL de builds, invalidaciones, precios y eventos.
21. `domains/history/history-core`: motor de materialización de histórico.
22. `domains/history/history-service`: API de histórico, invalidaciones y reconstrucción.
23. `diagnostics-repository`: acceso SQL para counts, invalidaciones y PRAGMAs de diagnóstico.
24. `domains/admin/diagnostics-service`: métricas de rendimiento y tamaños de caché.
25. `routes`: enrutado HTTP --- delegador que despacha a `route-*.js` por dominio.
26. `http`: servidor HTTP estático y listener.

**Route modules (cargados por `routes.js`):**

- `domains/instruments/route-instruments.js`
- `domains/transactions/route-transactions.js`
- `domains/imports/route-imports.js`
- `domains/portfolio/route-portfolio.js`
- `domains/admin/route-admin.js`

**Sub-módulos de import-service (cargados internamente):**

- `import-parser`: parseo de CSV/XLSX a formato canónico.
- `import-preview`: generación de preview y detección de instrumentos.
- `import-preview-helpers`: utilidades para renderizado de preview.
- `import-reconcile`: conciliación de filas con instrumentos existentes.
- `import-entities`: creación de instrumentos y grupos nuevos.
- `import-profiles`: perfiles de broker (DEGIRO, IBKR, genérico).
- `import-labels`: generación de etiquetas y mensajes.
- `import-hash`: cálculo de hashes para deduplicación.
- `import-sale-rules`: reglas de validación de ventas.

**Archivo adicional:**

- `app-core.js`: re-export de `app.js` (`module.exports = require('./app')`).
- `ctx-utils.js`: helpers de validación de dependencias (`assertCtxDeps`, `getCtxDep`).
- `app-error.js`: clase `AppError` con `statusCode` y `errorCode` para errores estructurados.
- `validators.js`: validadores de entrada reutilizables (`assertPresent`, `assertPositiveNumber`, etc.).
- `route-service-bindings.js`: resolución de handlers HTTP desde `ctx.services.*` con fallback legacy.
- `route-instruments.js`: rutas HTTP de instrumentos, grupos e identificadores delegadas al dominio.
- `route-transactions.js`: rutas HTTP de transacciones y auto-planes delegadas al dominio.
- `route-imports.js`: rutas HTTP de importación delegadas al dominio.
- `route-portfolio.js`: rutas HTTP de portfolio, histórico y onboarding delegadas al dominio.
- `route-admin.js`: rutas HTTP de administración, backups, export y diagnóstico delegadas al dominio.
- `instrument-repository.js`: repository de instrumentos, grupos e identificadores.
- `portfolio-repository.js`: repository de lecturas de portfolio/onboarding y lookup de instrumentos.
- `ticker-suggestions-repository.js`: repository de sugerencias ticker por identificadores históricos.
- `market-data-repository.js`: repository de mercado (caché de precios diarios y puntuales).
- `transaction-repository.js`: repository de transacciones, auto planes y skips.
- `import-repository.js`: repository de importaciones (batches, rows, rollback y matching contra ledger).
- `onboarding-repository.js`: repository del wizard de onboarding (persistencia y transacción).
- `history-repository.js`: repository de histórico (materialización, builds, invalidaciones y eventos).
- `meta-repository.js`: repository de versiones de datos (`app_meta`) e invalidaciones de histórico.
- `diagnostics-repository.js`: repository de métricas SQL internas para endpoints de salud/diagnóstico.

`node:sqlite` debe quedar aislado detrás de `src/db.js`.

### Hoja de ruta activa (resumen)

La migración a monolito modular con `ctx` agrupado, repositories por dominio y TypeScript incremental está completada al nivel de la versión `2.30.29`. Hitos alcanzados:

Baseline de ejecución de esta tanda: `main` local en `HEAD` (ahead de `origin/main`) sin rebase previo.

1. ✅ Reglas de arquitectura documentadas en docs + skill + AGENTS.
2. ✅ Quality gates graduales (lint/format/typecheck) sin reescritura masiva.
3. ✅ `ctx` agrupado (`config`, `cache`, `logger`, `services`, `repositories`).
4. ✅ SQL extraído a repositories por dominio (meta, suggestions, portfolio, diagnostics, instruments, transactions, imports, history, market, onboarding).
5. ✅ `routes.js` reducido a delegador que despacha a `route-*.js` por dominio.
6. ✅ TypeScript incremental activo (`tsconfig.json`, `types.ts`, JSDoc en helpers y repos).
7. ✅ AppError + validadores de entrada con `sendError` en todas las rutas HTTP.
8. ✅ Frontend documentado con `api-client.js` tipado y JSDoc en módulos clave.

**Decisión ESM:** el backend se mantiene en CommonJS. El frontend ya usa ESM nativo del navegador. No se introduce `"type": "module"` ni compilación a `dist` en esta versión. La migración TS se apoya en JSDoc + `noEmit` sin cambiar el runtime. Si en el futuro se requiere compilación TS real o ESM en backend, se reevaluará como una fase independiente.

Cada fase se valida con pruebas enfocadas + `npm run lint` + `npm run format:check` + `npm test` + `npm run verify:publication`.

## Frontend

### `index.html`

Punto de entrada del frontend. Carga `./app.js` (archivo en la raíz del proyecto) como `<script type="module">`.

### `app.js`

Orquestador del frontend:

- vive en la raíz del proyecto (no en `client/`),

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
- `imports.js`: orquestación del asistente de importación.
- `import-workflow.js`: lógica de flujo y validación de importación.
- `import-workflow-helpers.js`: constantes y helpers puros del flujo de importación.
- `import-preview-renderer.js`: renderizado de preview de importación.
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

- CSV genérico.
- XLSX genérico.
- DEGIRO CSV.
- IBKR CSV.

Los adaptadores de broker solo transforman a un formato normalizado común. La resolución de instrumentos se apoya en identificadores genéricos y confirmaciones del usuario.

## Backups

La app puede crear copias locales de SQLite con:

- API local,
- UI de administración,
- script PowerShell.

Antes de copiar, se hace checkpoint WAL para reducir riesgo de backup inconsistente.

## Docker y CasaOS

Docker ejecuta la app como servicio local con:

- `HOST=0.0.0.0`
- `PORT=5173`
- `PORTFOLIO_DB_PATH=/data/portfolio.sqlite`

Los volúmenes guardan datos y backups fuera del contenedor.

## Seguridad

La app no incluye autenticación. Para uso doméstico debe quedarse en:

- localhost,
- LAN privada,
- VPN,
- o reverse proxy con autenticación externa.

No debe exponerse directamente a Internet sin una capa de autenticación adicional.
