# Operaciones de Base de Datos

Este documento cubre el ciclo de vida operativo de SQLite en ValorGrid: backup, reset fresh y diagnóstico.

## Política fresh-only

- `apps/server/src/schema.js` es el contrato único de creación de schema.
- No se permiten migraciones runtime con `ALTER TABLE`.
- Si cambia el schema durante esta fase, se valida con reset fresh en dev/test.
- Esta política se verifica en dos niveles:
  - `test/db-operations.test.js`: escanea `apps/server/src/` y `scripts/` buscando `ALTER TABLE ... ADD|RENAME|DROP|ALTER`.
  - `scripts/verify-publication.js`: repite el escaneo como gate pre-push.
- **Invariante**: antes de tocar una DB real, ejecutar `npm run db:backup`. El comando `npm run db:reset` lo hace automáticamente si la DB existe.

## Resolución de ruta activa

La app y los scripts comparten la misma política:

1. Ruta de base de datos configurada explícitamente, si existe.
2. `local/valorgrid/data/portfolio.sqlite` como ruta canónica.

## Comandos operativos

- Los backups creados por la app y la API usan la `backupDir` resuelta por `apps/server/src/platform/config.js`.
- `npm run db:backup` también usa la misma `backupDir` de `config.js`.
- Toda copia creada por la app o los scripts ejecuta `integrity_check` y `foreign_key_check` antes de considerarse válida.
- En desarrollo local, el directorio de backups se resuelve junto al almacenamiento de la aplicación, conservando compatibilidad con instalaciones antiguas.
- La ubicación de backups se resuelve junto al almacenamiento privado de la aplicación o desde la configuración del despliegue.
- La app conserva automáticamente los 6 backups más recientes y elimina los más antiguos al crear uno nuevo.

## Backup manual antes de mantenimiento

1. Ejecutar `npm run db:doctor`.
2. Ejecutar `npm run db:backup`.
3. Confirmar que el backup aparece en el `backupDir` reportado por el comando.
4. Solo entonces ejecutar cambios de mantenimiento manuales.

`npm run db:reset` añade su propio backup automático verificado. El backup manual sigue disponible para crear un punto de restauración independiente antes de cualquier otra operación.

## Reset fresh (destructivo)

- Si la DB activa existe, `npm run db:reset` hace checkpoint WAL, crea un backup automático y verifica su integridad antes de eliminar ningún archivo.
- Si el backup no puede crearse o verificarse, el reset aborta y conserva intacta la DB activa.
- Si no existe una DB activa, crea directamente el schema fresh y devuelve `backup: null`.
- Una vez verificado el backup, elimina la DB activa y recrea el schema fresh.
- El script elimina solo:
  - `*.sqlite` activo
  - `*.sqlite-wal`
  - `*.sqlite-shm`
- Después recrea la DB fresh y verifica tablas + `app_meta`.

No existe endpoint HTTP para reset por diseño.

## Docker (desarrollo local)

Rutas estándar (desarrollo local):

- DB activa en contenedor: `/data/portfolio.sqlite`
- Backups en contenedor: `/app/.backups`

Volúmenes recomendados (desarrollo local):

- `./local/valorgrid/data:/data`
- `./local/valorgrid/backups:/app/.backups`

Para despliegue CasaOS, las rutas reales se definen en `deploy/docker/compose.casaos.yml` (DB: `/data/portfolio.sqlite`, backups: `/app/.backups`).

Checklist upgrade:

1. `npm run db:backup` (o backup del volumen).
2. `docker compose -f deploy/docker/docker-compose.yml pull` / `docker compose -f deploy/docker/docker-compose.yml up -d --build`.
3. Comprobar salud (`/api/health`).
4. Si falla, rollback manual reemplazando DB por backup y relanzando.

## Updates SQL versionados

Los cambios de schema productivo se entregan como archivos SQL versionados en `deploy/sql/` con el patrón `update-X-to-Y.sql`. Esos mismos SQL tienen dos vías de ejecución:

- migración automática controlada por runtime, descrita al final de este documento;
- ejecución manual mediante los scripts operativos cuando el auto-migrate está deshabilitado o el operador necesita control explícito.

### Script automatizado (recomendado)

Hay dos versiones del script, una para cada entorno:

| Entorno         | Script                          | Requisito                    |
| --------------- | ------------------------------- | ---------------------------- |
| Windows local   | `scripts/run-sql-migration.ps1` | PowerShell 5.1 + sqlite3.exe |
| Docker / CasaOS | `scripts/run-sql-migration.js`  | Node.js ≥ 24 (ya incluido)   |
| Linux / macOS   | `scripts/run-sql-migration.js`  | Node.js ≥ 24                 |

**Windows (PowerShell):**

```
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.15.0-to-3.16.0.sql
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.16.0-to-3.17.0.sql
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.17.0-to-3.18.0.sql
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.20.0-to-3.21.0.sql
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.26.1-to-3.27.0.sql
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.28.12-to-3.28.13.sql
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.29.0-to-3.30.0.sql
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.30.0-to-3.31.0.sql
.\scripts\run-sql-migration.ps1 -SqlPath deploy/sql/update-3.31.4-to-3.32.0.sql
```

**Docker / CasaOS / Linux / macOS (Node.js — no requiere sqlite3 CLI):**

