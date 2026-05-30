---
name: valorgrid-ctx-pattern
description: Keywords src/app.js, with (ctx), Object.assign(ctx), module load order. Use ONLY when adding, moving, or debugging backend/frontend modules that depend on ValorGrid shared ctx architecture.
---

# ValorGrid ctx Pattern

Use this skill to work safely with ValorGrid module architecture.

This project is not a classic service-container or DI framework. It uses a shared `ctx` object, loaded in order, where modules attach functions and state.

## When to use

- Creating a new backend module in `src/`
- Splitting a large module into submodules
- Debugging `undefined is not a function` between services
- Fixing load-order bugs in `src/app.js`
- Wiring new frontend modules in `app.js`
- Reviewing architecture boundaries (`routes`, `db`, `market-data`, etc.)

## Source of truth

- Backend loader: `src/app.js`
- Backend constraints: `test/architecture.test.js`
- Agent rules: `AGENTS.md`
- Frontend orchestrator: `app.js`

Never trust docs first. Confirm with code in those files.

## Core mental model

1. `src/app.js` creates `ctx` with shared primitives (`db`, config, caches, constants, helpers).
2. Modules are loaded in strict sequence.
3. Each backend module receives `ctx` and usually executes under `with (ctx) { ... }`.
4. Each module exports behavior by mutating `ctx`:

```js
Object.assign(ctx, { myFunction, myOtherFunction });
```

5. Later modules can call functions attached by earlier modules.

This means load order is part of runtime behavior.

## Non-negotiable rules

- `node:sqlite` is allowed only in `src/db.js`.
- `src/routes.js` must not execute SQL directly.
- `market-data` must not own ledger logic.
- `portfolio-service` must not call Yahoo directly.
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
instrument-service
ticker-suggestions
market-data
transaction-service
import-service
onboarding-service
portfolio-service
history-core
history-service
diagnostics-service
routes
http
```

Direct requires before loop include `config`, `db`, `backups`.

If module B needs function from module A, A must load first.

## Backend module template

```js
module.exports = function attach(ctx) {
  with (ctx) {
    function doSomething(input) {
      // use db, helpers, constants from ctx
      return input;
    }

    Object.assign(ctx, { doSomething });
  }
};
```

## Frontend module template

Frontend modules usually expose `attach(ctx)` and are wired in `app.js`.

```js
export function attach(ctx) {
  function doUiThing() {
    // use ctx.state, ctx.elements, ctx helpers
  }

  Object.assign(ctx, { doUiThing });
}
```

Then register in `app.js` import list + attach sequence.

## Safe workflow when adding a module

1. Decide ownership first
   - DB and SQL helpers -> service layer, not routes.
   - HTTP only -> routes.
   - External market APIs -> market-data.

2. Create module with `attach(ctx)` and explicit exports via `Object.assign`.

3. Insert module in correct load position
   - Earlier if it provides primitives used by many modules.
   - Later if it depends on existing services.

4. Keep boundaries
   - Do not leak cross-domain logic.

5. Update docs when required
   - `docs/ARCHITECTURE.md` if module list/load order changes.
   - `docs/API.md` if routes changed.
   - `docs/DATA_MODEL.md` if schema changed.

6. Add/adjust integration tests.

7. Run `npm test`.

## Common failure modes

### 1) `ctx.someFn is not a function`

Likely causes:
- Function never exported with `Object.assign(ctx, ...)`
- Module load order wrong
- Typo mismatch between export name and usage

Checklist:
- Search definition and export in provider module
- Confirm provider module appears earlier in `src/app.js`
- Confirm consumer module references exact name

### 2) `ReferenceError` inside module using `with (ctx)`

Likely causes:
- Referencing symbol not in `ctx`
- Helper exists but exported under different name

Fix:
- Add symbol to `ctx` in `src/app.js` or in earlier module export
- Or call through correct existing helper

### 3) Circular behavior smell

If two modules depend on each other strongly, split primitives into a lower-level helper module loaded earlier.

### 4) Architecture tests fail on max lines

Refactor by extracting pure helpers into sibling module:
- Example pattern: `import-workflow.js` -> `import-workflow-helpers.js`

## Refactor pattern for oversized modules

When module exceeds line limits:

1. Extract pure functions/constants into `*-helpers.js`
2. Keep orchestration in original module
3. Update imports
4. Keep public API stable for callers
5. Update tests that assert file content paths

## IBKR-oriented guidance (next step)

When adding Interactive Brokers import support:

- Keep adapter-specific parsing in import parser/profile layer.
- Keep reconciliation generic in `import-reconcile`.
- Keep commit/rollback logic generic in `import-service`.
- If IBKR adds special parsing utilities, create focused helper module (for example `import-ibkr-parser.js`) and call it from existing import pipeline, instead of bloating core modules.

This preserves ctx architecture and avoids regressions.

## Pre-commit checklist for ctx changes

- `npm test` passes
- No direct `node:sqlite` outside `src/db.js`
- No SQL in `src/routes.js`
- No new cross-domain leakage
- Docs synced if module lists/order changed
- Version bumped if functional/technical behavior changed

## Quick commands

```bash
npm test
node --test --test-name-pattern "architecture" test/architecture.test.js
```

Use architecture test failures as guidance for where boundaries were broken.
