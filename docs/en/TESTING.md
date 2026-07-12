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
```

The suite includes integration tests with a real server and temporary SQLite database, architecture tests, frontend static tests, privacy/publication tests, DB operations tests, automatic split/reverse-split coverage and release-surface tests.

`test/i18n.test.js` covers the bilingual UI wiring, locale formatting guard and `Accept-Language` behavior for Community edition gates.
