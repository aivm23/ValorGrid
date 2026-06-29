# ValorGrid

![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-installer-0078D4?logo=windows&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-AppImage%20%2B%20deb-FCC624?logo=linux&logoColor=black)
![macOS](https://img.shields.io/badge/macOS-DMG-000000?logo=apple&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED?logo=docker&logoColor=white)
![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)
![Privacidad](https://img.shields.io/badge/privacidad-local%20first-0f766e)

**ValorGrid** es un panel de cartera privado que corre localmente con SQLite.
Los datos nunca salen de tu máquina.

[valorgrid.app](https://valorgrid.app) · [Descargar escritorio](https://github.com/aivm23/ValorGrid/releases/latest) · [Docker/CasaOS](#docker) · [Primeros pasos](docs/FIRST_STEPS.md)

> ValorGrid no ofrece asesoramiento financiero, recomendaciones de inversión ni señales de compra o venta. Es una herramienta de registro, visualización y auditoría personal.

## Escritorio

Descarga el instalador de tu plataforma desde [GitHub Releases](https://github.com/aivm23/ValorGrid/releases/latest):

1. Windows x64: `ValorGrid-Setup-X.Y.Z-x64.exe` o `ValorGrid-Setup-x64.exe`
2. Linux x64: `ValorGrid-Linux-x64.AppImage` o `ValorGrid-Linux-x64.deb`
3. macOS x64/arm64: `ValorGrid-macOS-x64.dmg` o `ValorGrid-macOS-arm64.dmg`
4. `SHA256SUMS.txt` para verificar integridad

La versión de escritorio incluye el runtime. No requiere Node.js. Los builds macOS son unsigned en esta fase, por lo que Gatekeeper puede pedir aprobación manual en el primer arranque.

## Docker / CasaOS / Umbrel

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

Datos en `./data`, backups en `./backups`. Imágenes GHCR:

```
ghcr.io/aivm23/valorgrid:vX.Y.Z
ghcr.io/aivm23/valorgrid:latest
```

Umbrel usa un paquete independiente:

- Oficial: `deploy/umbrel/official/valorgrid/`
- Community App Store: `deploy/umbrel/community-store/`

Guía Umbrel: [docs/DEPLOY_UMBREL.md](docs/DEPLOY_UMBREL.md).

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
- [FINANCIAL_DISCLAIMER.md](docs/FINANCIAL_DISCLAIMER.md) — descargo financiero
- [API.md](docs/API.md) — endpoints
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitectura
- [EDITIONS.md](docs/EDITIONS.md) — Community vs Pro
- [DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md) — Docker y CasaOS
- [GITHUB_RELEASE.md](docs/GITHUB_RELEASE.md) — checklist de publicación
- [DB_OPERATIONS.md](docs/DB_OPERATIONS.md) — backups, doctor, reset
- [SECURITY.md](SECURITY.md) — privacidad y seguridad

Consulta también [CREATE_INSTRUMENTS.md](docs/CREATE_INSTRUMENTS.md) para crear valores con Yahoo o Alpha Vantage.

## Licencia

ValorGrid Community se distribuye bajo la Mozilla Public License 2.0 (`MPL-2.0`) para las versiones publicadas a partir de este cambio de licencia. Consulta [LICENSE](LICENSE) para los términos completos.

El nombre ValorGrid, el logotipo, los iconos y otros elementos de identidad visual no quedan licenciados bajo `MPL-2.0`. Consulta [NOTICE.md](NOTICE.md) y [TRADEMARKS.md](TRADEMARKS.md).

Copyright © 2026 Álvaro I. Valderrama Molina.
