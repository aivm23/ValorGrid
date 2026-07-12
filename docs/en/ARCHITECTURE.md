# Architecture

ValorGrid Community is a modular monolith:

- Node.js 24+ backend.
- CommonJS server modules.
- Native browser ES modules in `apps/web/src`.
- SQLite through `node:sqlite`.
- Composition root in `apps/server/src/app.js`.
- Domain modules under `apps/server/src/domains`.
- Shared infrastructure under `apps/server/src/platform`.

Layering:

1. HTTP routes delegate to services.
2. Services own business logic.
3. Repositories own SQL.
4. `platform/db.js` is the only direct `node:sqlite` boundary.

The frontend uses `attach(ctx)` modules. `i18n.js` owns Spanish/English language preference, DOM translation, locale-aware formatters and extension dictionary registration.

Large orchestration modules delegate focused work to collaborators: Yahoo/Alpha market-data helpers, portfolio monthly/onboarding builders, transaction auto-plan policy, import batch/instrument-choice modules, auto-plan forms, instrument event handlers and the operations metric renderer. These collaborators keep the existing native ESM/CommonJS runtime and explicit composition boundaries.

Professional functionality is loaded as a private extension outside the Community repository. Community keeps public teasers and blocked endpoints but not private implementation details.
