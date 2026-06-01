# Inventario y cobertura de tests

ValorGrid usa el test runner nativo de Node.js (`node:test`). Todos los tests son de integración: levantan un servidor real con SQLite en memoria.

## Archivos de test

| Archivo                            | Líneas | Tests | Dominio      | Cobertura                                                                                                                                                                                            |
| ---------------------------------- | ------ | ----- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/architecture.test.js`        | 244    | 6     | Arquitectura | Reglas estructurales: sin `with(ctx)`, sin `node:sqlite` fuera de `db.js`, sin SQL en services/rutas, límites de tamaño, `sendError` en todas las rutas, orden repo→service, exports estables        |
| `test/db-operations.test.js`       | 139    | 6     | DB Ops       | Resolución de path activo, reset con backup y recreación fresh, doctor para DB sana/ausente, sincronía `DATA_MODEL.md` ↔ `schema.js`, prohibición `ALTER TABLE`, canonicalidad de `seed:demo`        |
| `test/financial-semantics.test.js` | 102    | 5     | Cálculos     | `buildPortfolioPerformance`: netContributed, FIFO realized gain, netCashFlow. `buildMonthly`: YTD formulas. History: `contributed` acumulado                                                         |
| `test/imports.test.js`             | 740    | 29    | Importación  | CSV: preview, commit atómico, rollback, reimport. XLSX: sheet selection. DEGIRO: Transactions.csv, snapshot, ventas, divisas, ticker suggestions. IBKR: normalización                                |
| `test/portfolio.test.js`           | 539    | 32    | Core CRUD    | Transacciones (add/remove/preview/delete), instrumentos (CRUD, groups, identifiers, delete preview), auto-plans (round-trip, startDate, backdate), backups, health, onboarding, state, quote, export |
| `test/portfolio-history.test.js`   | 499    | 20    | Histórico    | Materialización (daily/weekly), invalidación, caché persistente, restart survival, daily prices/FX cache, summary, monthly, todos los rangos (`ytd`/`1y`/`2y`/`5y`/`all`), loadtest/demo dataset     |
| `test/privacy.test.js`             | 104    | 5     | Privacidad   | Artefactos SQLite ignorados, paths locales y etiquetas personales no publicables, fresh install sin datos personales, `.gitignore` y `.dockerignore` protección                                      |
| `test/integration-helpers.js`      | 178    | —     | Infra        | Helpers compartidos: mock de `fetch`, `cachePrice`, `seedTestInstrument`, `startTestServer`, `jsonRequest`, `registerLifecycle`                                                                      |

## Comandos

```bash
npm test                                     # todos los tests
node --test test/architecture.test.js        # un archivo
node --test --test-name-pattern "test name" test/portfolio.test.js   # un test
```

## Ejecución en CI

`.github/workflows/ci.yml` ejecuta en `windows-latest` con Node 24:

```
npm ci
npm run typecheck
npm run lint
npm run format:check
node --check server.js
node --check app.js
npm test
```

## Tipos de tests

- **Integración**: `portfolio.test.js`, `portfolio-history.test.js`, `imports.test.js`, `financial-semantics.test.js` — levantan servidor real con SQLite en `temp/`.
- **Arquitectura**: `architecture.test.js` — análisis estático del código fuente, sin runtime.
- **DB Ops**: `db-operations.test.js` — mixto (análisis estático + DB temporal).
- **Privacidad**: `privacy.test.js` — análisis estático de archivos publicables.
- **Helper**: `integration-helpers.js` — no es un test, es infraestructura compartida.
