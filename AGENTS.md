# AGENTS.md

## Commands

- `npm test` — run all tests (`node --test`)
- `npm run lint` — run ESLint flat conf
- `scripts/run-sql-migration.ps1` automatiza el flujo (backup automático + ejecución SQL + verificación de integridad). Usar `-DryRun` para simular sin modificar la DB.ig checks
- `npm run format:check` — run Prettier checks for docs/workflows/package manifests
- `npm run docs:spellcheck` — check Spanish docs for mojibake and common accent mistakes
- `npm run typecheck` — run TypeScript type checking (`tsc --noEmit`)
- `npm run check` — run lint + format check + Spanish docs spellcheck + changelog check + tests
- `npm run changelog:check` — verify CHANGELOG.md contains current version section
- `npm run changelog:update` — auto-generate or update CHANGELOG.md entry for current version
- `node --test --test-name-pattern "test name" test/portfolio.test.js` — run a single test
- `npm start` — start server (`node apps/server/server.js`)
- `npm run db:backup` — create a local SQLite backup using active DB path resolution
- `npm run db:reset` — backup + fresh reset of the active SQLite DB
- `npm run db:doctor` — inspect active DB health, schema, WAL/SHM and backups
- `npm run seed:demo` — seed canonical synthetic demo dataset
- `npm run verify:publication` — check no private data leaks before publishing
- `npm run audit:ai` — check opencode commands/skills for outdated paths
- `npm run audit:packages` — check no cross-boundary imports between workspaces
- `npm run audit:artifacts` — list large local artifacts (read-only)
- `npm run audit:deps` — check dependency placement + npm audit
- `npm run audit:release` — full pre-release audit (check + publication + release surface)
- `npm run audit:local` — quick local audit (ai + packages + artifacts)
- Current baseline keeps runtime simple (CommonJS + Node test runner).
- Typecheck/build are introduced incrementally by migration phase, never as a big-bang rewrite.

## Versioning

- `package.json` is the single source of truth for the application version.
- **Every functional, technical, or UI change must bump the version before finishing.** The agent must evaluate and apply the appropriate bump:
  - **patch** (x.y.Z): small fixes, minor adjustments, bug fixes that don't change behavior significantly
  - **minor** (x.Y.0): new features, meaningful improvements, new functionality that's backward compatible
  - **major** (X.0.0): breaking changes, incompatible API changes, major refactors that change how the app works
- When the version changes, include it in the same commit as the feature/fix.
- When the version changes, update `CHANGELOG.md` con la nueva version antes de commitear, o ejecutar `npm run changelog:update` para auto-generarlo desde el historial reciente de git.
- Ademas de `package.json` y `CHANGELOG.md`, **sincronizar `deploy/docker/compose.casaos.yml`**: actualizar `x-casaos.version` y el tag de `image` al mismo numero de version.
- `npm run changelog:check` is part of the pre-push pipeline; commits with version bumps will fail CI if the changelog is not updated.
- During this migration, each completed phase with real repository changes bumps at least a patch version.

## Architecture

