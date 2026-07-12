# Testing

ValorGrid uses Node's built-in `node:test` runner.

Main commands:

```bash
npm test
npm run lint
npm run format:check
npm run docs:spellcheck
npm run verify:publication
npm run check
npm run audit:duplication
npm run benchmark
npm run styles:check
```

The Prettier gate covers application, package, script and test JavaScript/TypeScript, HTML and CSS as well as documentation and manifests. The duplication audit is initially informative for inherited clones. The benchmark regenerates the canonical synthetic dataset, uses a temporary SQLite copy and reports median, p95, memory and static-resource size outside the machine-sensitive CI gate.

`test/accessibility.test.js` validates IDs, ARIA references, dialog names/descriptions, button names, inline-event absence, focus behavior and the ordered CSS cascade split.

The suite includes integration tests with a real server and temporary SQLite database, architecture tests, frontend static tests, privacy/publication tests, DB operations tests, automatic split/reverse-split coverage and release-surface tests.

`test/i18n.test.js` covers the bilingual UI wiring, locale formatting guard and `Accept-Language` behavior for Community edition gates.
