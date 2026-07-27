# ADR 0002: Community es propietaria del esquema compartido

- Estado: aceptada
- Fecha: 2026-07-28

## Contexto

ValorGrid Community y ediciones profesionales comparten la misma base de datos SQLite subyacente. Sin una propiedad clara del esquema, las ediciones privadas podrían introducir tablas, columnas o migraciones que entren en conflicto con el contrato público de Community, rompiendo instalaciones existentes o bloqueando actualizaciones.

`apps/server/src/schema.js` es la definición actual del esquema, creada desde cero en instalaciones limpias. Los archivos SQL versionados en `deploy/sql/` permiten actualizar bases de datos existentes de forma explícita.

## Decisión

**Community es la única propietaria del esquema compartido.** Esto significa:

1. `apps/server/src/schema.js` es la fuente canónica para instalaciones limpias. Ninguna edición puede modificar este archivo sin pasar por el repositorio Community.
2. Los archivos `deploy/sql/update-X-to-Y.sql` son el único mecanismo autorizado para cambios de esquema en bases existentes. Cualquier edición privada que necesite compatibilidad temporal con una versión Community debe gestionar esa capa fuera del repositorio público, sin alterar la política fresh-only de Community.
3. Las ediciones privadas no pueden introducir migraciones runtime automáticas en el arranque de Community. El sistema de migraciones (`platform/db-migrations.js`) pertenece a Community y solo ejecuta migraciones versionadas de `deploy/sql/`.
4. Community no contiene shims de compatibilidad para tablas o columnas de ediciones privadas.

## Consecuencias

- Community mantiene control completo sobre la evolución del esquema.
- Las ediciones privadas deben adaptarse al esquema Community o mantener su propia capa de compatibilidad fuera del repositorio público.
- Los tests de integración de Community solo necesitan verificar el esquema Community.
- La política fresh-only se mantiene: no se permiten migraciones runtime con `ALTER TABLE` fuera del mecanismo versionado.

## Referencias

- `apps/server/src/schema.js`
- `deploy/sql/`
- `apps/server/src/platform/db-migrations.js`
- `docs/DB_OPERATIONS.md`
- `docs/DATA_MODEL.md`
- `docs/EDITIONS.md`
- `test/db-operations.test.js`
