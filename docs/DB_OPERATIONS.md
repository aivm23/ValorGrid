# Operaciones de Base de Datos

Este documento cubre el ciclo de vida operativo de SQLite en ValorGrid: backup, reset fresh, restore manual y diagnóstico.

## Política fresh-only

- `src/schema.js` es el contrato único de creación de schema.
- No se permiten migraciones runtime con `ALTER TABLE`.
- Si cambia el schema durante esta fase, se valida con reset fresh en dev/test.
- Esta política se verifica en dos niveles:
  - `test/db-operations.test.js`: escanea `src/` y `scripts/` buscando `ALTER TABLE ... ADD|RENAME|DROP|ALTER`.
  - `scripts/verify-publication.ps1`: repite el escaneo como gate pre-push.
- **Invariante**: antes de tocar una DB real, ejecutar `npm run db:backup`. El comando `npm run db:reset` lo hace automáticamente si la DB existe.

## Resolución de ruta activa

La app y los scripts comparten la misma política:

1. `PORTFOLIO_DB_PATH` si está definido.
2. `portfolio.sqlite` en raíz si existe (compatibilidad legacy).
3. `data/portfolio.sqlite` para instalaciones fresh.

## Comandos operativos

```bash
npm run db:backup
npm run db:doctor
npm run db:reset
```

Compatibilidad:

```bash
npm run backup
```

`backup` es alias de `db:backup`.

Retencion:

- Los backups creados por la app, la API o los scripts usan la misma `backupDir` resuelta por `src/platform/config.js`.
- En desarrollo local sin `PORTFOLIO_DB_PATH`, `backupDir` es `.backups/`.
- Con `PORTFOLIO_DB_PATH`, `backupDir` se coloca junto a la carpeta privada de datos, salvo que `VALORGRID_BACKUP_DIR` lo sobrescriba.
- La app conserva automaticamente los 6 backups mas recientes y elimina los mas antiguos al crear uno nuevo.

## Flujo recomendado antes de tocar DB real

1. Ejecutar `npm run db:doctor`.
2. Ejecutar `npm run db:backup`.
3. Confirmar que el backup aparece en el `backupDir` reportado por el comando.
4. Solo entonces ejecutar cambios de mantenimiento o `db:reset`.

## Reset fresh (destructivo)

- `npm run db:reset` crea backup obligatorio si la DB existe.
- El script elimina solo:
  - `*.sqlite` activo
  - `*.sqlite-wal`
  - `*.sqlite-shm`
- Después recrea la DB fresh y verifica tablas + `app_meta`.

No existe endpoint HTTP para reset por diseño.

## Restore manual

Proceso manual guiado:

1. Detener la app/servicio.
2. Elegir backup en el directorio de backups activo.
3. Reemplazar el archivo SQLite activo por ese backup.
4. Iniciar la app.
5. Ejecutar `npm run db:doctor` y `GET /api/health`.

## Docker y CasaOS

Rutas estándar:

- DB activa en contenedor: `/data/portfolio.sqlite`
- Backups en contenedor: `/app/.backups`

Volúmenes recomendados:

- `./data:/data`
- `./backups:/app/.backups`

Checklist upgrade:

1. `npm run db:backup` (o backup del volumen).
2. `docker compose pull` / `docker compose up -d --build`.
3. Comprobar salud (`/api/health`).
4. Si falla, rollback manual reemplazando DB por backup y relanzando.

## Dataset demo/loadtest

- Existe un único dataset sintético canónico: `scripts/loadtest-data.js`.
- `seed:demo` es el único comando soportado para poblar la demo.
- Ese dataset no forma parte del schema productivo.
