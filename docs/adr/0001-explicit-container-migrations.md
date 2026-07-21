# ADR 0001: Migraciones explícitas en contenedores

- Estado: aceptada
- Fecha: 2026-07-21

## Contexto

ValorGrid usa SQLite local con datos persistentes montados fuera del contenedor. En escritorio, una actualización de aplicación y una actualización de datos ocurren dentro de la misma instalación local. En Docker, CasaOS y Umbrel, el cambio de imagen puede ejecutarse automáticamente desde una plataforma externa y no siempre coincide con una ventana de mantenimiento elegida por el administrador.

El sistema de migraciones versionadas vive en `apps/server/src/platform/db-migrations.js` y los SQL operativos viven en `deploy/sql/`. Los artefactos de contenedor declaran `VALORGRID_RUNTIME_MODE=docker`.

## Decisión

En Docker, CasaOS y Umbrel, las migraciones automáticas de schema quedan deshabilitadas por defecto. La aplicación debe detectar migraciones pendientes e informar el estado, pero no debe modificar una base existente hasta que el administrador ejecute una acción explícita de migración.

La activación automática en contenedores solo se permite con una señal deliberada (`VALORGRID_AUTO_MIGRATE=1`). El flujo recomendado sigue siendo parar la app, crear backup, ejecutar el SQL versionado mediante los scripts operativos y verificar integridad.

## Consecuencias

- Las actualizaciones de imagen no aplican cambios destructivos o difíciles de revertir durante el arranque.
- El operador conserva control sobre backup, ventana de mantenimiento y rollback.
- Las instalaciones de escritorio mantienen la migración automática con backup previo para reducir fricción de usuario.
- Las pruebas y los checks de publicación deben seguir verificando que los artefactos de contenedor declaran el runtime Docker y que el modo Docker no auto-migra por defecto.

## Referencias

- `apps/server/src/platform/db-migrations.js`
- `docs/DB_OPERATIONS.md`
- `docs/DEPLOY_DOCKER.md`
- `docs/DEPLOY_UMBREL.md`
- `test/db-migrations.test.js`
