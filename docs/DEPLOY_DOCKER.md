# Despliegue Docker y CasaOS

ValorGrid puede ejecutarse como servicio local monousuario con Docker. La base SQLite y los backups viven fuera del contenedor en volumenes persistentes.

## Docker Compose local (build desde repositorio)

Desde la raíz del repositorio:

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

Abrir:

```text
http://localhost:1325
```

`deploy/docker/docker-compose.yml` usa:

- `HOST=0.0.0.0`
- `PORT=1325`
- `PORTFOLIO_DB_PATH=/data/portfolio.sqlite`
- `VALORGRID_AUTH_USER=valorgrid`
- `VALORGRID_AUTH_PASSWORD=` (vacío: login desactivado)
- `./data:/data`
- `./backups:/app/.backups`

`data/` y `backups/` son privados, estan ignorados por Git y deben incluirse en tu estrategia de backup.

## CasaOS AppStore oficial

El archivo de tienda es `deploy/docker/compose.casaos.yml` y usa la imagen con el tag versionado exacto:

- `ghcr.io/aivm23/valorgrid:vX.Y.Z`

**CasaOS exige que el tag de la imagen sea el número exacto de versión (`vX.Y.Z`), nunca `latest`.** El campo `x-casaos.version` debe coincidir con el tag de la imagen y con `package.json`.

## Login monousuario

ValorGrid no gestiona usuarios en SQLite. Para instalaciones Docker/CasaOS expuestas fuera de una LAN privada, activa Basic Auth con variables de entorno:

```bash
VALORGRID_AUTH_USER=valorgrid
VALORGRID_AUTH_PASSWORD=usa-una-contraseña-larga
```

Si `VALORGRID_AUTH_PASSWORD` está vacío o no existe, el login queda desactivado. Si está configurado, ValorGrid protege toda la app: pantalla principal, assets, API, exportaciones, backups, `/api/health` y `/api/version`.

Basic Auth debe ir detrás de HTTPS. No publiques el puerto HTTP directamente a Internet sin TLS.

Pasos de prueba previos al envío a AppStore:

1. Abrir CasaOS.
2. Entrar en App Store.
3. Usar Custom Install.
4. Importar `deploy/docker/compose.casaos.yml`.
5. Instalar y abrir la Web UI.
6. Verificar `GET /api/health`.

El compose CasaOS usa bind mounts bajo `/DATA/AppData/valorgrid`, que es la ruta esperada para datos persistentes de apps en CasaOS:

- `/DATA/AppData/valorgrid/data:/data`
- `/DATA/AppData/valorgrid/backups:/app/.backups`

## Imagen latest

El workflow Docker publica también:

- `ghcr.io/aivm23/valorgrid:latest`

Para Docker personal (local, scripts personales) puedes usar `latest` sin problemas. **Para CasaOS el tag debe ser siempre la versión exacta (`vX.Y.Z`).** Mantén `x-casaos.version` sincronizado con `package.json` y con el tag de `image` en `deploy/docker/compose.casaos.yml` cuando se actualice la ficha CasaOS.

## Upgrade y rollback en CasaOS

Checklist de upgrade:

1. Ejecutar backup antes de actualizar:
   - `npm run db:backup`
   - `npm run db:doctor`
2. Actualizar el contenedor desde CasaOS para descargar la imagen con el tag versionado (`vX.Y.Z`) publicado.
3. Comprobar que `deploy/docker/compose.casaos.yml` tiene `x-casaos.version` y el tag de `image` sincronizados con `package.json`.
4. Comprobar salud en `/api/health`.
5. Revisar que los datos siguen presentes.

Rollback:

1. Detener la app en CasaOS.
2. Volver el tag de imagen a la versión anterior (`vX.Y.Z` estable) en `deploy/docker/compose.casaos.yml`.
3. Arrancar de nuevo la app.
4. Si hubo corrupción o perdida de datos, reinstalar una versión anterior y restaurar manualmente la DB desde el backup.

## Backup

Canal operativo recomendado: scripts locales.

```bash
npm run db:backup
npm run db:doctor
```

ValorGrid conserva automáticamente los 6 backups más recientes en el directorio de backups montado.

## Seguridad

ValorGrid incluye Basic Auth monousuario opcional con `VALORGRID_AUTH_PASSWORD`. Para exponer Docker/CasaOS fuera de una LAN privada, configura una contraseña fuerte y usa HTTPS delante del contenedor.
