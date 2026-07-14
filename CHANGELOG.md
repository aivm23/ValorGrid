# Changelog

## 3.32.8

- fix: apply automatic splits and reverse splits only for supported `1:N` or `N:1` ratios that produce an integer position.
- fix: ignore corporate actions and dividends when no position existed on the event date while preserving valid historical events for positions closed later.
- fix: reconcile exact broker technical pairs against Yahoo split events without creating ledger purchases or sales.
- fix: recover safely when `transactions.note` exists but `schema_version` metadata is stale.
- test: cover GOOG `1:20`, reverse splits, unsupported ratios, closed positions, post-sale dividends and near-match import pairs.

## 3.32.7

- fix: count all served web resources, including split nested stylesheets, in the reproducible performance baseline.
- fix: refresh compatible desktop tooling transitives to remove reported `form-data` and `undici` vulnerabilities.
- perf: report the first cold request separately from warmed median and p95 measurements for every benchmarked endpoint.
- test: cover recursive static-resource accounting and cold/warm endpoint sampling.

## 3.32.6

- refactor: make the Operativa metric ID catalog canonical in `packages/contracts` with synchronized CommonJS and browser ESM adapters.
- chore: add `contracts:sync` and a blocking `contracts:check` to the standard quality gate.
- test: verify catalog parity, uniqueness and default metric membership across module formats.

## 3.32.5

- refactor: make HTTP route dependencies resolve strictly from grouped services instead of flat `ctx` fallbacks.
- refactor: register transaction and instrument APIs directly in their domain service namespaces while retaining temporary flat compatibility aliases.
- refactor: centralize the portfolio output mapper and equivalent repository date-range filters.
- test: enforce strict grouped route bindings and direct registration for refactored domains.

## 3.32.4

- refactor: split the monolithic stylesheet into six ordered cascade files while preserving the previous effective order.
- fix: prevent the provider-status tooltip from causing horizontal viewport overflow on mobile.
- feat: give every dialog valid accessible title/description relationships, deterministic Escape handling and focus restoration.
- test: add static accessibility checks for unique IDs, ARIA references, button names and inline events, plus a CSS split gate.

## 3.32.3

- refactor: route every frontend HTTP operation through explicit domain API adapters so features no longer own URLs, verbs or timeouts.
- refactor: introduce dashboard, transactions, instruments, imports, history, preferences and UI state slices with a temporary compatibility bridge.
- refactor: add required and optional DOM query guards for early startup failures on incomplete core markup.
- test: enforce frontend API ownership and the sliced state contract in architecture tests.

## 3.32.2

- chore: extend the Prettier gate to all application, script and test sources and establish an informative clone audit.
- refactor: extract focused market-data, portfolio, transaction, import, form and renderer collaborators before applying the mechanical formatting baseline.
- perf: add a reproducible local benchmark over the canonical synthetic dataset with median, p95, memory and static-resource measurements.
- docs: document the extracted module boundaries and the quality and performance verification commands.

## 3.32.1

- fix: make manual, reset and risk backups verify SQLite integrity before they are accepted.
- fix: restore automatic verified backups before `db:reset` deletes an existing database.
- docs: reconcile reset and migration policy and remove private extension mechanics from Community documentation.
- refactor: remove the unused backend operations metrics catalog and reuse canonical DB maintenance helpers from CLI scripts.
- test: cover safe reset aborts, verified backups and the Community documentation boundary.

## 3.32.0

- feat: add optional notes to buy and sell transactions, including an accessible ledger indicator.
- feat: allow a selected buy or sell transaction to be previewed and corrected without repricing from market data.
- fix: protect transaction corrections with automatic backups and full position-history validation.
- docs: document transaction notes and correction API semantics.
- test: cover transaction note storage, editing and invalid future-sale protection.

## 3.31.4

- test: add two current-balance liquidity accounts to the canonical demo/loadtest dataset without creating ledger movements.

## 3.31.3

- test: seed all stock purchases and sales in the canonical demo/loadtest dataset with whole-share quantities while keeping fractional coverage for ETFs, commodities and crypto.

## 3.31.2

- test: seed the canonical demo/loadtest dataset with Alphabet (GOOG)'s 20-for-1 split effective on 2022-07-18, including split-aware subsequent simulated sales and history coverage.

## 3.31.1

- fix: hide the "Solicitar Professional Edition" admin card when the running edition is already Professional, via `syncProPreferencesPanel`, avoiding the brief flash and DOM coupling of PRO-side overrides.
- test: guard `syncProPreferencesPanel` Pro request card visibility by edition.

