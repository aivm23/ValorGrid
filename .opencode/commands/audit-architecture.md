# /audit-architecture - Auditoría de Arquitectura

Ejecuta tests de arquitectura y revisa violaciones de capas.

**Comandos:**

- `node --test test/architecture.test.js` — tests de layering

**Archivos:**

- `apps/server/src/app.js` — composition root
- `apps/server/src/routes.js` — registro de rutas
- `apps/server/src/route-*.js` — rutas por dominio
- \`apps/server/src/domains/\` — módulos por bounded context
- `test/architecture.test.js` — tests de arquitectura
