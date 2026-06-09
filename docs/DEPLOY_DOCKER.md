# Despliegue Docker y CasaOS

ValorGrid puede ejecutarse como servicio local monousuario con Docker. La base SQLite y los backups viven fuera del contenedor en volumenes persistentes.

## Docker Compose local (build desde repositorio)

Desde la raiz del repositorio:

```bash
docker compose up -d --build
```

Abrir:

```text
http://localhost:1325
```

`docker-compose.yml` usa:

- `HOST=0.0.0.0`
- `PORT=1325`
- `PORTFOLIO_DB_PATH=/data/portfolio.sqlite`
- `VALORGRID_AUTH_USER=valorgrid`
- `VALORGRID_AUTH_PASSWORD=` (vacio: login desactivado)
- `./data:/data`
- `./backups:/app/.backups`

`data/` y `backups/` son privados, estan ignorados por Git y deben incluirse en tu estrategia de backup.

## CasaOS AppStore oficial

El archivo de tienda es `compose.casaos.yml` y usa la imagen estable `latest`:

- `ghcr.io/aivm23/valorgrid:latest`

CasaOS mantiene un campo `version` fijo en la metadata (`x-casaos.version`) para identificar la ficha, pero la imagen del contenedor no queda fijada a ese tag.

## Login monousuario

ValorGrid no gestiona usuarios en SQLite. Para instalaciones Docker/CasaOS expuestas fuera de una LAN privada, activa Basic Auth con variables de entorno:

```bash
VALORGRID_AUTH_USER=valorgrid
VALORGRID_AUTH_PASSWORD=usa-una-contrasena-larga
```

Si `VALORGRID_AUTH_PASSWORD` esta vacio o no existe, el login queda desactivado. Si esta configurado, ValorGrid protege toda la app: pantalla principal, assets, API, exportaciones, backups, `/api/health` y `/api/version`.

Basic Auth debe ir detras de HTTPS. No publiques el puerto HTTP directamente a Internet sin TLS.

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

## Imagen latest

El workflow Docker publica tambien:

- `ghcr.io/aivm23/valorgrid:latest`

El compose de CasaOS y los compose personales pueden consumir `latest`. Mantén `x-casaos.version` sincronizado con `package.json` cuando se actualice la ficha CasaOS.

## Upgrade y rollback en CasaOS

Checklist de upgrade:

1. Ejecutar backup antes de actualizar:
   - `npm run db:backup`
   - `npm run db:doctor`
2. Actualizar el contenedor desde CasaOS para descargar la imagen `latest` publicada.
3. Comprobar que la ficha CasaOS mantiene `x-casaos.version` sincronizado con `package.json`.
4. Comprobar salud en `/api/health`.
5. Revisar que los datos siguen presentes.

Rollback:

1. Detener la app en CasaOS.
2. Volver el tag de imagen a la version anterior (`vX.Y.Z` estable).
3. Arrancar de nuevo la app.
4. Si hubo corrupcion o perdida de datos, restaurar backup manualmente (seccion siguiente).

## Backup y restore

Canal operativo recomendado: scripts locales.

```bash
npm run db:backup
npm run db:doctor
```

Restore manual:

1. Detener la app/servicio.
2. Seleccionar backup en `.backups/` (o en `/DATA/AppData/valorgrid/backups` en CasaOS).
3. Sustituir la DB activa `portfolio.sqlite` en `/data`.
4. Arrancar de nuevo el servicio.
5. Ejecutar `npm run db:doctor` y comprobar `/api/health`.

ValorGrid conserva automaticamente los 6 backups mas recientes en el directorio de backups montado.

## Seguridad

ValorGrid incluye Basic Auth monousuario opcional con `VALORGRID_AUTH_PASSWORD`. Para exponer Docker/CasaOS fuera de una LAN privada, configura una contrasena fuerte y usa HTTPS delante del contenedor.
