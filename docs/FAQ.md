# Preguntas Frecuentes

## ¿ValorGrid Sube Mis Datos A La Nube?

No. ValorGrid guarda la cartera en SQLite local. La app no sincroniza tu ledger con una plataforma externa.

Puede consultar Yahoo Finance para precios de símbolos concretos y cachea los resultados localmente.

## ¿Necesito Node.js Para Usarlo En Windows?

No si instalas la versión Windows desde GitHub Releases. El instalador incluye lo necesario para ejecutar la app.

Node.js solo es necesario para desarrollo local desde el repositorio.

## Windows SmartScreen Me Muestra Un Aviso. ¿Es Normal?

Puede ocurrir en apps nuevas o sin firma de código con reputación acumulada. Descarga ValorGrid solo desde la release oficial de GitHub y verifica `SHA256SUMS.txt` si quieres comprobar el archivo.

## ¿ValorGrid Da Recomendaciones De Inversión?

No. ValorGrid no recomienda comprar, vender ni mantener activos. Es una herramienta de organización, visualización y auditoría personal.

## ¿Puedo Usarlo Con Docker?

Sí. Docker es la vía recomendada para usuarios self-hosted:

```bash
docker compose up -d --build
```

También existen imágenes GHCR versionadas. Más detalle en [DEPLOY_DOCKER.md](DEPLOY_DOCKER.md).

## ¿Qué Diferencia Hay Entre Community Y Pro?

Community es la edición pública y gratuita del repositorio. Incluye gestión local, dashboard, movimientos, plantilla Excel, exportación, backups, Windows y Docker.

Pro/Enterprise queda reservado para conectores avanzados, importaciones privadas y funcionalidades comerciales. Su código y documentación operativa no se publican en este repositorio.

## ¿Puedo Importar CSV De Broker En Community?

No. Community importa la plantilla Excel oficial de ValorGrid. Los conectores avanzados pertenecen a Pro/Enterprise.

## ¿Dónde Se Guardan Los Backups?

En la versión Windows, en la zona privada de datos de la aplicación. En desarrollo local, en `local/valorgrid/backups/`. En Docker, en el volumen montado para backups.

## ¿Puedo Restaurar Una Versión Anterior?

Sí. Instala una release anterior y, si hace falta, reemplaza manualmente la base de datos por un backup SQLite. Revisa [GITHUB_RELEASE.md](GITHUB_RELEASE.md) y [DB_OPERATIONS.md](DB_OPERATIONS.md).
