---
name: valorgrid-xlsx-import-debug
description: Debug and maintain ValorGrid Community official Excel imports through valorgrid-xlsx. Use when issues involve ExcelJS parsing, template validation, preview, commit, rollback, dedupe, selected rows, FX to EUR, sheet/header/formula controls, or Community import limits. Do not use for broker-specific adapters; those belong in private professional import skills.
---

# ValorGrid XLSX Import Debug

Use this skill for Community import work that stays inside the official ValorGrid Excel template flow.

## Boundary

- Work only with the public `valorgrid-xlsx` source.
- Do not add broker-specific adapter ids, fixture names, parser contracts, environment variables, private paths, or setup details to Community files.
- If a task needs a professional broker adapter, stop Community editing and use the private professional import skill in the PRO repository.
- Keep public docs at contract level: edition semantics are allowed, connector internals are not.

## Source Of Truth

- Parser and source registry: `src/domains/data-ingestion/ingestion-parser.js` and `src/domains/data-ingestion/ingestion-profiles.js`.
- Template generator: `src/domains/data-ingestion/template-generator.js`.
- Preview and commit behavior: `src/domains/data-ingestion/ingestion-preview.js`, `ingestion-reconcile.js`, `ingestion-service.js`, `ingestion-repository.js`, and `ingestion-sale-rules.js`.
- UI entrypoint: `index.html` plus the import workflow modules under `client/`.
- Public documentation: `docs/IMPORT_EXCEL.md`, `docs/API.md`, `docs/DATA_MODEL.md`, and `docs/ARCHITECTURE.md`.
- Tests: `test/imports.test.js`, plus publication checks in `test/privacy.test.js` and `test/verify-publication.test.js`.

## Current Import Contract

- Public source key: `valorgrid-xlsx`.
- Parser library: `exceljs`.
- Accepted file type: modern `.xlsx` workbook, provided as base64 content in API calls.
- Maximum workbook size: 2 MB.
- Allowed sheets: `Movimientos`, `Instrucciones`, `Ejemplos`.
- Imported sheet: only `Movimientos`.
- Required headers, in exact order: `Tipo`, `Fecha`, `Ticker`, `Acciones`, `Precio`, `Divisa`, `FX a EUR`, `Valor EUR`, `Comision EUR`, `Referencia`.
- Formulas are rejected.
- Community row limit: 500 movement rows.
- Legacy generic sources are rejected with a message that points users to the official template.

## Financial Semantics

- `Tipo` accepts buy/sell aliases; when empty, infer buy/sell from the sign of `Acciones`.
- `Acciones` is normalized to an absolute share count after type inference.
- `Precio` must be non-negative; a zero-price buy is treated as a special valid case with a minimum internal price and a warning.
- `Divisa` defaults to `EUR`; non-EUR movements require explicit `FX a EUR`.
- ValorGrid does not look up FX automatically during import.
- `Valor EUR` is optional; when absent, compute it as `abs(Acciones) * Precio * FX a EUR`.
- `Comision EUR` is optional and stored as an absolute EUR cost.
- `Referencia` participates in external identity and dedupe; blank references still get row-hash based identities.

## Workflow

1. Preview first. Preview must be read-only and return rows, detected instruments, selected sheet, summary, warnings, and commit eligibility.
2. Validate rows before commit: headers, dates, symbols, shares, prices, currency, FX, `Valor EUR`, duplicate hashes, and sale feasibility.
3. Commit only selected valid rows. Commit must be atomic and must create import batch/row records consistently with ledger transactions.
4. Invalidate portfolio history from the first committed import date forward.
5. Rollback must remove imported transactions and allow the same file to be imported again when the previous batch was rolled back.

## Debug Checklist

- Reproduce with `node --test test/imports.test.js` before changing code.
- Check whether the failure is parser validation, preview reconciliation, commit persistence, sale rules, dedupe, rollback, or UI payload construction.
- Inspect the normalized row shape before changing financial behavior.
- If changing endpoint behavior, update `docs/API.md`.
- If changing schema tables/columns, update `docs/DATA_MODEL.md`.
- If adding/removing modules, update `docs/ARCHITECTURE.md`.
- If changing parser controls or user-facing import behavior, update `docs/IMPORT_EXCEL.md`.
- Run `npm.cmd run verify:publication` after touching import-source text, docs, skills, or publication guards.

## Checks

Run the narrow import checks first, then the publication gate:

```text
node --test test/imports.test.js
npm.cmd run format:check
npm.cmd run lint
npm.cmd run changelog:check
npm.cmd test
npm.cmd run verify:publication
```