## 3.31.0

- feat: add automatic Yahoo Finance stock/ETF split and reverse-split detection as corporate actions outside the ledger.
- feat: recalculate position shares, sale validation, import previews, FIFO metrics and materialized history with split-adjusted quantities from the effective date.
- feat: show split markers as informational history events without adding transactions, cash-flow, dividends or price-cache rescaling.
- docs: document corporate actions API, data model, financial semantics and architecture load order.
- test: cover split idempotency, reverse splits, FIFO cost basis and materialized history quantities.

## 3.30.0

- feat: add in-app update checker in Administration with GitHub Releases integration, semver comparison, runtime detection (desktop/docker/server) and recommended asset selection per platform/arch.
- feat: add `GET /api/update/status` and `GET /api/update/docker-commands` endpoints for update status and Docker upgrade commands.
- feat: add automatic database migration system with `schema_version` tracking, backup-before-migrate, integrity checks and inference of existing schema version from known columns.
- feat: add update card in Administration showing current/latest version, DB status, last check, download button (desktop) or Docker commands (server/docker).
- feat: add Solicitar Professional Edition button in Administration linking to https://valorgrid.app/pro/.
- feat: desktop auto-migrates on startup with backup; Docker shows pending migrations and commands by default (enable with `VALORGRID_AUTO_MIGRATE=1`).
- feat: add i18n keys for update and Professional Edition sections in ES/EN catalogs.
- docs: document update endpoints, migration system, Docker update flow and Professional Edition link across API, ARCHITECTURE, DB_OPERATIONS, GITHUB_RELEASE, DEPLOY_DOCKER, FIRST_STEPS and READMEs.

## 3.29.0

- feat: add liquidity accounts backed by cash-type instruments with current balance tracking.
- feat: add ledger export dialog with symbol, type, origin and date range filters.
- feat: add market data provider availability indicator next to price refresh button showing aggregated Yahoo Finance and Alpha Vantage status.
- fix: register Yahoo Finance provider state (ok/error) on every quote attempt, matching Alpha Vantage behaviour.
- fix: replace browser-native confirmation dialogs with ValorGrid's shared modal for backups, imports, groups and liquidity deletes.
- fix: restore the instrument dialog config header background without the left border.
- fix: align the general preferences section into the intended 3-column layout.
- fix: use canonical donut item identity to avoid groupId collisions in detail-chart hover.
- docs: document the reusable frontend confirmation modal in the architecture guide.
- test: guard against native browser confirm, alert and prompt dialogs in frontend code.

## 3.28.16

- fix: keep only the save action per Liquidity row and move deletion to the bulk-selection toolbar.
- fix: prevent the Liquidity save button from being compressed in the row actions column.
- test: guard Liquidity rows against per-row delete actions.

## 3.28.15

- fix: align the Liquidity table with the selection and bulk-delete pattern used by Instruments.
- fix: show the technical liquidity identifier as the first fixed column and keep the account name editable.
- fix: remove the blue background from the Liquidity panel while keeping the section accent.
- test: guard the neutral Liquidity panel background.

## 3.28.14

- fix: render liquidity accounts with the same editable-table pattern used by Instruments.
- fix: reuse the standard checkbox styling for Liquidity dashboard visibility.
- fix: prevent an expanded group card from stretching sibling cards and realign display options.
- test: cover Liquidity table markup and group-card visual alignment.

## 3.28.13

- feat: wire Liquidity creation into frontend startup and the local `/api/liquidity` API.
- fix: sync fresh schema and versioned SQL migration for technical `cash` instruments.
- fix: keep liquidity out of normal instrument lists, operation selectors and import matching.
- docs: document the Liquidity API, data model and financial semantics.
- test: cover Liquidity account creation and current-summary inclusion without ledger movements.

## 3.28.12

- fix: reorder the Values and groups dialog into separate Groups, Liquidity and Instruments rows.
- fix: apply the shared modal form styling to Liquidity controls.

## 3.28.11

- fix: allow `buildLedgerExportUrl` to export without filters instead of throwing on `undefined`.

## 3.28.10

- feat: support optional ledger export filters (`symbol`, `origin`, `type`, `from`, `to`) in `GET /api/export/transactions.xlsx`.
- feat: add the Export button to the Movements section with a confirmation dialog and heavy-export warning.
- refactor: share ledger filter helpers between rendering and export URL generation.
- refactor: make `buildTransactionsXlsx` accept the same optional filter semantics as the frontend.