```
# Local
node scripts/run-sql-migration.js --sql deploy/sql/update-3.15.0-to-3.16.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.16.0-to-3.17.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.17.0-to-3.18.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.20.0-to-3.21.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.26.1-to-3.27.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.28.12-to-3.28.13.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.29.0-to-3.30.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.30.0-to-3.31.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.31.4-to-3.32.0.sql

# Docker (ejecutar dentro del contenedor)
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.15.0-to-3.16.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.16.0-to-3.17.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.17.0-to-3.18.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.20.0-to-3.21.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.26.1-to-3.27.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.28.12-to-3.28.13.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.29.0-to-3.30.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.30.0-to-3.31.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.31.4-to-3.32.0.sql

# Con opciones explícitas
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.15.0-to-3.16.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.16.0-to-3.17.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.17.0-to-3.18.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.20.0-to-3.21.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.26.1-to-3.27.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.28.12-to-3.28.13.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.29.0-to-3.30.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.30.0-to-3.31.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.31.4-to-3.32.0.sql --db /data/portfolio.sqlite
```

**Parámetros del script PowerShell (`run-sql-migration.ps1`):**

| Parámetro   | Descripción                                                       |
| ----------- | ----------------------------------------------------------------- |
| `SqlPath`   | Ruta al archivo SQL (obligatorio).                                |
| `SqliteExe` | Ruta a `sqlite3.exe` (auto-detección si se omite).                |
| `DbPath`    | Ruta a la DB activa (auto-detección si se omite).                 |
| `AppRoot`   | Raíz del proyecto (por defecto: directorio padre de `scripts/`).  |
| `BackupDir` | Directorio de backups (auto-detección junto a la DB si se omite). |
| `Confirm`   | Ejecuta sin confirmación interactiva (útil para scripts padres).  |
| `DryRun`    | Simula la operación sin modificar la DB.                          |

**Parámetros del script Node.js (`run-sql-migration.js`):**

| Argumento      | Descripción                                                       |
| -------------- | ----------------------------------------------------------------- |
| `--sql`        | Ruta al archivo SQL (obligatorio).                                |
| `--db`         | Ruta a la DB activa (auto-detección si se omite).                 |
| `--backup-dir` | Directorio de backups (auto-detección junto a la DB si se omite). |
| `--dry-run`    | Simula la operación sin modificar la DB.                          |
| `--yes`        | Omite confirmación interactiva.                                   |
| `--help`       | Muestra ayuda.                                                    |

**DryRun:** ambos scripts soportan modo simulación para verificar qué archivos SQL y qué DB se usarían sin modificar datos reales.

### Flujo manual

1. Parar la app.
2. Crear backup (`npm run db:backup` o usar el script que lo hace automáticamente).
3. Ejecutar SQL contra la DB activa.
4. Arrancar la app.
5. Ejecutar `npm run db:doctor` para verificar salud.

Cualquiera de los dos scripts (PowerShell o Node.js) reemplaza los pasos 2, 3 y 5: incluye backup automático, ejecución SQL y verificación de integridad (PRAGMA foreign_key_check + integrity_check).

## Migraciones automáticas (`schema_version`)

A partir de la versión 3.30.0, ValorGrid incluye un sistema de migraciones automáticas en `apps/server/src/platform/db-migrations.js`.

### `schema_version`

- La meta key `schema_version` en `app_meta` registra la versión de schema de la DB.
- Fresh install: `schema.js` inserta `schema_version` con `CURRENT_SCHEMA_VERSION` (definida en `db-migrations.js`).
- DBs existentes sin `schema_version`: el migrador infiere la versión por columnas/tablas conocidas (p. ej. `note` en `transactions` → `3.32.0`, `cash_balance` en `instruments` → `3.29.0`). Si no puede inferir, bloquea el arranque con un error claro y no aplica migraciones.
- Si la estructura física está por delante de `schema_version` (por ejemplo, `transactions.note` ya existe pero la meta sigue en `3.31.0`), el migrador crea un backup verificado, comprueba integridad y reconcilia solo las metadatas. No vuelve a ejecutar el `ALTER TABLE`, incluso con auto-migración Docker deshabilitada.
- Tras migrar, registra también `last_migration_at`, `last_migration_from` y `last_migration_to` en `app_meta`.

### Orden de arranque

1. Abrir DB.
2. Cargar módulos (incluyendo `db-migrations`).
3. `ctx.runMigrations()`: si la DB está vacía (sin `app_meta`), no migra. Si tiene tablas, lee/infiere `schema_version`, aplica SQL pendientes en orden, crea backup previo y verifica integridad.
4. `ctx.initDatabase()`: crea schema fresh idempotente.

### Comportamiento por runtime

- **Desktop (Windows/Linux/macOS)**: migración automática al arrancar una versión nueva, siempre con backup previo.
- **Docker/CasaOS/Umbrel**: por defecto la migración automática está deshabilitada. El endpoint `/api/update/status` muestra las migraciones pendientes y los comandos a ejecutar; la migración debe iniciarse como una acción explícita del administrador.

### Stop rule

- Si una migración falla, no se continúa con el arranque normal.
- El error incluye: ruta del backup creado, versión origen/destino y ruta de la DB.

### SQL versionados

Los archivos SQL viven en `deploy/sql/` con el patrón `update-X-to-Y.sql`. El migrador los aplica en orden ascendente según `from`. El registro de migraciones está en `MIGRATIONS` dentro de `db-migrations.js`.

## Dataset demo/loadtest

- Existe un único dataset sintético canónico: `scripts/loadtest-data.js`.
- `seed:demo` es el único comando soportado para poblar la demo.
- Ese dataset no forma parte del schema productivo.
