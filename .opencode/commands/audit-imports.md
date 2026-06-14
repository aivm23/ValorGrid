# /audit-imports - Auditoría de Importación de Datos

Ejecuta los tests de importación y revisa los módulos de ingesta.

**Comandos:**

- `node --test test/imports.test.js` — tests de importación

**Archivos:**

- `apps/server/src/domains/data-ingestion/` — lógica de ingesta
- `apps/web/src/import*` — frontend de importación
- `docs/IMPORT_EXCEL.md` — documentación de importación Excel
- `test/imports.test.js` — tests específicos
