# AI TOOLING

Inventario completo de tooling AI, comandos, skills y responsabilidades en ValorGrid.

---

## 1. Inventario de Comandos

| Comando  | Scope         | Qué verifica                                           | Runtime                     |
| -------- | ------------- | ------------------------------------------------------ | --------------------------- |
| `/check` | Pre-push      | Tests, privacidad, docs sync, versión, git status      | opencode agent (`check.md`) |
| `/save`  | Commit + push | Tests, privacidad, docs sync, versión, cambios seguros | opencode agent (`save.md`)  |

## 2. Inventario de Skills

| Skill                         | Propósito                                                  | Files que cubre                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valorgrid-ctx-pattern`       | Trabajar con la arquitectura de módulos `ctx` de ValorGrid | `apps/server/src/app.js`, `test/architecture.test.js`, `AGENTS.md`, `apps/web/src/app.js`, `apps/server/src/route-service-bindings.js`, `apps/server/src/domains/**/*` |
| `valorgrid-xlsx-import-debug` | Debug y mantenimiento de importaciones Excel oficiales     | `apps/server/src/domains/data-ingestion/*.js`, `index.html`, `apps/web/src/`, `docs/IMPORT_EXCEL.md`, `test/imports.test.js`                                           |
| `documentation-auditor`       | Auditar y podar documentación contra código fuente         | `docs/**/*.md`, `apps/server/src/schema.js`, `apps/server/src/routes.js`, `apps/server/src/app.js`                                                                     |
| `bash-defensive-patterns`     | Patrones defensivos Bash para scripts de producción        | `scripts/*.sh`, `.github/workflows/*.yml`                                                                                                                              |
| `frontend-design`             | Crear interfaces frontend de alta calidad                  | `apps/web/src/`, `index.html`, `apps/web/**/*`                                                                                                                         |
| `customize-opencode`          | Editar configuración de opencode                           | `.opencode/**`, `opencode.json`, `~/.config/opencode/**`                                                                                                               |
| `find-skills`                 | Descubrir e instalar skills                                | N/A (skill discovery)                                                                                                                                                  |

## 3. Scripts Automatizados

No hay scripts en `scripts/audit/` actualmente. Los siguientes comandos npm simulan su funcionalidad:

| Script npm           | Qué valida                                          | Cómo invocar                 |
| -------------------- | --------------------------------------------------- | ---------------------------- |
| `check`              | lint + format + docs spellcheck + changelog + tests | `npm run check`              |
| `verify:publication` | Fugas de datos privados                             | `npm run verify:publication` |

## 4. Comandos npm

```json
{
  "audit:ai": "node scripts/audit/check-ai-surface.js",
  "audit:packages": "node scripts/audit/check-package-boundaries.js",
  "audit:artifacts": "node scripts/audit/check-large-local-artifacts.js",
  "audit:deps": "node scripts/audit/check-dependency-policy.js && npm audit",
  "audit:release": "npm run check && npm run verify:publication && node scripts/audit/check-release-surface.js",
  "audit:local": "npm run audit:ai && npm run audit:packages && npm run audit:artifacts"
}
```

`audit:docs` (node scripts/audit/check-doc-sync.js) está planificado pero aún no implementado.

## 5. Flujos de Trabajo

### Desarrollo diario

```bash
npm run check          # lint + format + docs + changelog + tests
npm run audit:local    # auditoría local completa (cuando exista)
```

### Before commit

Ejecutar `/check` (opencode agent) que corre:

1. `npm test`
2. `npm run verify:publication`
3. Verificación de sincronización de documentación
4. Verificación de versión y docker compose
5. Verificación de git status

### Before tag / release

Ejecutar `/audit-release` que corre:

1. `npm run check` (gate principal)
2. `npm run verify:publication` (gate de publicación segura)
3. Verificación de superficie de release

### After changes to imports

Ejecutar `/audit-imports` para verificar:

- Parsers, perfiles de ingestión, reconciliación
- Límites de Community import
- Docs de importación sincronizadas

### After changes to docs

Ejecutar `/audit-docs` para verificar:

- Endpoints en `apps/server/src/routes.js` vs `docs/API.md`
- Tablas en `apps/server/src/schema.js` vs `docs/DATA_MODEL.md`
- Módulos en `apps/server/src/` y `apps/web/src/` vs `docs/ARCHITECTURE.md`

## 6. Responsabilidades

| Comando                      | Rol                                | Descripción                                                                             |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run check`              | **Gate principal**                 | lint + format check + docs spellcheck + changelog check + tests                         |
| `npm run verify:publication` | **Gate de publicación segura**     | Verifica que no hay fugas de datos privados antes de publicar                           |
| `npm run audit:local`        | **Auditoría read-only local**      | AI surface + package boundaries + doc sync + large artifacts (pendiente de implementar) |
| `npm run audit:release`      | **Auditoría pre-release completa** | check + verify:publication + release surface (pendiente de implementar)                 |
| `/check`                     | **Verificación pre-push**          | Tests, privacidad, docs, versión, git status                                            |
| `/save`                      | **Commit + push seguro**           | Integra todas las verificaciones antes de pushear                                       |
