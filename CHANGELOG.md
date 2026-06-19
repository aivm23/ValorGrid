# Changelog

## 3.21.0 (2026-06-19)

- feat: add `commodity` instrument type with automatic Alpha Vantage pricing
- feat: add migration SQL for existing databases (deploy/sql/update-3.20.0-to-3.21.0.sql)
- feat: add instrument price-source configuration with Yahoo as the default provider
- fix: Alpha Vantage gold/silver now uses correct GOLD_SILVER_HISTORY/SPOT endpoints instead of FX_DAILY
- fix: provider selection is now automatic based on type (Yahoo for ETF/Stock/Crypto, Alpha Vantage for Commodity)
- fix: form restructured — type selector is first, conditional commodity dropdown
- fix: Alpha Vantage GOLD_SILVER_HISTORY fetches last 30 days to handle stale data

## 3.20.0

- feat: make read-only portfolio views resilient to Yahoo Finance failures by using local stale prices when available.
- feat: expose market-data quality metadata in portfolio summary and stale quote responses.
- fix: keep transaction writes strict when market prices or FX are unavailable; manual non-EUR prices can provide explicit `fxToEur`.
- fix: preserve manual `shares + unitPrice` payloads in the transaction form even when euros are auto-filled visually.

## 3.19.1

- fix: correct Spanish orthography across all frontend UI — accents, verb conjugations, and removed invented word "retiraciones" (replaced with "retiradas").
- fix: improve import parser error messages — sheet mismatch now guides user to select the correct importer source.
- feat: add tooltip descriptions to import source selector dropdown for each broker/template option.
- chore: add `valorgrid-spanish-orthography` skill to prevent future accent and spelling regressions.

## 3.19.0

- feat: add `pro-xlsx` adapter path for broker XLSX imports — `clicktrade-xlsx` registered as XLSX input source with `inputKind: 'xlsx'`.
- feat: extend ingestion parser with `pro-xlsx` branch that passes `contentBase64` to PRO adapter `parse()` function.
- feat: expose `inputKind` in `/api/import/sources` response for frontend file type detection.
- feat: frontend import helpers recognize `clicktrade-xlsx` as XLSX source — accepts `.xlsx` files, sends base64 payload, no template download.
- feat: merge ClickTrade into main Professional Edition banner (removes "Próximamente" teaser).

## 3.18.1

- fix: restore instrument-repository.js (corrupted in 3e195a5), extract group service, reorganize modal UI.

## 3.18.0

- feat: add automatic corporate brand palette for groups and instruments (cyan-to-violet bisection).
- feat: add `PUT /api/instruments/brand-palette` endpoint with snapshot/restore of manual colors.
- feat: block color inputs when brand palette is active; restore previous colors on deactivation.
- feat: add brand palette preview and toggle to Valores dialog with live UI locking.

## 3.17.0

- feat: make instrument groups optional via "Usar grupos de valores" toggle in Valores.
- feat: add `PUT /api/instrument-groups/settings` endpoint to enable/disable groups.
- feat: when groups are disabled, dashboard shows instruments directly without group aggregation.
- feat: when groups are disabled, imports create instruments without group assignment.
- feat: wizard supports `useGroup` flag — group creation is now optional.
- feat: when groups are reactivated, ungrouped instruments are auto-assigned to `grupo-cero`.
- feat: add `groupsEnabled` field to `/api/portfolio/summary` and `/api/onboarding/status`.
- feat: add `deploy/sql/update-3.16.0-to-3.17.0.sql` to persist the setting in `app_meta`.
- test: add 12 integration tests for instrument groups settings.
- docs: update API.md, DATA_MODEL.md, FINANCIAL_SEMANTICS.md, DB_OPERATIONS.md, TESTING.md.

## 3.16.2

- docs: add `app.js` to frontend module list in ARCHITECTURE.md; remove orphan artifact.
- docs: add `backup-delete.test.js` to TESTING.md.
- docs: fix stale `client/` references → `apps/web/src/` and path prefixes in AI_TOOLING.md.
- docs: fix backup path in FAQ.md (`.backups/` → `local/valorgrid/backups/`).
- docs: fix CasaOS `latest` → versioned tag in ROADMAP.md.
- docs: fix `verify-publication.ps1` → `.js` and section title in DB_OPERATIONS.md.
- docs: fix path prefixes in FINANCIAL_SEMANTICS.md (`src/` → `apps/server/src/`).
- docs: document FK constraint on `import_rows.batch_id` in DATA_MODEL.md.
- refactor: remove dead SQL fallback branch in `ui-preferences-service.js`.

