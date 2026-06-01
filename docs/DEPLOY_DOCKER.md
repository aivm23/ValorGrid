# Despliegue Docker y CasaOS

ValorGrid puede ejecutarse como servicio local monousuario con Docker. La base SQLite y los backups viven fuera del contenedor en volumenes persistentes.

## Docker Compose local (build desde repositorio)

Desde la raiz del repositorio:

```bash
docker compose up -d --build
```

Abrir:

```text
http://localhost:5173
```

`docker-compose.yml` usa:

- `HOST=0.0.0.0`
- `PORT=5173`
- `PORTFOLIO_DB_PATH=/data/portfolio.sqlite`
- `./data:/data`
- `./backups:/app/.backups`

`data/` y `backups/` son privados, estan ignorados por Git y deben incluirse en tu estrategia de backup.

## CasaOS AppStore oficial (tag fijo)

El archivo de tienda es `compose.casaos.yml` y usa una imagen versionada:

- `ghcr.io/aivm23/valorgrid:v2.32.1`

Esto evita problemas de actualizacion con `latest` en el AppStore de CasaOS.

Pasos de prueba previos al envio a AppStore:

1. Abrir CasaOS.
2. Entrar en App Store.
3. Usar Custom Install.
4. Importar `compose.casaos.yml`.
5. Instalar y abrir la Web UI.
6. Verificar `GET /api/health`.

El compose CasaOS usa bind mounts bajo `/DATA/AppData/valorgrid`, que es la ruta esperada para datos persistentes de apps en CasaOS:

- `/DATA/AppData/valorgrid/data:/data`
- `/DATA/AppData/valorgrid/backups:/app/.backups`

## Uso personal con latest (sin compose adicional)

El workflow Docker publica tambien:

- `ghcr.io/aivm23/valorgrid:latest`

Para uso personal puedes consumir `latest` en tu propio compose, pero el compose oficial de AppStore permanece en tag fijo `vX.Y.Z`.

## Upgrade y rollback en CasaOS

Checklist de upgrade:

1. Ejecutar backup antes de actualizar:
   - `npm run db:backup`
   - `npm run db:doctor`
2. Cambiar la imagen en el compose de la app CasaOS de `vX.Y.Z` a la nueva version `vA.B.C`.
3. Actualizar el contenedor desde CasaOS.
4. Comprobar salud en `/api/health`.
5. Revisar que los datos siguen presentes.

Rollback:

1. Detener la app en CasaOS.
2. Volver el tag de imagen a la version anterior (`vX.Y.Z` estable).
3. Arrancar de nuevo la app.
4. Si hubo corrupcion o perdida de datos, restaurar backup manualmente (seccion siguiente).

## Backup y restore

Canal operativo recomendado: scripts locales.

```powershell
npm run db:backup
npm run db:doctor
```

Restore manual:

1. Detener la app/servicio.
2. Seleccionar backup en `.backups/` (o en `/DATA/AppData/valorgrid/backups` en CasaOS).
3. Sustituir la DB activa `portfolio.sqlite` en `/data`.
4. Arrancar de nuevo el servicio.
5. Ejecutar `npm run db:doctor` y comprobar `/api/health`.

## Seguridad

ValorGrid no incluye autenticacion todavia. Usar solo en LAN privada o detras de VPN. No exponer el puerto directamente a Internet hasta disponer de capa de autenticacion.
