# Changelog

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