## 3.28.9

- fix: reduce release workflow storage pressure by expiring temporary desktop artifacts after one day.
- fix: add a scheduled/manual GitHub Actions artifact cleanup workflow for quota recovery.
- test: guard release workflow artifact retention and cleanup policy.

## 3.28.8

- fix: translate the static history range controls in English mode.
- test: guard history range buttons with explicit i18n bindings.

## 3.28.7

- fix: translate the pending dividends modal subtitle and remaining dividend draft labels in English mode.
- test: guard dividend modal i18n coverage for FX and total labels.

## 3.28.6

- fix: translate the Community contributions modal static and recurring-plan copy in English mode.
- fix: localize recurring contribution frequency, weekday, feedback and date-input language handling.
- test: guard recurring contribution i18n wiring in frontend coverage.

## 3.28.5

- fix: translate remaining tooltip, Professional Edition teaser and import workflow copy in English mode.
- fix: route import source options, detected-format labels, sheet selector, rollback messages and row decisions through i18n.
- test: extend frontend i18n coverage for import workflow and translated modal copy.

## 3.28.4

- fix: translate remaining modal, ledger, import, instrument/group and dividend copy in English mode.
- fix: apply active language metadata and placeholders to date inputs when switching languages.
- test: guard modal i18n coverage for operation, import, delete and dividend flows.

## 3.28.3

- fix: move YTD, ledger, import, backup and operation-dialog copy through frontend i18n keys.
- fix: translate responsive table labels and explicit static HTML bindings in English mode.
- test: cover residual frontend i18n boundaries for generated dashboard copy.

## 3.28.2

- fix: corrected donut detail chart hover when multiple instruments share the same groupId by using canonical identity per item type.
- fix: route dashboard, allocation and history dynamic copy through i18n keys to avoid Spanish UI leftovers in English mode.

## 3.28.1

- fix: corrected donut chart hover highlighting when two or more expandable groups share the same STOCK symbol identity.
- fix: group donut segments now use their own color instead of the STOCK asset color.

## 3.28.0

- feat: add Spanish/English UI language infrastructure with persistent preference, localized formatters and extension dictionary registration.
- feat: localize Community Professional Edition API gates through `Accept-Language`.
- docs: add English README and public documentation mirror under `docs/en`.
- test: cover i18n wiring, locale formatting guards and bilingual API gate behavior.

## 3.27.4

- chore: relicense ValorGrid Community future releases under MPL-2.0.
- docs: add copyright, trademark, contribution, third-party notice and legal-disclaimer separation.
- test: guard release metadata against MIT license regressions.

## 3.27.3

- feat: add explicit transaction entry mode tabs for market EUR, manual total EUR and manual unit price workflows.
- feat: support `manual_total_eur` transaction payloads that register executions in EUR without market-data lookup.
- fix: simplify manual sales to shares plus gross EUR amount and reject explicit market-based sell entries.
- docs: document transaction entry modes and operation-form architecture.
- test: cover explicit entry modes in backend and frontend checks.

## 3.27.1

- fix: use generic quantity labels in mixed movement UI and contextual units for stock, ETF, crypto and commodity quantities.
- docs: clarify that `shares` is the instrument quantity while the Excel template keeps the `Acciones` header for compatibility.
- test: cover quantity unit labels by instrument type.

## 3.27.0

- feat: detect Yahoo Finance dividend events in the background and create reviewable dividend drafts.
- feat: confirm dividend drafts into ledger movements with `Compra`, `Venta` and `Dividendo` separated in Movimientos.
- feat: add per-instrument automatic dividend inclusion after user validation, with split notices kept as manual review.
- docs: document dividend data model, API, financial semantics and SQL migration flow.
- test: cover dividend drafts, confirmation, auto-inclusion, manual-entry blocking and frontend review UI.

## 3.26.1

- fix: prevent weekend/holiday crypto-only rebuilds from zeroing stock and ETF positions by seeding the last available price before the rebuild start date.
- fix: carry forward stale FX rates for non-EUR instruments when rebuilding history from a non-trading day.
- test: add regression tests for weekend crypto not zeroing stock positions and FX carry-forward.

## 3.26.0

- feat: add an independent Umbrel package and community store template for self-hosted distribution.
- chore: add Umbrel package synchronization and publication safety checks.
- docs: document the Umbrel packaging, testing and official submission workflow.

