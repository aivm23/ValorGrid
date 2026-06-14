# /audit-release - Auditoría de Release

Ejecuta las verificaciones previas a un tag o release.

**Comandos:**

- `npm run check` — lint, format, spellcheck, changelog, tests
- `npm run verify:publication` — filtración de datos privados
- `node scripts/audit/check-release-surface.js` — superficie de release
- `node scripts/audit/check-large-local-artifacts.js` — artefactos grandes olvidados

**Archivos:**

- `package.json` — versión
- `CHANGELOG.md` — sección para la versión actual
- `deploy/docker/compose.casaos.yml` — `x-casaos.version` e `image` tag
- `.gitignore`, `.dockerignore` — exclusiones de release
