# Operaciones de Base de Datos

Este documento cubre el ciclo de vida operativo de SQLite en ValorGrid: backup, reset fresh, restore manual y diagnóstico.

## Política fresh-only

- `src/schema.js` es el contrato único de creación de schema.
- No se permiten migraciones runtime con `ALTER TABLE`.
- Si cambia el schema durante esta fase, se valida con reset fresh en dev/test.

## Resolución de ruta activa

La app y los scripts comparten la misma política:

1. `PORTFOLIO_DB_PATH` si está definido.
2. `portfolio.sqlite` en raíz si existe (compatibilidad legacy).
3. `data/portfolio.sqlite` para instalaciones fresh.

## Comandos operativos

```powershell
npm run db:backup
npm run db:doctor
npm run db:reset
```

Compatibilidad:

```powershell
npm run backup
```

`backup` es alias de `db:backup`.

## Flujo recomendado antes de tocar DB real

1. Ejecutar `npm run db:doctor`.
2. Ejecutar `npm run db:backup`.
3. Confirmar que el backup aparece en `.backups/`.
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
2. Elegir backup en `.backups/`.
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
