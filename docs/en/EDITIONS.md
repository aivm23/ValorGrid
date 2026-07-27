# Editions

This repository contains only ValorGrid Community. Public documentation describes Community contracts and does not detail commercial implementation.

## Community

Community is the public, local-first edition of ValorGrid, distributed under `MPL-2.0` for covered releases. It includes manual movements, the official ValorGrid Excel template, dashboard, history, backups, desktop, Docker, CasaOS and Umbrel deployments.

The public template is downloaded from `GET /api/import/template.xlsx`, uses the `Movimientos` sheet and normalises into `transactions`. Public samples are synthetic; real broker exports are never published.

The source code license does not grant rights to the name, logo, icons, visual identity or promotional materials. See `NOTICE.md` and `TRADEMARKS.md`.

## Professional

Professional Edition may add private import adapters and commercial capabilities under proprietary terms. Its code, operational documentation, tests and sample data live outside this public repository.

If Professional needs temporary schema compatibility with a specific Community version, that layer belongs to the non-public distribution and must be removed or formalised there. Community maintains `apps/server/src/schema.js` as its public contract for fresh installs and versioned SQL files in `deploy/sql/` for explicit updates.

## Public Boundary

- Community may show a generic Professional Edition teaser, always disabled when the capability is not available.
- Private adapter ids, parser contracts, source names, fixtures, broker exports, secrets, local paths and loading details must not be published.
- Private integrations must not be declared as Community dependencies or require changes to Community's public HTTP contract.
- `apps/server/src/schema.js` is the canonical Community schema for fresh installs. No edition may modify this public contract without going through the Community repository. Versioned SQL files in `deploy/sql/` are the explicit upgrade mechanism for existing databases; private editions must not introduce runtime migrations or alter Community's fresh-only policy.
- Financial rules published in [FINANCIAL_SEMANTICS.md](../FINANCIAL_SEMANTICS.md) are the common contract for any data that reaches the ledger.

## Publication

Before publishing Community, run:

```bash
npm run verify:publication
```

The verification and `test/privacy.test.js` block private data and non-publicable Professional surface.