## 3.16.1

- fix: correct Spanish spelling of "histórico" across UI and docs.

## 3.16.0

- feat: add `crypto` as a first-class instrument type.
- feat: add manual SQL update `deploy/sql/update-3.15.0-to-3.16.0.sql` to preserve existing SQLite databases.
- fix: send manual unit price from the transaction form so weekend/manual-price operations do not require market quotes.
- docs: document versioned SQL updates and updated DB operations policy.

## 3.15.0

- feat: include Yahoo ticker (yahoo_symbol) in transactions XLSX export.

## 3.14.0

- docs: enforce versioned image tag for CasaOS and add push validation rules.

## 3.13.0

- fix: restore collapsible behavior in pro-preferences for community edition.
- feat: refactor pro-preferences panel to fixed layout in PRO edition.

## 3.12.2

- style: refine import-pro-banner styling, colors, and layout adjustments.

## 3.12.1

- feat: restore Pro import banners in Community edition import dialog.
- style: replace inline badges with structured banner containers (.import-pro-banner-brokers, .import-pro-banner-clicktrade) using corporate cyan accent and pro-edition-label gradient.
- fix: verify-publication.ps1 now exempts import-workflow.js from broker teaser patterns (Windows CI compatibility).

## 3.12.0

- feat: reactivate automatic risk backups before high-risk operations (import commit, import rollback, bulk transaction delete, instrument delete, group delete, auto-plans replace).
- feat: frontend now displays automatic backup confirmation messages after risky operations.
- feat: add automatic risk backup before import commit endpoint.
- feat: risk backup threshold for instrument delete set to >5 symbols and group delete set to >2 ids.
- breaking: remove restoreBackup function from backup module — app, API, UI, and documentation no longer reference restoring SQLite from backups.
- breaking: remove POST /api/backups/:file/restore endpoint.
- breaking: remove restoreBackup from route-service-bindings.js.
- breaking: remove all commented restore code from backend routes and frontend.
- breaking: remove restore button CSS (.restore-btn) from styles.css.
- breaking: remove commented restore tests from portfolio.test.js.
- docs: remove restore references from API.md, DB_OPERATIONS.md, DEPLOY_DOCKER.md, FAQ.md, GITHUB_RELEASE.md.
- docs: keep automatic retention of 6 most recent backups in all documentation.

## 3.11.1

- fix: import commit no falla por `createRiskBackup is not a function` al deshabilitar backups automáticos de riesgo.
- fix: corregir detección de extensión de archivo en validación de importación — el regex `match()` sin grupo de captura usa índice `[0]` en lugar de `[1]`.
- chore: disable backup restore buttons and auto-backup messages in frontend.
- fix: CI cross-platform compatibility for PowerShell publication check and WAL checkpoint.

## 3.10.0

- feat: add automatic risk backups before high-risk operations (import commit, import rollback, bulk transaction delete, instrument delete, group delete, auto-plans replace).
- feat: add backup deletion endpoint and UI button.
- feat: unify backup and import batch UI layouts with card-style rows.
- feat: show non-blocking info messages before risky operations and backup creation confirmations after success.
- feat: add bulk DELETE /api/transactions endpoint with single risk backup for entire batch.
- feat: add import commit backup info message and import rollback backup confirmation.
- feat: add instrument and group delete risk backup support.
- feat: add auto-plans replace risk backup support.
- feat: add backup delete handler and CSS styling.
- feat: add retention literal (6 backups) in backup section.
- feat: add import confirm step backup notice with SVG icon.
- feat: upgrade from 3.9.4 to 3.10.0 minor version bump.
- test: add backup API tests for create, list, download, and restore.
- test: fix KPI border classes assertion for position-based colors.
- fix: use position-based border colors for Operativa cards and refactor renderMetricContent.
- fix: replace splice with direct assignment in operation metric preference change.
- chore: fix Prettier CLI formatting for YAML and issue templates.
- chore: update package-lock.json for husky and lint-staged.
- ci: unify checks across platforms and add pre-commit hooks.

