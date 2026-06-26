# Inventario y cobertura de tests

ValorGrid usa el test runner nativo de Node.js (`node:test`). La suite mezcla tests de integración con servidor real y tests estáticos de arquitectura, privacidad y frontend.

## Archivos de test

| Archivo                            | Dominio       | Cobertura                                                                                                                                                                                                 |
| ---------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/architecture.test.js`        | Arquitectura  | Reglas estructurales: sin `with(ctx)`, sin `node:sqlite` fuera de `db.js`, sin SQL en services/rutas, límites de tamaño, `sendError` en rutas, orden repository -> service y exports estables.            |
| `test/backup-delete.test.js`       | Backups       | Eliminación de backups via API: creación y borrado, verificación de persistencia, errores 404/400, protección contra path traversal.                                                                      |
| `test/brand-palette.test.js`       | Paleta        | Algoritmo de paleta corporativa: posiciones, interpolación, colores hex válidos, sin duplicados en primeros 20.                                                                                           |
| `test/auth.test.js`                | Autenticación | Basic Auth: parseo de cabeceras, activación con password, rechazo de credenciales incorrectas, endpoints protegidos.                                                                                      |
| `test/db-operations.test.js`       | DB Ops        | Resolución de path activo, reset con backup, recreación fresh, doctor, sincronía `DATA_MODEL.md` -> `schema.js`, prohibición `ALTER TABLE`, validación de SQL versionados y canonicalidad de `seed:demo`. |
| `test/desktop-release.test.js`     | Release       | Scripts y configuración de distribución desktop: targets Windows/Linux/macOS, nombres estables, checksums y workflow de GitHub Release.                                                                   |
| `test/financial-semantics.test.js` | Cálculos      | `buildPortfolioPerformance`, FIFO realized gain, signos de cash-flow, fórmulas YTD y `history.series[].contributed`.                                                                                      |
| `test/frontend-renovation.test.js` | Frontend      | Checks de renderizado/markup/CSS: KPI cards, badges, animaciones, tooltips, módulos ESM, clases semánticas y UI de revisión de dividendos.                                                                |
| `test/imports.test.js`             | Importación   | Plantilla XLSX Community con parser ExcelJS, preview, commit, rollback, controles de seguridad, rechazo de fuentes legacy, headers de descarga y sample sintético S&P 500.                                |
| `test/instrument-groups.test.js`   | Grupos        | Instrument groups settings: enable/disable toggle, grupo-cero creation, ungrouped instrument assignment, wizard/import respect for groups state.                                                          |
| `test/portfolio.test.js`           | Core CRUD     | Transacciones, dividendos desde Yahoo, instrumentos, grupos, identifiers, fuentes/precios de mercado, auto-plans, backups, health, onboarding, state, quote, export XLSX y endpoints legacy 404.          |
| `test/portfolio-history.test.js`   | Histórico     | Materialización daily/weekly, invalidación, cache persistente, restart survival, daily prices/FX, summary, monthly, rangos y dataset demo/loadtest.                                                       |
| `test/privacy.test.js`             | Privacidad    | Artefactos SQLite ignorados, paths locales, etiquetas personales, fresh install limpio, `.gitignore`, `.dockerignore` y XLSX públicos sin tokens privados.                                                |
| `test/storage.test.js`             | Frontend      | `apps/web/src/storage.js`: export default, `getItem`/`setItem`/`removeItem`, referencias a `localStorage` y fallback a cookies.                                                                           |
| `test/umbrel-package.test.js`      | Despliegue    | Paquete Umbrel: generador sincronizado, compose independiente con `app_proxy`, imagen versionada con digest, persistencia en `${APP_DATA_DIR}` e id comunitario con prefijo de store.                     |
| `test/verify-publication.test.js`  | Publicación   | `scripts/verify-publication.js`: éxito en repo limpio, fallo con archivos prohibidos, fallo con ALTER TABLE, scan de scripts PowerShell.                                                                  |
| `test/integration-helpers.js`      | Infra         | Helpers compartidos: mock de `fetch`, eventos Yahoo de dividendos/splits, helpers ExcelJS, `cachePrice`, `seedTestInstrument`, `startTestServer`, `jsonRequest`, `registerLifecycle`.                     |

## Comandos

```bash
npm test
node --test test/architecture.test.js
node --test --test-name-pattern "test name" test/portfolio.test.js
```

## Ejecución en CI

`.github/workflows/ci.yml` ejecuta en un matrix de `windows-latest` y `ubuntu-latest` con Node 24:

```text
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run docs:spellcheck
node --check apps/server/server.js
node --check apps/web/src/app.js
node --check apps/desktop/main.js
npm test
npm run verify:publication
npm run seed:demo
```

## Tipos de tests

- **Integración**: `portfolio.test.js`, `portfolio-history.test.js`, `imports.test.js`, `financial-semantics.test.js` levantan runtime real con SQLite temporal o en memoria.
- **Arquitectura**: `architecture.test.js` hace análisis estático de código fuente y contratos públicos.
- **Frontend**: `frontend-renovation.test.js` valida markup, CSS y patrones de módulos cliente sin navegador real. `storage.test.js` verifica la estructura de `apps/web/src/storage.js`.
- **DB Ops**: `db-operations.test.js` combina análisis estático y DB temporal.
- **Privacidad**: `privacy.test.js` analiza archivos publicables y fixtures.
- **Autenticación**: `auth.test.js` valida el comportamiento de Basic Auth con servidor real.
- **Publicación**: `verify-publication.test.js` ejecuta `scripts/verify-publication.js` en contexto de prueba; `umbrel-package.test.js` valida el paquete Umbrel independiente.
- **Helper**: `integration-helpers.js` no es un test; es infraestructura compartida.
