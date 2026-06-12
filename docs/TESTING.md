# Inventario y cobertura de tests

ValorGrid usa el test runner nativo de Node.js (`node:test`). La suite mezcla tests de integración con servidor real y tests estáticos de arquitectura, privacidad y frontend.

## Archivos de test

| Archivo                            | Dominio       | Cobertura                                                                                                                                                                                      |
| ---------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/architecture.test.js`        | Arquitectura  | Reglas estructurales: sin `with(ctx)`, sin `node:sqlite` fuera de `db.js`, sin SQL en services/rutas, límites de tamaño, `sendError` en rutas, orden repository -> service y exports estables. |
| `test/auth.test.js`                | Autenticación | Basic Auth: parseo de cabeceras, activación con password, rechazo de credenciales incorrectas, endpoints protegidos.                                                                           |
| `test/db-operations.test.js`       | DB Ops        | Resolución de path activo, reset con backup, recreación fresh, doctor, sincronía `DATA_MODEL.md` -> `schema.js`, prohibición `ALTER TABLE` y canonicalidad de `seed:demo`.                     |
| `test/financial-semantics.test.js` | Cálculos      | `buildPortfolioPerformance`, FIFO realized gain, signos de cash-flow, fórmulas YTD y `history.series[].contributed`.                                                                           |
| `test/frontend-renovation.test.js` | Frontend      | Checks de renderizado/markup/CSS: KPI cards, badges, animaciones, tooltips, módulos ESM y clases semánticas usadas por la UI.                                                                  |
| `test/imports.test.js`             | Importación   | Plantilla XLSX Community con parser ExcelJS, preview, commit, rollback, controles de seguridad, rechazo de fuentes legacy, headers de descarga y sample sintético S&P 500.                     |
| `test/portfolio.test.js`           | Core CRUD     | Transacciones, instrumentos, grupos, identifiers, auto-plans, backups, health, onboarding, state, quote, export XLSX, endpoints legacy 404 y limpieza de export CSV/JSON.                      |
| `test/portfolio-history.test.js`   | Histórico     | Materialización daily/weekly, invalidación, cache persistente, restart survival, daily prices/FX, summary, monthly, rangos y dataset demo/loadtest.                                            |
| `test/privacy.test.js`             | Privacidad    | Artefactos SQLite ignorados, paths locales, etiquetas personales, fresh install limpio, `.gitignore`, `.dockerignore` y XLSX públicos sin tokens privados.                                     |
| `test/storage.test.js`             | Frontend      | `storage.js`: export default, `getItem`/`setItem`/`removeItem`, referencias a `localStorage` y fallback a cookies.                                                                             |
| `test/verify-publication.test.js`  | Publicación   | `scripts/verify-publication.js`: éxito en repo limpio, fallo con archivos prohibidos, fallo con ALTER TABLE, scan de scripts PowerShell.                                                       |
| `test/integration-helpers.js`      | Infra         | Helpers compartidos: mock de `fetch`, helpers ExcelJS, `cachePrice`, `seedTestInstrument`, `startTestServer`, `jsonRequest`, `registerLifecycle`.                                              |

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
node --check server.js
node --check client/app.js
npm test
npm run verify:publication
npm run seed:demo
```

## Tipos de tests

- **Integración**: `portfolio.test.js`, `portfolio-history.test.js`, `imports.test.js`, `financial-semantics.test.js` levantan runtime real con SQLite temporal o en memoria.
- **Arquitectura**: `architecture.test.js` hace análisis estático de código fuente y contratos públicos.
- **Frontend**: `frontend-renovation.test.js` valida markup, CSS y patrones de módulos cliente sin navegador real. `storage.test.js` verifica la estructura de `client/storage.js`.
- **DB Ops**: `db-operations.test.js` combina análisis estático y DB temporal.
- **Privacidad**: `privacy.test.js` analiza archivos publicables y fixtures.
- **Autenticación**: `auth.test.js` valida el comportamiento de Basic Auth con servidor real.
- **Publicación**: `verify-publication.test.js` ejecuta `scripts/verify-publication.js` en contexto de prueba.
- **Helper**: `integration-helpers.js` no es un test; es infraestructura compartida.
