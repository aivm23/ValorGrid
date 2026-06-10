# ValorGrid

![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-installer-0078D4?logo=windows&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED?logo=docker&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Privacidad](https://img.shields.io/badge/privacidad-local%20first-0f766e)

**ValorGrid** es un panel de cartera privado que corre localmente con SQLite.
Los datos nunca salen de tu máquina.

[valorgrid.app](https://valorgrid.app) · [Descargar Windows](https://github.com/aivm23/ValorGrid/releases/latest) · [Docker/CasaOS](#docker) · [Primeros pasos](docs/FIRST_STEPS.md)

> ValorGrid no ofrece asesoramiento financiero, recomendaciones de inversión ni señales de compra o venta. Es una herramienta de registro, visualización y auditoría personal.

## Windows

Descarga el instalador desde [GitHub Releases](https://github.com/aivm23/ValorGrid/releases/latest):

1. `ValorGrid-Setup-X.Y.Z-x64.exe`
2. `SHA256SUMS.txt` para verificar integridad
3. Ejecutar y abrir desde el menú Inicio

La versión de escritorio incluye el runtime. No requiere Node.js.

## Docker / CasaOS

```bash
docker compose -f compose.casaos.yml up -d --build
```

Datos en `./data`, backups en `./backups`. Imágenes GHCR:

```
ghcr.io/aivm23/valorgrid:vX.Y.Z
ghcr.io/aivm23/valorgrid:latest
```

Guía completa: [docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md).

## Privacidad y Seguridad

- Escucha en `127.0.0.1` por defecto.
- Sin login requerido. Sin sincronización externa.
- Yahoo Finance solo consulta símbolos de mercado concretos, cachea localmente.
- En Docker/CasaOS: activa `VALORGRID_AUTH_PASSWORD` si expones fuera de la LAN.

No deben subirse a GitHub: `.env`, `data/*.sqlite`, `.backups/`, hojas Excel personales.

Más detalle: [docs/PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md).

## Capturas

| Dashboard                                           | Movimientos                                             | Histórico                                           |
| --------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| ![Dashboard](assets/screenshots/dashboard-demo.png) | ![Movimientos](assets/screenshots/movimientos-demo.png) | ![Histórico](assets/screenshots/historico-demo.png) |

| Distribución                                              | Instrumentos                                           |
| --------------------------------------------------------- | ------------------------------------------------------ |
| ![Distribución](assets/screenshots/distribucion-demo.png) | ![Valores](assets/screenshots/valores-grupos-demo.png) |

## Desarrollo

```bash
npm install
npm start
# http://localhost:1325
```

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run verify:publication
```

Requisitos: Node.js 24+, `node:sqlite`.

## Documentación

- [FIRST_STEPS.md](docs/FIRST_STEPS.md) — primeros 10 minutos
- [IMPORT_EXCEL.md](docs/IMPORT_EXCEL.md) — plantilla Excel, columnas, FX
- [FAQ.md](docs/FAQ.md) — preguntas frecuentes
- [LEGAL_NOTICE.md](docs/LEGAL_NOTICE.md) — aviso legal
- [ROADMAP.md](docs/ROADMAP.md) — hoja de ruta
- [API.md](docs/API.md) — endpoints
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitectura
- [EDITIONS.md](docs/EDITIONS.md) — Community vs Pro
- [DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md) — Docker y CasaOS
- [GITHUB_RELEASE.md](docs/GITHUB_RELEASE.md) — checklist de publicación
- [DB_OPERATIONS.md](docs/DB_OPERATIONS.md) — backups, doctor, reset
- [SECURITY.md](SECURITY.md) — privacidad y seguridad

## Licencia

MIT — [LICENSE](LICENSE)
