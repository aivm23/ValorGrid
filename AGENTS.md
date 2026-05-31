# AGENTS.md

## Commands

- `npm test` — run all tests (`node --test`)
- `npm run lint` — run ESLint flat config checks
- `npm run format:check` — run Prettier checks for docs/workflows/package manifests
- `npm run check` — run lint + format check + tests
- `node --test --test-name-pattern "test name" test/portfolio.test.js` — run a single test
- `npm start` — start server (`node server.js`)
- `npm run seed:loadtest` — seed demo database with synthetic data
- `npm run verify:publication` — check no private data leaks before publishing
- Current baseline keeps runtime simple (CommonJS + Node test runner).
- Typecheck/build are introduced incrementally by migration phase, never as a big-bang rewrite.

## Versioning

- `package.json` is the single source of truth for the application version.
- **Every functional, technical, or UI change must bump the version before finishing.** The agent must evaluate and apply the appropriate bump:
  - **patch** (x.y.Z): small fixes, minor adjustments, bug fixes that don't change behavior significantly
  - **minor** (x.Y.0): new features, meaningful improvements, new functionality that's backward compatible
  - **major** (X.0.0): breaking changes, incompatible API changes, major refactors that change how the app works
- When the version changes, include it in the same commit as the feature/fix.
- During this migration, each completed phase with real repository changes bumps at least a patch version.

## Architecture

- **Node.js ≥ 24**, CommonJS, vanilla JS frontend, SQLite via `node:sqlite`
- **Composition root + staged DI**: `src/app.js` creates `ctx` and loads backend modules in strict sequence with `require(modulePath)(ctx)`.
- **Current compatibility rule**: legacy exports via `Object.assign(ctx, { ... })` remain valid while refactoring.
- **Target rule for new/refactored code**: prefer grouped dependencies under `ctx.config`, `ctx.cache`, `ctx.logger`, `ctx.repositories`, and `ctx.services` instead of adding more flat top-level functions.
- **No `with (ctx)`** in backend or frontend modules.
- **SQLite isolation**: all `node:sqlite` usage goes through `src/db.js`. Never import `node:sqlite` directly elsewhere.
- **SQL ownership roadmap**: SQL is currently concentrated in services and import helpers; as repositories are introduced, new SQL should land in repositories, not in routes or UI code.
- **Frontend**: vanilla JS modules in `client/`, orchestrated by root `app.js` loaded from `index.html`. No bundler.
- **History materialization**: portfolio history is pre-computed and cached, not calculated on every request. Ledger changes trigger invalidation from the affected date forward.

## Testing

- Test runner: `node:test` (built-in). Three test files in `test/`.
- CI runs on `windows-latest` with Node 24.
- Tests spin up a real server with an in-memory SQLite DB — they are integration tests, not unit tests.
- All changes to `src/` services and routes require accompanying tests.
- Loadtest data (`scripts/loadtest-data.js`) is **demo/presentation only**. Group creation and instrument-to-group assignment live there, not in `src/schema.js`.
- Migration checkpoints run in this order:
  1. focused tests for touched domain(s),
  2. `npm run lint` + `npm run format:check`,
  3. full `npm test`,
  4. `npm run verify:publication`,
  5. docs sync verification when docs/API/schema/module lists change.

## UI & UX

- Avoid horizontal scrolling by default in any new window, modal, or screen.

## Documentation

Documentation **must stay in sync with code**. When making changes, verify and update these files in the same commit:

- **`docs/API.md`** — update when adding, removing, or modifying endpoints in `src/routes.js`. Check that every route handler has a matching entry.
- **`docs/DATA_MODEL.md`** — update when changing `src/schema.js`. Field names in the doc must match the actual `CREATE TABLE` statements exactly. Add new tables.
- **`docs/ARCHITECTURE.md`** — update when adding/removing `src/*.js` modules or `client/*.js` modules. The module lists must match the actual directory contents and the load order in `src/app.js`.

**Rule**: never trust docs blindly. If in doubt, read the source (`src/schema.js`, `src/routes.js`, `src/app.js`) as the source of truth, then fix the docs to match.

## Git

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `style:`
- `/save` command reviews changes, runs `npm test`, and pushes. Always run tests before committing.
- **Never commit**: `*.sqlite`, `.env`, `data/`, `.backups/`, secrets, tokens, credentials, broker exports, local paths.
- Run `npm run verify:publication` before any push to ensure private data is not exposed.
- Working branch is `main` (direct pushes for now).

## Migration Roadmap (Active)

Planned architecture direction:

- Modular Monolith
- Clean-ish layering (routes -> services -> repositories)
- Explicit dependency injection through grouped `ctx`
- Incremental TypeScript strict adoption (no full rewrite in one phase)

Execution policy:

- Small phases, exhaustive verification, and one commit per successful phase.
- Preserve public API and behavior while refactoring internals.
- Update `AGENTS.md`, `docs/ARCHITECTURE.md`, and `.opencode/skills/valorgrid-ctx-pattern/SKILL.md` whenever architectural rules change.
