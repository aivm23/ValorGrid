# Despliegue Docker y CasaOS

ValorGrid puede ejecutarse como servicio local monousuario con Docker. La base SQLite y los backups viven fuera del contenedor en volumenes persistentes.

Umbrel usa un paquete separado en `deploy/umbrel/`; no reutiliza ni `deploy/docker/docker-compose.yml` ni `deploy/docker/compose.casaos.yml`. Ver [DEPLOY_UMBREL.md](DEPLOY_UMBREL.md).

## Docker Compose local (build desde repositorio)

Desde la raíz del repositorio:

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

Abrir:

```text
http://localhost:1325
```

El compose publica la aplicación en el puerto `1325` y monta directorios persistentes separados para datos y backups.

`data/` y `backups/` son privados, están ignorados por Git y deben incluirse en tu estrategia de backup.

## CasaOS AppStore oficial

El archivo de tienda es `deploy/docker/compose.casaos.yml` y usa la imagen con el tag versionado exacto:

- `ghcr.io/aivm23/valorgrid:vX.Y.Z`

**CasaOS exige que el tag de la imagen sea el número exacto de versión (`vX.Y.Z`), nunca `latest`.** El campo `x-casaos.version` debe coincidir con el tag de la imagen y con `package.json`.

## Login monousuario

ValorGrid no gestiona usuarios en SQLite. Para instalaciones Docker/CasaOS expuestas fuera de una LAN privada, configura Basic Auth mediante el mecanismo de secretos de tu despliegue y reinicia el contenedor. La protección cubre la interfaz, API, exportaciones, backups y endpoints de estado.

Basic Auth debe ir detrás de HTTPS. No publiques el puerto HTTP directamente a Internet sin TLS.

## Alpha Vantage para commodities

Las commodities usan Alpha Vantage. Para uso normal, crea la commodity y añade la clave desde el asistente. En despliegues administrados, la clave puede gestionarse mediante la configuración segura del contenedor.

La API nunca devuelve el valor de la clave; solo informa si Alpha Vantage está configurado y si la interfaz puede gestionarla.

Pasos de prueba previos al envío a AppStore:

1. Abrir CasaOS.
2. Entrar en App Store.
3. Usar Custom Install.
4. Importar `deploy/docker/compose.casaos.yml`.
5. Instalar y abrir la Web UI.
6. Verificar `GET /api/health`.

El compose de CasaOS monta directorios persistentes separados para datos y backups.

## Imagen latest

El workflow Docker publica también:

- `ghcr.io/aivm23/valorgrid:latest`

Para Docker personal (local, scripts personales) puedes usar `latest` sin problemas. **Para CasaOS el tag debe ser siempre la versión exacta (`vX.Y.Z`).** Mantén `x-casaos.version` sincronizado con `package.json` y con el tag de `image` en `deploy/docker/compose.casaos.yml` cuando se actualice la ficha CasaOS.

## Upgrade y rollback en CasaOS

> **Docker/CasaOS/Umbrel se actualiza desde fuera del contenedor.** ValorGrid no monta el Docker socket ni muta el contenedor desde dentro. La sección **Administración → Actualización** de la app muestra los comandos y el checklist, pero la actualización se ejecuta desde el host.

Checklist de upgrade:

1. Ejecutar backup antes de actualizar:
   - `npm run db:backup`
   - `npm run db:doctor`
2. Actualizar el contenedor desde CasaOS para descargar la imagen con el tag versionado (`vX.Y.Z`) publicado.
3. Comprobar que `deploy/docker/compose.casaos.yml` tiene `x-casaos.version` y el tag de `image` sincronizados con `package.json`.
4. Comprobar salud en `/api/health`.
5. Revisar que los datos siguen presentes.

Comandos Docker equivalentes (mostrados también desde la app en **Administración → Actualización → Copiar comandos Docker**):

```bash
docker pull ghcr.io/aivm23/valorgrid:vX.Y.Z
docker compose pull
docker compose up -d
```

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

Para exponer Docker/CasaOS fuera de una LAN privada, configura una contraseña fuerte mediante el gestor de secretos del despliegue y usa HTTPS delante del contenedor.