## 3.9.4

- docs: audit and sync documentation — replace fragile line counts in TESTING.md with stable file/domain/coverage matrix, add missing tests (auth, storage, verify-publication), fix CI description to match actual matrix (windows + ubuntu, Node 24, verify:publication, seed:demo), remove obsolete `node --check app.js` reference.
- docs: add `src/shared/` and `client/history-preferences.js` to ARCHITECTURE.md module inventory, remove fragile "9 lines" claim for server.js, adjust migration text to clarify not all domains have own routes.
- docs: add `npm run seed:demo` to GITHUB_RELEASE.md local preparation steps, fix "Documentación de usuario" header capitalization.
- chore: bump version 3.9.3 -> 3.9.4 (patch) in package.json, package-lock.json, compose.casaos.yml.

## 3.9.3

- feat: history event filter preferences — extend `ui_preferences` with `historyEventFilters` (mode, assetTypes, transactionTypes).
- feat: add `instrumentType` to history events via LEFT JOIN instruments in portfolio history API.
- feat: filter history event markers in frontend — derive `visibleEvents` from `historyEventFilters` without reloading data.
- feat: add Professional Edition history settings controls in Admin preferences with PRO banner for Community.
- feat: unify Pro preferences into collapsible card with expand/collapse animation.
- feat: global `.pro-edition-label` CSS class — all "Professional Edition" text uses corporate gradient + italic.
- feat: CSS variables `--radius-full`, `--gradient-pro`, `--gradient-pro-text` — eliminate duplicated values.
- feat: merge `.operations-pro-banner` and `.history-pro-banner` into shared CSS rules.
- test: add integration tests for preferences API validation, legacy tolerance, corrupt JSON, and instrumentType in history events.
- docs: update API.md, DATA_MODEL.md, ARCHITECTURE.md, EDITIONS.md with history event filter preferences.

## 3.9.0

- feat: manual unit price in transaction form — when the user enters "Precio / acción + Acciones", the manual price is now the accounting source for valueEur instead of being silently discarded and replaced by market price.
- feat: show "Precio manual" indicator in transaction preview when unit price is used.
- feat: support non-EUR instruments with manual unit price — FX conversion is applied correctly.
- refactor: extract auto-plan date calculation logic into `auto-plan-date-service` to keep `transaction-service` under 500 lines.
- fix: transaction form no longer discards the user-entered unit price; preview and save produce identical numbers.
- test: add integration tests for manual unit price (EUR, non-EUR, validation edge cases).
- docs: update API.md, FINANCIAL_SEMANTICS.md and ARCHITECTURE.md with manual unit price semantics and new module.

## 3.8.2

- style: remove underline from toolbar anchor buttons.
- refactor: replace export dropdown with direct download link.
- chore: remove backup button from toolbar export menu.
- feat: add date format and calendar start day settings with redesigned admin panel.
- feat: improve Operativa section microcopy, tooltips and open investment percentage.
- fix: harden auth guard activation and HTTP error handling.
- style: community and professional edition labels in corporate colors.
- chore: update changelog and CasaOS metadata for v3.7.13.
- docs: fix Spanish accents and mojibake across documentation - Correct encoding artifacts and missing tildes in Spanish docs and README.
- feat: add Spanish documentation spellcheck gate - Add check-spanish-docs.js that validates Spanish docs for mojibake, missing accents, and common spelling mistakes.
- docs: clarify auth.js is imported by http.js, not loaded directly in app.js.
- docs: update README with Basic Auth and new port 1325.

## 3.8.1

- chore: remove backup button from toolbar export menu.

## 3.8.0

- feat: add date format (dd/mm/yyyy vs mm/dd/yyyy) and calendar start day (Monday vs Sunday) settings in Admin preferences with dd/mm/yyyy and Monday as defaults.

## 3.7.15

- feat: improve Operativa section microcopy and add info tooltips for Aportado neto, Resultado total, and Plusvalía latente cards with clearer context about total ledger scope and open investment percentage.

## 3.7.14

- fix: auth guard activates on password presence instead of `config.enabled`, and HTTP server wraps `new URL()` in try/catch while hiding internal error messages.

## 3.7.13

- test: add a Spanish documentation spellcheck gate for mojibake and common accent mistakes.

## 3.7.12