## 3.25.1

- refactor: expose a neutral Professional Edition dashboard layout preference anchor while keeping Community dashboard behavior fixed.

## 3.25.0

- feat: Alpha Vantage key management with local secrets persistence (secrets.json).
- fix: harden secrets.json against data leakage — block static serving, add to gitignore/dockerignore, sanitize 500 errors, add 1MB body limit.
- test: POSIX permissions, security architecture, and Alpha Vantage key tests.
- docs: sync Alpha Vantage secrets, deploy, and API documentation.
- chore: update screenshots and Docker compose sync.

## 3.24.4

- feat: allow Docker and CasaOS users to save the Alpha Vantage key from the existing setup assistant without restarting the container.
- docs: document Alpha Vantage setup paths for desktop, Docker and CasaOS.

## 3.24.3

- fix: desktop release stable artifact naming uses correct electron-builder pattern per platform (Linux AppImage/deb no longer require arch in filename).

## 3.24.2

- style: refine the admin preferences layout and Professional Edition label placement.
- test: align the canonical demo dataset checks with the commodity demo portfolio.

## 3.24.1

- refactor: keep active Professional Edition preference styles private while preserving Community teaser layout.

## 3.24.0

- feat: add Linux AppImage/deb and unsigned macOS DMG desktop release builds alongside the Windows installer.
- ci: split desktop release packaging by OS, publish stable artifact names, and checksum all desktop installers.
- test: cover desktop release scripts, electron-builder targets, stable artifact naming and release workflow wiring.

## 3.23.1

- fix: Docker build failing because prepare script calls husky which is stripped by \`--omit=dev\` — added \`--ignore-scripts\` to npm ci.

## 3.23.0

- release: promote the Community/PRO return breakdown boundary to a minor release version.

## 3.22.12

- feat: add Community teaser and blocked API surface for advanced return breakdown.

## 3.22.11

- refactor: keep Community history markers unfiltered while preserving the Professional Edition teaser surface for private extensions.

## 3.22.10

- refactor: keep Community Operativa summaries fixed while preserving the Professional Edition teaser surface for private extensions.

## 3.22.9

- feat: allow private extensions to register professional import adapters through the data ingestion boundary while keeping Community import implementation public-only.

## 3.22.8

- fix: pass the configured extension path into the server composition root so private extensions load before `/api/extensions` is served.

## 3.22.7

- feat: add a neutral extension host and `/api/extensions` manifest so private editions can attach server routes and web assets without shipping premium code in Community.

## 3.22.6

- fix: Dockerfile now runs `npm ci --omit=dev` and uses separate COPY layers for package manifests, resolving "Cannot find module 'dotenv'" crash and enabling Docker build cache reuse.

## 3.22.5

- Release workflow now publishes a stable-name installer (ValorGrid-Setup-x64.exe) alongside the versioned one, enabling direct download links from the landing page.

## 3.22.4

- docs: updated FIRST_STEPS.md guide with current UI screenshots and detailed import wizard walkthrough

## 3.22.3

- fix: backup list now uses a two-row layout — filename on top, size and action buttons below — so long names don't push buttons around

## 3.22.2

- fix: purchase form now shows a clear message when online price data is unavailable, prompting the user to enter unit price and quantity manually

## 3.22.1

- fix: backup list button alignment — buttons now stay right-aligned regardless of filename length

## 3.22.0

- feat: desktop secrets management — Alpha Vantage key stored in `secrets.json` alongside backups under Electron userData, read at startup and injected as `VALORGRID_ALPHA_VANTAGE_API_KEY`
- feat: add `GET /api/market-data/alpha-vantage/status` — returns configured status, runtime mode (desktop/server), and actionable hints
- feat: add `POST /api/market-data/alpha-vantage/key` — validates key with real Alpha Vantage call before saving; only available in desktop mode
- feat: add `DELETE /api/market-data/alpha-vantage/key` — removes saved key; only available in desktop mode
- feat: non-technical Alpha Vantage setup assistant in Windows Desktop — three-step wizard with "Get free key" button, paste field, and automatic validation
- feat: commodity creation flow checks Alpha Vantage status and opens the assistant if not configured; ETF/Stock/Crypto flows are unaffected
- feat: add `apps/server/src/platform/runtime-secrets.js` — shared singleton for reading/saving/deleting secrets alongside the backup directory
- docs: update `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/CREATE_INSTRUMENTS.md`

## 3.21.0

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