- **Node.js ≥ 24**, CommonJS, vanilla JS frontend, SQLite via `node:sqlite`
- **Composition root + staged DI**: `apps/server/src/app.js` creates `ctx` and loads backend modules in strict sequence with `require(modulePath)(ctx)`.
- **Current compatibility rule**: legacy exports via `Object.assign(ctx, { ... })` remain valid while refactoring.
- **Target rule for new/refactored code**: prefer grouped dependencies under `ctx.config`, `ctx.cache`, `ctx.logger`, `ctx.repositories`, and `ctx.services` instead of adding more flat top-level functions. Register new APIs directly in `ctx.services.<domain>` or `ctx.repositories.<domain>`.
- **Physical domain structure (in migration)**: modules are being moved from flat \`apps/server/src/\` to \`apps/server/src/domains/<domain>/\` to group service + repository + routes by bounded context. Existing \`apps/server/src/app.js\` load order and `route-*.js` delegation remain the entry points.
- **No `with (ctx)`** in backend or frontend modules.
- **SQLite isolation**: all `node:sqlite` usage goes through `apps/server/src/platform/db.js`. Never import `node:sqlite` directly elsewhere.
- **SQL ownership**: SQL lives exclusively in repositories under `ctx.repositories.<domain>`. Services and routes never execute SQL directly. Architecture tests enforce this.
- **Frontend**: vanilla JS modules in \`apps/web/src/\`, orchestrated by \`apps/web/src/app.js\` loaded from \`index.html\`. No bundler.
- **History materialization**: portfolio history is pre-computed and cached, not calculated on every request. Ledger changes trigger invalidation from the affected date forward.

## Testing

- Test runner: `node:test` (built-in). Tests live in `test/` and run against the real app runtime.
- **`docs/TESTING.md`** maps each test file to its domain and coverage.
- CI runs on `windows-latest` and `ubuntu-latest` with Node 24 (matrix). The Linux job covers cross-platform runtime, lint, typecheck, format, tests, `verify:publication` (Node) and `seed:demo`; the Windows job additionally validates `desktop:` flows.
- Tests spin up a real server with an in-memory SQLite DB — they are integration tests, not unit tests.
- All changes to \`apps/server/src/\` services and routes require accompanying tests.
- Demo/loadtest data uses one canonical synthetic dataset in `scripts/loadtest-data.js` (`seed:demo`).
- Group creation and instrument-to-group assignment for demo/loadtest live there, not in `apps/server/src/schema.js`.
- Migration checkpoints run in this order:
  1. focused tests for touched domain(s),
  2. `npm run lint` + `npm run format:check`,
  3. `npm run changelog:check`,
  4. full `npm test`,
  5. `npm run verify:publication`,
  6. docs sync verification when docs/API/schema/module lists change.
- **CRITICAL RULE: ALWAYS run `npm run check` (lint + format + spellcheck + changelog + tests) BEFORE any commit.**
  - If tests fail, DO NOT commit or push. Fix the failure first.
  - This includes `npm test`, `npm run lint`, `npm run typecheck`, `npm run verify:publication`.
  - Before creating a tag or release, run the full CI-equivalent test suite locally.
- Before commit, verify that the tests you run locally are the same tests CI will run.
- **Antes de push, ejecutar `npm run check` como simulacion del matrix CI.** Esto cubre lint, format, spellcheck, changelog y tests — el mismo conjunto que CI ejecuta en Linux. Si CI anyade mas pasos en el futuro, actualizar esta regla para reflejarlos.

## UI & UX

- Avoid horizontal scrolling by default in any new window, modal, or screen.

## Docker / CasaOS

- **En `compose.casaos.yml` el tag de imagen debe ser siempre el numero exacto de version (`vX.Y.Z`), nunca `latest`.**
- El campo `x-casaos.version` debe coincidir con el tag de la imagen y con `package.json`.
- Para Docker personal (local, compose local, scripts personales) `latest` es aceptable.

## Documentation

Documentation **must stay in sync with code**. When making changes, verify and update these files in the same commit:

- **`docs/API.md`** — update when adding, removing, or modifying endpoints in `apps/server/src/routes.js`. Check that every route handler has a matching entry.
- **`docs/DATA_MODEL.md`** — update when changing `apps/server/src/schema.js`. Field names in the doc must match the actual `CREATE TABLE` statements exactly. Add new tables.
- **`docs/ARCHITECTURE.md`** — update when adding/removing `apps/server/src/*.js` modules or \`apps/web/src/\*.js\` modules. The module lists must match the actual directory contents and the load order in `apps/server/src/app.js`.
- **`docs/DB_OPERATIONS.md`** — update when changing backup/reset/doctor scripts, DB path resolution, or fresh-only policy invariants.
- **`docs/FINANCIAL_SEMANTICS.md`** — update when changing financial calculations in services. Sign conventions, metric formulas, and helper semantics must match the source code exactly.

**Rule**: never trust docs blindly. If in doubt, read the source (`apps/server/src/schema.js`, `apps/server/src/routes.js`, `apps/server/src/app.js`) as the source of truth, then fix the docs to match.

## Public / Private Boundary

- Community documentation may mention that ValorGrid Pro/Enterprise exists, but must not expose professional connector internals.
- Public docs must not include private adapter ids, broker-specific parser contracts, operational environment variable names, dynamic loading mechanics, restricted workspace details, broker export fixture names, or proprietary source mapping details.
- Exact Pro setup, adapter contracts, broker-specific import semantics, connector environment variables, and restricted-workspace workflows belong only in private ValorGrid Pro/Enterprise documentation.
- If a public API response can include professional sources, document the generic shape and edition semantics with placeholders instead of concrete broker identifiers.
- Any change touching docs, publication checks, source catalog text, or import-source UI must run `npm run verify:publication` before commit.

## DB Operations Policy

- Fresh-only DB policy: schema is created from `apps/server/src/schema.js`; runtime `ALTER TABLE` migrations are forbidden.
- SQL manuales versionados permitidos bajo `deploy/sql/` para cambios de schema productivo.
- Antes de ejecutar un SQL versionado: parar la app, `npm run db:backup`, ejecutar SQL, arrancar, `npm run db:doctor`.
- `scripts/run-sql-migration.ps1` (Windows) y `scripts/run-sql-migration.js` (Docker/Linux/macOS) automatizan el flujo (backup automático + ejecución SQL + verificación de integridad). Usar `-DryRun` / `--dry-run` para simular sin modificar la DB.
- Before touching a real DB file, create a backup first with `npm run db:backup`.
- For schema evolution in test/dev phases, validate with fresh reset (`npm run db:reset`) instead of historical migrations.
- Restore remains manual and documented; do not add destructive reset endpoints in API/UI.

## Git

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `style:`
- **Nunca hacer push sin validacion explicita del usuario.** El comando `/save` es la validacion explicita y no requiere pregunta adicional. Cualquier otro flujo que intente push debe preguntar antes.
- `/save` command reviews changes, runs `npm run check` (lint + format + spellcheck + changelog + tests), and pushes.
  - **RULE: If `npm run check` fails, DO NOT commit or push. Fix the failure first.**
  - **RULE: Before any commit, run ALL tests, not just quick tests.**
  - **RULE: Verify that what you run locally is the same that CI runs.**
- Release tags must use only `v{num_version}` (example: `v2.30.32`). Do not append suffixes, phase labels, or extra text.
- **Never commit**: `*.sqlite`, `.env`, `data/`, `.backups/`, secrets, tokens, credentials, broker exports, local paths.
- Run `npm run verify:publication` before any push to ensure private data is not exposed.
- Working branch is `main` (direct pushes for now).

## Migration Roadmap (Active)

Current migration phase: **physical domain structure**. Modules are being moved from flat \`apps/server/src/\` to \`apps/server/src/domains/<domain>/\` and \`apps/server/src/platform/\`.

Architecture achieved:

- Modular Monolith with `ctx` grouped namespaces
- Clean layering (routes -> services -> repositories)
- SQL exclusively in `ctx.repositories.<domain>`
- Routes split by domain (`route-*.js`)
- `withTransaction` centralized in `apps/server/src/platform/db.js`
- TypeScript strict incremental with JSDoc + `types.ts`
- `AppError` + validators + `sendError` in all routes
- `api-client.js` typed frontend wrapper

Active migration goals:

- Move modules to \`apps/server/src/domains/<domain>/\` by bounded context
- Reduce flat `ctx` aliases, prefer `ctx.services.<domain>` / `ctx.repositories.<domain>`
- Extract pure helpers from large modules (>450 lines)