- chore: allow the CasaOS compose app to track the latest GHCR image while keeping port and metadata checks.

## 3.7.11

- chore: change the default local, Docker and CasaOS web port from 5173 to 1325.

## 3.7.10

- feat: add opt-in single-user Basic Auth for CasaOS and other internet-facing Docker deployments.

## 3.7.9

- fix: date inputs render in `es-ES` locale (`lang="es"`) so the calendar shows DD/MM/YYYY and starts on Monday.

## 3.7.8

- fix: make DB maintenance scripts use the same configured backup directory as the app.
- refactor: remove the old import repository namespace and route backup APIs through grouped admin services.

## 3.7.7

- fix: transaction form distinguishes user-entered euros from auto-calculated euros so the `euros OR shares` XOR constraint works correctly when both fields are populated.

## 3.7.6

- fix: history chart buy dots always render green (`#16a34a`) instead of the asset's custom color.

## 3.7.5

- fix: ci rename `test:linux` to `test-linux` because GitHub Actions rejects colons in job IDs (the `ubuntu-latest` job silently failed to register and produced 0 jobs).

## 3.7.4

- refactor: replace PowerShell wrappers for `db:backup`, `db:doctor`, `db:reset` and `verify:publication` with cross-platform Node entrypoints. The Windows `.ps1` files remain as native shortcuts; the `desktop:dist:win:clean` and Windows installer flow stay PowerShell-only.
- feat: add `scripts/verify-publication.js` covering portable checks (syntax, tests, gitignore, dockerignore, forbidden text, ALTER TABLE scan, canonical `seed:demo`).
- chore: remove the broken Codex `/save` command while keeping the OpenCode `save` workflow.
- docs: split import-debug guidance so Community only documents `valorgrid-xlsx`; professional broker import debugging moves to the private PRO skill.
- test: scan tracked OpenCode/agent files in publication and privacy checks even when their directories are ignored locally.
- test: add `test/verify-publication.test.js` and an architecture invariant that blocks PowerShell in `npm run` scripts outside `desktop:*`.
- ci: add `test-linux` job on `ubuntu-latest` to the CI matrix alongside the existing `windows-latest` job.
- docs: add a Linux/macOS development subsection to the README and neutralize `powershell` fences for cross-platform commands; Windows-specific flows (installer, SmartScreen, `Get-FileHash`, `desktop:dist:win:clean`) remain in `powershell`.

## 3.7.3

- fix: replace vulnerable xlsx parser with exceljs.
- Fix Windows desktop shortcut and installer branding by using the ValorGrid icon in NSIS assets and shortcut creation.

## 3.7.2

- chore: automate changelog update and check commands.

## 3.7.1

- feat: auto-calculate euros from shares x price, disable shares/price when euros filled, reorder fields.

## 3.7.0

- feat: add unit price field to operation form, rename add/remove labels to buy/sell in UI.

## 3.5.8

- style: attach refresh icon inline to price status text.

## 3.5.7

- style: compact icon-only refresh button next to price status.

## 3.5.6

- style: move add/remove buttons to ledger panel, redesign refresh button with accent icon and spin animation.

## 3.5.5

- Rework the public README as a hybrid product and technical entry point focused on Windows download, privacy and screenshots.
- Add non-technical user documentation for first steps, Excel import, FAQ, legal notice and roadmap.
- Update release notes generation with clearer Windows, checksum, privacy and legal messaging.

## 3.5.4

- Fix packaged desktop startup by keeping backups outside `app.asar` when the DB path is explicit.
- Add the ValorGrid logo to Windows desktop builds and remove the native Electron menu bar.

## 3.5.3

- Add a local PowerShell script to clean `dist`, rebuild the Windows installer and regenerate release checksums.

## 3.5.2

- fix: correct GitHub Issues URL in boot error overlay to aivm23/ValorGrid.

## 3.5.1

- Fix Windows release builds by disabling electron-builder implicit publishing on git tags.

## 3.5.0

- Add the first Windows desktop distribution path with Electron and an NSIS installer.
- Add GitHub Release automation for Windows installer artifacts, SHA-256 checksums and provenance attestation.
- Add release documentation covering changelog, upgrade, rollback, checksums and Docker image coordination.
- Keep ValorGrid Community local-first and unauthenticated in this release; login is intentionally out of scope.
