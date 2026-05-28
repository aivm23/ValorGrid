# Despliegue Docker y CasaOS

ValorGrid puede ejecutarse como servicio local monousuario con Docker. La base SQLite y los backups viven fuera del contenedor en volumenes privados.

## Docker Compose local

Desde la raiz del repositorio:

```bash
docker compose up -d --build
```

Abre:

```text
http://localhost:5173
```

El compose oficial usa:

- `HOST=0.0.0.0`
- `PORT=5173`
- `PORTFOLIO_DB_PATH=/data/portfolio.sqlite`
- `./data:/data`
- `./backups:/app/.backups`

`data/` y `backups/` son privados, estan ignorados por Git y deben incluirse en tu sistema de backup personal.

## CasaOS

Cuando exista imagen publicada en GHCR, importa `compose.casaos.yml` como Custom App en CasaOS.

Pasos:

1. Abre CasaOS.
2. Entra en App Store.
3. Usa Custom Install.
4. Pega o importa el contenido de `compose.casaos.yml`.
5. Revisa el puerto `5173`.
6. Instala y abre la Web UI.

El compose CasaOS usa volúmenes nombrados de Docker (persistencia garantizada entre actualizaciones):

- `valorgrid-data:/data`
- `valorgrid-backups:/app/.backups`
- `ghcr.io/aivm23/valorgrid:latest`

## Actualizar

Docker Compose local:

```bash
git pull
docker compose up -d --build
```

CasaOS con GHCR:

```bash
docker compose pull
docker compose up -d
```

## Backup y restore

Backup desde UI o API:

```bash
curl -X POST http://localhost:5173/api/backups
```

Los backups apareceran en `./backups` o en `/DATA/AppData/valorgrid/backups`.

Para restaurar, deten el contenedor, sustituye `portfolio.sqlite` dentro de la carpeta `data` por el backup elegido y vuelve a levantar el servicio.

## Seguridad

ValorGrid no incluye autenticacion todavia. Usalo solo en LAN privada o detras de VPN. No expongas el puerto directamente a Internet hasta que exista una capa de autenticacion.
