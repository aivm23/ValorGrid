# ValorGrid

![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-installer-0078D4?logo=windows&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-AppImage%20%2B%20deb-FCC624?logo=linux&logoColor=black)
![macOS](https://img.shields.io/badge/macOS-DMG-000000?logo=apple&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED?logo=docker&logoColor=white)
![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)
![Privacy](https://img.shields.io/badge/privacy-local%20first-0f766e)

**ValorGrid** is a private portfolio dashboard that runs locally with SQLite. Your portfolio data stays on your machine.

[Spanish README](README.md) · [valorgrid.app](https://valorgrid.app) · [Desktop downloads](https://github.com/aivm23/ValorGrid/releases/latest) · [Docker/CasaOS](docs/en/DEPLOY_DOCKER.md) · [First steps](docs/en/FIRST_STEPS.md)

> ValorGrid does not provide financial advice, investment recommendations, or buy/sell signals. It is a personal record-keeping, visualization and audit tool.

## Desktop

Download the installer for your platform from [GitHub Releases](https://github.com/aivm23/ValorGrid/releases/latest):

1. Windows x64: `ValorGrid-Setup-X.Y.Z-x64.exe` or `ValorGrid-Setup-x64.exe`
2. Linux x64: `ValorGrid-Linux-x64.AppImage` or `ValorGrid-Linux-x64.deb`
3. macOS x64/arm64: `ValorGrid-macOS-x64.dmg` or `ValorGrid-macOS-arm64.dmg`
4. `SHA256SUMS.txt` for integrity verification

Desktop builds include the runtime and do not require Node.js.

## Docker / CasaOS / Umbrel

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

Data lives in `./data`; backups live in `./backups`. GHCR images:

```text
ghcr.io/aivm23/valorgrid:vX.Y.Z
ghcr.io/aivm23/valorgrid:latest
```

Umbrel uses a separate package. See [docs/en/DEPLOY_UMBREL.md](docs/en/DEPLOY_UMBREL.md).

## Privacy And Security

- Listens on `127.0.0.1` by default.
- No external sync.
- Yahoo Finance requests only the configured market symbols and caches prices locally.
- In Docker/CasaOS, set `VALORGRID_AUTH_PASSWORD` before exposing ValorGrid outside your private LAN.

Never publish `.env`, `data/*.sqlite`, `.backups/`, personal Excel files, credentials or tokens.

## Updates

The **Administration → Update** section detects the latest stable release and guides you to the correct installer (desktop) or shows Docker commands (server). The app does not do silent updates; you control when to install. See [docs/FIRST_STEPS.md](docs/FIRST_STEPS.md) and [docs/GITHUB_RELEASE.md](docs/GITHUB_RELEASE.md).

## Professional Edition

ValorGrid Community covers local portfolio management with the Excel template. If you need broker connectors, automatic import or priority support: [valorgrid.app/pro/](https://valorgrid.app/pro/) or press **Request Professional Edition** in Administration. See [docs/EDITIONS.md](docs/EDITIONS.md).

## Screenshots

| Dashboard                                           | Movements                                             | History                                           |
| --------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| ![Dashboard](assets/screenshots/dashboard-demo.png) | ![Movements](assets/screenshots/movimientos-demo.png) | ![History](assets/screenshots/historico-demo.png) |

| Allocation                                              | Instruments                                                |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| ![Allocation](assets/screenshots/distribucion-demo.png) | ![Instruments](assets/screenshots/valores-grupos-demo.png) |

## Development

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

Requirements: Node.js 24+ and `node:sqlite`.

## Documentation

English documentation index: [docs/en/README.md](docs/en/README.md).

Spanish documentation remains available in [docs/](docs/).

## License

ValorGrid Community is distributed under Mozilla Public License 2.0 (`MPL-2.0`) for releases published after the license change. See [LICENSE](LICENSE).

The ValorGrid name, logo, icons and visual identity are not licensed under `MPL-2.0`. See [NOTICE.md](NOTICE.md) and [TRADEMARKS.md](TRADEMARKS.md).

Copyright (c) 2026 Alvaro I. Valderrama Molina.
