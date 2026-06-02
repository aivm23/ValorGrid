---
name: documentation-auditor
description: Audit and prune repository documentation against source code truth. Use when asked to review docs for drift, redundancy, missing coverage, release/checklist accuracy, public/private boundaries, Community vs Pro leakage, or to keep ValorGrid documentation maintainable.
---

# Documentation Auditor

Use this skill to audit documentation as an engineering artifact, not as prose in isolation.

## Workflow

1. Map the documentation surface.
   - List `docs/**/*.md` plus root docs such as `README.md`, `AGENTS.md`, `GITHUB.md`, `SECURITY.md`.
   - Count rough size and headings to identify overlap and stale inventories.

2. Ground every claim in source of truth.
   - API: compare `docs/API.md` with `src/routes.js` and `src/domains/**/route-*.js`.
   - Data model: compare `docs/DATA_MODEL.md` with `src/schema.js`.
   - Architecture: compare module lists and load order with `src/app.js`, `app.js`, `client/`, `src/domains/`, and `src/platform/`.
   - DB operations: compare docs with `scripts/db-*.js`, `scripts/*.ps1`, `src/platform/config.js`, and `src/platform/backups.js`.
   - Testing: compare `docs/TESTING.md` with `test/*.js` and `.github/workflows/*.yml`.
   - Release/privacy: compare public docs with `.gitignore`, `.dockerignore`, `scripts/verify-publication.ps1`, and `test/privacy.test.js`.

3. Judge documentation quality.
   - Mark stale facts, duplicated inventories, historical migration notes, and implementation details that will age quickly.
   - Preserve docs that serve different audiences even if they overlap lightly, for example README quickstart vs DB operations vs Docker deployment.
   - Prefer durable invariants over line counts, temporary branch state, old version numbers, or one-off migration chronology.

4. Enforce public/private boundaries.
   - Community docs may mention that Pro/Enterprise exists, but must not publish private adapter code, parser contracts, fixture names, broker exports, private repo paths, operational secret names, or unimplemented Pro loading variables.
   - Public UI teaser names are acceptable only if deliberately allowed by privacy checks and disabled in Community.
   - Move exact Pro setup, adapter contracts, and proprietary source mapping details to private documentation.

5. Apply edits when requested.
   - Keep changes scoped and do not rewrite docs just for style.
   - Update version metadata when repository instructions require it.
   - Sync version-dependent files such as `package.json`, `package-lock.json`, `compose.casaos.yml`, and deployment docs.

6. Verify.
   - Always run the repository Prettier gate before finishing. In ValorGrid Community this is `npm run format:check`; if it fails, run the repo formatter and re-run the check because GitHub CI enforces it.
   - Run targeted static searches for old terms after formatting.
   - For publishable changes, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run verify:publication` when feasible.

## Output Pattern

Lead with high-signal findings or completed changes. Separate:

- stale or wrong documentation;
- redundant or excessive documentation;
- missing documentation;
- public/private leakage or Pro/Community boundary risks;
- checks run and residual risk.
