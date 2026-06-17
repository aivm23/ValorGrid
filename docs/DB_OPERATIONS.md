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

1. `PORTFOLIO_DB_PATH` si está definido.
2. `local/valorgrid/data/portfolio.sqlite` como ruta canónica.

## Comandos operativos

- Los backups creados por la app y la API usan la `backupDir` resuelta por `apps/server/src/platform/config.js`.
- `npm run db:backup` también usa la misma `backupDir` de `config.js`.
- En desarrollo local sin `PORTFOLIO_DB_PATH`, `backupDir` por defecto es `local/valorgrid/backups/` (si no existe `.backups/` legacy).
- Con `PORTFOLIO_DB_PATH`, `backupDir` se coloca junto a la carpeta privada de datos, salvo que `VALORGRID_BACKUP_DIR` lo sobrescriba.
- La app conserva automáticamente los 6 backups más recientes y elimina los más antiguos al crear uno nuevo.

## Flujo recomendado antes de tocar DB real

1. Ejecutar `npm run db:doctor`.
2. Ejecutar `npm run db:backup`.
3. Confirmar que el backup aparece en el `backupDir` reportado por el comando.
4. Solo entonces ejecutar cambios de mantenimiento o `db:reset`.

## Reset fresh (destructivo)

> **Nota:** El backup previo al reset ya no se crea automáticamente (función `resetDatabase` con backup comentada). Ejecutar `npm run db:backup` manualmente antes si se necesita un backup previo.

- `npm run db:reset` elimina la DB activa y recrea el schema fresh.
- El script elimina solo:
  - `*.sqlite` activo
  - `*.sqlite-wal`
  - `*.sqlite-shm`
- Después recrea la DB fresh y verifica tablas + `app_meta`.

No existe endpoint HTTP para reset por diseño.

## Docker (desarrollo local)

Rutas estándar (desarrollo local):

- DB activa en contenedor: `/local/valorgrid/data/portfolio.sqlite`
- Backups en contenedor: `/local/valorgrid/backups/`

Volúmenes recomendados (desarrollo local):

- `./local/valorgrid/data:/local/valorgrid/data`
- `./local/valorgrid/backups:/local/valorgrid/backups`

Para despliegue CasaOS, las rutas reales se definen en `deploy/docker/compose.casaos.yml` (DB: `/data/portfolio.sqlite`, backups: `/app/.backups`).

Checklist upgrade:

1. `npm run db:backup` (o backup del volumen).
2. `docker compose pull` / `docker compose up -d --build`.
3. Comprobar salud (`/api/health`).
4. Si falla, rollback manual reemplazando DB por backup y relanzando.

## Updates SQL versionados

Los cambios de schema productivo se entregan como archivos SQL versionados en `deploy/sql/` con el patrón `update-X-to-Y.sql`.
No se ejecutan automáticamente al arrancar la app.
Se aplican manualmente por un operador humano.

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
```

**Docker / CasaOS / Linux / macOS (Node.js — no requiere sqlite3 CLI):**

```
# Local
node scripts/run-sql-migration.js --sql deploy/sql/update-3.15.0-to-3.16.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.16.0-to-3.17.0.sql
node scripts/run-sql-migration.js --sql deploy/sql/update-3.17.0-to-3.18.0.sql

# Docker (ejecutar dentro del contenedor)
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.15.0-to-3.16.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.16.0-to-3.17.0.sql
docker exec -it valorgrid node scripts/run-sql-migration.js --sql deploy/sql/update-3.17.0-to-3.18.0.sql

# Con opciones explícitas
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.15.0-to-3.16.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.16.0-to-3.17.0.sql --db /data/portfolio.sqlite
node scripts/run-sql-migration.js --sql /app/deploy/sql/update-3.17.0-to-3.18.0.sql --db /data/portfolio.sqlite
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

## Dataset demo/loadtest

- Existe un único dataset sintético canónico: `scripts/loadtest-data.js`.
- `seed:demo` es el único comando soportado para poblar la demo.
- Ese dataset no forma parte del schema productivo.
