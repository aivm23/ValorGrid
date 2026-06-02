# Inventario y cobertura de tests

ValorGrid usa el test runner nativo de Node.js (`node:test`). La suite mezcla tests de integracion con servidor real y tests estaticos de arquitectura, privacidad y frontend.

## Archivos de test

| Archivo                            | Lineas | Tests | Dominio      | Cobertura |
| ---------------------------------- | ------ | ----- | ------------ | --------- |
| `test/architecture.test.js`        | 260    | 28    | Arquitectura | Reglas estructurales: sin `with(ctx)`, sin `node:sqlite` fuera de `db.js`, sin SQL en services/rutas, limites de tamano, `sendError` en rutas, orden repository -> service y exports estables. |
| `test/db-operations.test.js`       | 157    | 8     | DB Ops       | Resolucion de path activo, reset con backup, recreacion fresh, doctor, sincronia `DATA_MODEL.md` -> `schema.js`, prohibicion `ALTER TABLE` y canonicalidad de `seed:demo`. |
| `test/financial-semantics.test.js` | 120    | 5     | Calculos     | `buildPortfolioPerformance`, FIFO realized gain, signos de cash-flow, formulas YTD y `history.series[].contributed`. |
| `test/frontend-renovation.test.js` | 355    | 24    | Frontend     | Checks de renderizado/markup/CSS: KPI cards, badges, animaciones, tooltips, modulos ESM y clases semanticas usadas por la UI. |
| `test/imports.test.js`             | 414    | 26    | Importacion  | Plantilla XLSX Community, preview, commit, rollback, divisas, FX manual, seleccion de hoja, rechazo de fuentes legacy, headers de descarga y sample sintetico S&P 500. |
| `test/portfolio.test.js`           | 634    | 32    | Core CRUD    | Transacciones, instrumentos, grupos, identifiers, auto-plans, backups, health, onboarding, state, quote, export y 404 JSON. |
| `test/portfolio-history.test.js`   | 576    | 21    | Historico    | Materializacion daily/weekly, invalidacion, cache persistente, restart survival, daily prices/FX, summary, monthly, rangos y dataset demo/loadtest. |
| `test/privacy.test.js`             | 166    | 8     | Privacidad   | Artefactos SQLite ignorados, paths locales, etiquetas personales, fresh install limpio, `.gitignore`, `.dockerignore` y XLSX publicos sin tokens privados. |
| `test/integration-helpers.js`      | 201    | -     | Infra        | Helpers compartidos: mock de `fetch`, `cachePrice`, `seedTestInstrument`, `startTestServer`, `jsonRequest`, `registerLifecycle`. |

Los recuentos anteriores son orientativos. Si se anaden o eliminan tests, actualizar esta tabla en el mismo cambio.

## Comandos

```bash
npm test
node --test test/architecture.test.js
node --test --test-name-pattern "test name" test/portfolio.test.js
```

## Ejecucion en CI

`.github/workflows/ci.yml` ejecuta en `windows-latest` con Node 24:

```text
npm ci
npm run typecheck
npm run lint
npm run format:check
node --check server.js
node --check app.js
npm test
```

## Tipos de tests

- **Integracion**: `portfolio.test.js`, `portfolio-history.test.js`, `imports.test.js`, `financial-semantics.test.js` levantan runtime real con SQLite temporal o en memoria.
- **Arquitectura**: `architecture.test.js` hace analisis estatico de codigo fuente y contratos publicos.
- **Frontend**: `frontend-renovation.test.js` valida markup, CSS y patrones de modulos cliente sin navegador real.
- **DB Ops**: `db-operations.test.js` combina analisis estatico y DB temporal.
- **Privacidad**: `privacy.test.js` analiza archivos publicables y fixtures.
- **Helper**: `integration-helpers.js` no es un test; es infraestructura compartida.
