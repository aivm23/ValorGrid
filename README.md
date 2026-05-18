# Dashboard de cartera

Aplicacion local de un solo usuario para gestionar una cartera privada con SQLite.

La version visible se lee desde `version.json` y tambien esta disponible en `GET /api/version`.

## Privacidad

El repositorio no debe contener datos reales de cartera. Las bases SQLite, backups, configuracion local e importaciones privadas estan ignoradas por Git.

Cada usuario ejecuta su propia instalacion local:

```text
codigo del repositorio
data/portfolio.sqlite      privado e ignorado
.backups/                  privado e ignorado
.env                       privado e ignorado
```

La app escucha por defecto en `127.0.0.1`, no requiere login y no sincroniza datos con ningun servidor remoto. Yahoo Finance se usa solo como proveedor de precios y los resultados se cachean en SQLite.

## Requisitos

- Node.js 24 o superior, por el uso de `node:sqlite`.
- PowerShell para los scripts `.ps1` incluidos.

Actualmente no hace falta instalar dependencias npm para ejecutar la app.

## Ejecutar

```powershell
npm start
```

Equivalente manual:

```powershell
node server.js
```

Despues abre:

```text
http://localhost:5173
```

La ruta de base de datos se decide asi:

1. `PORTFOLIO_DB_PATH`, si esta definido.
2. `portfolio.sqlite` en la raiz, si existe por compatibilidad con instalaciones antiguas.
3. `data/portfolio.sqlite` para instalaciones nuevas.

Ejemplo con ruta privada explicita:

```powershell
$env:PORTFOLIO_DB_PATH = "D:\cartera-privada\portfolio.sqlite"
node server.js
```

## Dataset demo

El dataset demo es sintetico y determinista. No representa una cartera real.

```powershell
npm run seed:demo
$env:PORTFOLIO_DB_PATH = ".\portfolio.loadtest.sqlite"
node server.js
```

Tambien puedes usar:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-loadtest.ps1
```

`portfolio.loadtest.sqlite` es regenerable y no debe versionarse.

## Docker y CasaOS

ValorGrid puede ejecutarse como servicio local con Docker:

```bash
docker compose up -d --build
```

La base SQLite queda en `./data` y los backups en `./backups`, ambas rutas privadas e ignoradas por Git.

Para CasaOS, usa `compose.casaos.yml` cuando exista imagen publicada en GitHub Container Registry. La guía completa está en `docs/DEPLOY_DOCKER.md`.

## Tests

```powershell
node --test
```

Ejecuta la suite antes de relanzar la app tras cambios de codigo. `npm test` es un alias.

La suite incluye comprobaciones de privacidad para evitar publicar rutas locales, bases SQLite, backups o saldos iniciales personales en codigo.

## Verificar publicacion

Antes de crear un commit o publicar en GitHub:

```powershell
npm run verify:publication
```

Ese comando ejecuta checks de sintaxis, tests y validaciones de privacidad sobre los archivos publicables.

## Backups

Crear backup local:

```powershell
npm run backup
```

Tambien esta disponible por API local con `POST /api/backups`. Los backups se guardan en `.backups/`, que no debe subirse a Git.

## APIs locales

- `GET /api/version`
- `GET /api/health`
- `GET /api/instruments`
- `POST /api/instruments`
- `PUT /api/instruments/:symbol`
- `GET /api/instrument-groups`
- `POST /api/instrument-groups`
- `PUT /api/instrument-groups/:id`
- `GET /api/onboarding/status`
- `GET /api/transactions`
- `POST /api/transactions`
- `POST /api/transactions/preview`
- `DELETE /api/transactions/:id`
- `GET /api/auto-plans`
- `PUT /api/auto-plans`
- `GET /api/portfolio/summary`
- `GET /api/portfolio/performance`
- `GET /api/portfolio/monthly?year=2026`
- `GET /api/portfolio/history?range=all`
- `GET /api/diagnostics/performance`
- `GET /api/backups`
- `POST /api/backups`
- `GET /api/export/transactions.csv`
- `GET /api/export/transactions.json`
- `GET /api/quote?symbol=TICKER&date=2026-05-03`
- `GET /api/state`

## Modelo de datos

- `instruments`: ticker interno, ticker Yahoo, nombre, tipo, divisa, color, acciones base y estado activo.
- `instrument_groups`: agrupacion visual y funcional de instrumentos.
- `transactions`: compras y ventas atomicas con fecha, acciones, importe EUR, precio, divisa, FX, comision, cash-flow y origen.
- `auto_plans`: aportaciones automaticas configurables con fecha de inicio.
- `price_cache` y `daily_price_cache`: cache local de precios.
- `portfolio_positions_daily`, `portfolio_value_daily`, `portfolio_value_weekly`, `portfolio_events`: historico materializado para lectura rapida.
- `history_invalidations` y `history_builds`: control de reconstruccion historica.

## Estructura

- `server.js`: bootstrap del servidor.
- `src/`: backend modular, SQLite, rutas, servicios, historico y backups.
- `client/`: frontend modular, API, estado, graficos, formularios, ledger, tema y vistas.
- `scripts/`: arranque, backup, verificacion y dataset demo.
- `test/`: tests funcionales, rendimiento, privacidad y arquitectura.
- `docs/GITHUB_RELEASE.md`: checklist para publicar en GitHub sin datos privados.
- `GITHUB.md`: guia de inicializacion y subida del repositorio.
- `SECURITY.md`: notas de privacidad y seguridad local.
- `version.json`: fuente unica de version.

## GitHub

Antes de publicar:

```powershell
npm run verify:publication
```

Consulta `GITHUB.md` y `docs/GITHUB_RELEASE.md`. No subas bases SQLite, backups, ficheros `.env`, exportaciones de broker ni scripts locales con datos reales.
