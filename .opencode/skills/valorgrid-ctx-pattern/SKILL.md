---
name: valorgrid-ctx-pattern
description: Keywords src/app.js, grouped ctx namespaces, Object.assign(ctx), module load order, repositories/services. Use ONLY when adding, moving, or debugging backend/frontend modules that depend on ValorGrid shared ctx architecture.
---

# ValorGrid ctx Pattern

Use this skill to work safely with ValorGrid module architecture.

ValorGrid uses a shared `ctx` loaded in order. The current architecture is transitional: legacy flat exports still exist, while new/refactored code should move toward grouped dependencies and cleaner layering.

## When to use

- Creating or splitting backend modules in `src/`
- Debugging load-order or undefined dependency issues in `src/app.js`
- Moving SQL from services into repositories
- Wiring new frontend modules in `app.js`
- Verifying architecture boundaries and anti-regression tests

## Source of truth

- Backend loader: `src/app.js`
- Backend/frontend constraints: `test/architecture.test.js`
- Agent policies: `AGENTS.md`
- Frontend orchestrator: `app.js`

Never trust docs first. Confirm with source code in these files.

## Current state and target

### Current state

1. `src/app.js` builds a shared `ctx` object.
2. Backend modules load in strict sequence.
3. Modules validate dependencies with `assertCtxDeps`/`getCtxDep`.
4. Many APIs are still attached with `Object.assign(ctx, { ... })`.
5. `src/app.js` hydrates grouped aliases (`ctx.services.*`, `ctx.repositories.*`) from legacy APIs.
6. Load order is part of runtime behavior.

### Target state

- Keep `ctx` as composition root, but reduce flat globals.
- Group dependencies under:

```text
ctx.config
ctx.cache
ctx.logger
ctx.repositories
ctx.services
```

- Move SQL ownership to repositories as they are introduced.
- Keep routes thin and business logic in services.
- Keep `ctx.http` as Node primitive for compatibility; HTTP APIs should live in `ctx.services.http`.

## Non-negotiable rules

- `node:sqlite` is allowed only in `src/db.js`.
- `src/routes.js` must not execute SQL directly.
- `market-data` must not own ledger logic.
- `transaction-service` must not execute SQL directly.
- `onboarding-service` must not execute SQL directly.
- `portfolio-service` must not call Yahoo directly.
- `with (ctx)` is prohibited in backend and frontend modules.
- New backend files should stay under 500 lines.
- New frontend files should stay under 350 lines.

Architecture tests enforce these constraints.

## Real backend load order

From `src/app.js`:

```text
schema
schema-seed
meta-state
utils
instrument-repository
instrument-service
ticker-suggestions
market-data-repository
market-data
transaction-repository
transaction-service
import-service
onboarding-repository
onboarding-service
portfolio-service
history-core
history-service
diagnostics-service
routes
http
```

Direct requires before the module loop include `config`, `db`, and `backups`.

If module B depends on module A, A must load first.

## Module templates

### Backend module (current-compatible)

```js
const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db'], 'my-module');
  const { db } = ctx;

  function doSomething(input) {
    return input;
  }

  Object.assign(ctx, { doSomething });
};
```

### Backend module (target-oriented)

```js
const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['repositories', 'services'], 'my-module');

  ctx.services.myDomain ??= {};
  ctx.services.myDomain.doSomething = function doSomething(input) {
    return input;
  };
};
```

### Frontend module

```js
export function attach(ctx) {
  function doUiThing() {}
  Object.assign(ctx, { doUiThing });
}
```

Register module imports and attach order explicitly in `app.js`.

## Safe workflow for architecture changes

1. **Decide ownership first**
   - SQL/persistence -> repositories
   - business rules -> services
   - HTTP normalization -> routes
2. **Preserve behavior first**
   - keep public API stable while moving internals
3. **Insert or move modules carefully**
   - respect load order dependencies
4. **Prefer grouped dependencies for new code**
   - use `ctx.repositories.*` and `ctx.services.*`
5. **Sync docs and skill when structure changes**
   - `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA_MODEL.md`, this skill file

## Common failure modes

### 1) `ctx.someFn is not a function`

Likely causes:
- export missing from provider module
- provider loads after consumer
- naming mismatch between export and usage

Checklist:
- confirm provider exports symbol
- confirm provider load position in `src/app.js`
- confirm exact symbol name in consumer

### 2) `ctx.someFn is undefined` after refactor

Likely causes:
- dependency destructured before it exists
- dependency belongs to a later module
- missing namespace initialization (`ctx.services.foo ??= {}`)

Fix:
- resolve late dependencies at call time when needed
- initialize namespaces before assignment
- move shared primitive to an earlier/lower-level module

### 3) Reintroduced cross-domain leakage

Examples:
- SQL added to routes
- market-data touches ledger tables
- portfolio-service calls Yahoo directly

Fix:
- enforce ownership boundaries and add regression tests

### 4) Architecture line limits fail

Fix by extracting pure helpers:
- `x-service.js` -> `x-service-helpers.js`
- keep orchestration and public API stable in the original module

## Migration strategy guidelines

- Prefer small phases with one clear objective.
- Validate each phase with focused tests first, then full suite.
- Commit only when checkpoint is green.
- Bump version per completed phase with real repository changes.

## Pre-commit checklist for ctx changes

- Focused tests for touched domain pass
- `npm run lint` passes
- `npm run format:check` passes
- `npm test` passes
- `npm run verify:publication` passes
- No direct `node:sqlite` outside `src/db.js`
- No SQL in routes
- Docs and skill synced with code changes
- Version bumped

## Quick commands

```bash
npm run lint
npm run format:check
npm test
node --test --test-name-pattern "architecture" test/architecture.test.js
npm run verify:publication
```

Use architecture test failures as guidance for boundary regressions.
