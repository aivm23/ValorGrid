# ValorGrid

![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-installer-0078D4?logo=windows&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED?logo=docker&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Privacidad](https://img.shields.io/badge/privacidad-local%20first-0f766e)
![No financial advice](https://img.shields.io/badge/no%20financial%20advice-7c3aed)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-EA4AAA?logo=githubsponsors&logoColor=white)](#apoyar-el-proyecto)

![ValorGrid - dashboard privado de cartera](assets/brand/valorgrid-publicidad-completa.png)

**ValorGrid es una app local para controlar, importar y visualizar tu cartera privada sin subir tus datos a una plataforma de terceros.**

[Descargar Windows](https://github.com/aivm23/ValorGrid/releases/latest) · [Ver capturas](#capturas) · [Docker](#docker) · [Primeros pasos](docs/FIRST_STEPS.md) · [Documentación](#documentación-util)

> ValorGrid no ofrece asesoramiento financiero, recomendaciones de inversión ni señales de compra o venta. Es una herramienta de registro, visualización y auditoría personal.

## Para Quién Es

ValorGrid está pensado para inversores particulares que hoy controlan su cartera con Excel, varias cuentas o herramientas locales, y quieren:

- tener sus movimientos y evolución en su propio PC;
- importar y exportar datos con una plantilla Excel clara;
- revisar distribución, histórico, aportaciones, ventas, comisiones y cash-flow;
- hacer backups locales;
- evitar subir su ledger completo a servicios de cartera en la nube.

## Qué Incluye Community

- Dashboard de distribución actual de cartera.
- Revisión YTD de evolución, flujos y resultado anual.
- Registro manual de compras y ventas.
- Importación mediante plantilla Excel oficial de ValorGrid.
- Exportación Excel de movimientos compatible con reimportación.
- Histórico materializado de evolución de cartera.
- Aportaciones automáticas configurables.
- Backups locales y diagnóstico de base de datos.
- Instalador Windows y despliegue Docker/GHCR.

Los conectores avanzados de broker pertenecen a ValorGrid Pro/Enterprise. Community puede mostrar esas integraciones como futuras o profesionales, pero no publica código, contratos operativos ni muestras privadas.

## Instalar En Windows

Ruta recomendada para usuarios no técnicos:

1. Abrir la [última release oficial](https://github.com/aivm23/ValorGrid/releases/latest).
2. Descargar `ValorGrid-Setup-X.Y.Z-x64.exe`.
3. Descargar `SHA256SUMS.txt` si quieres verificar el instalador.
4. Ejecutar el instalador y abrir ValorGrid desde el menú Inicio.

La versión de escritorio incluye el runtime necesario. No requiere instalar Node.js ni ejecutar comandos. La base SQLite y los backups se guardan en la carpeta privada de datos de la aplicación del usuario, fuera del directorio instalado.

Si Windows SmartScreen muestra un aviso, comprueba que el archivo viene de GitHub Releases de `aivm23/ValorGrid` y revisa el checksum. Más detalle en [docs/FAQ.md](docs/FAQ.md).

## Primeros 10 Minutos

Para empezar sin tocar comandos:

1. Instala ValorGrid para Windows.
2. Crea tu primer grupo e instrumento.
3. Registra una compra manual o descarga la plantilla Excel.
4. Importa movimientos y revisa el preview antes de confirmar.
5. Crea un backup local.

Guía completa: [docs/FIRST_STEPS.md](docs/FIRST_STEPS.md).

## Capturas

### Dashboard Principal

![Dashboard principal](assets/screenshots/dashboard-demo.png)

### Movimientos

![Movimientos](assets/screenshots/movimientos-demo.png)

### Histórico

![Histórico](assets/screenshots/histórico-demo.png)

### Instrumentos Y Grupos

![Valores y grupos](assets/screenshots/valores-grupos-demo.png)

### Distribución

![Distribución](assets/screenshots/distribucion-demo.png)

## Importar Y Exportar Excel

ValorGrid Community solo acepta la plantilla Excel oficial de ValorGrid. Descárgala desde la app o desde:

```text
GET /api/import/template.xlsx
```

La app también exporta movimientos en el mismo formato Excel:

```text
GET /api/export/transactions.xlsx
```

La fuente pública `valorgrid-xlsx` se procesa internamente con ExcelJS y controles estrictos: hoja `Movimientos`, encabezados exactos, sin fórmulas, tamaño máximo y límite de 500 movimientos en Community.

Guía de importación: [docs/IMPORT_EXCEL.md](docs/IMPORT_EXCEL.md).

Un ejemplo sintético con tickers reales del S&P 500 está disponible en `samples/valorgrid-template/`. Los datos de movimientos son ficticios y no representan una cartera real.

## Docker

ValorGrid puede ejecutarse como servicio local con Docker:

```bash
docker compose up -d --build
```

La base SQLite queda en `./data` y los backups en `./backups`, ambas rutas privadas e ignoradas por Git.

Para exponer Docker o CasaOS fuera de tu LAN privada, configura `VALORGRID_AUTH_PASSWORD` con una contraseña larga y usa HTTPS delante del contenedor. `VALORGRID_AUTH_USER` es opcional y por defecto vale `valorgrid`.

También se publican imágenes GHCR versionadas desde tags `vX.Y.Z`:

```text
ghcr.io/aivm23/valorgrid:vX.Y.Z
ghcr.io/aivm23/valorgrid:latest
```

Guía completa: [docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md).

## Privacidad

ValorGrid se ejecuta en local. Por defecto escucha en `127.0.0.1`, no requiere login y no sincroniza datos con servidores externos. En Docker/CasaOS puedes activar Basic Auth monousuario con `VALORGRID_AUTH_PASSWORD`.

No deben subirse a GitHub:

```text
data/portfolio.sqlite
.backups/
backups/
.env
imports/
downloads/
hojas Excel personales
exportaciones reales de broker
```

Yahoo Finance se usa solo como proveedor externo de precios. La app no envía tu ledger completo a Yahoo; consulta símbolos de mercado concretos y cachea resultados localmente.

Más detalle en [docs/PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md) y [docs/LEGAL_NOTICE.md](docs/LEGAL_NOTICE.md).

## Desarrollo Local

Estos requisitos aplican solo al desarrollo desde el repositorio:

- Node.js 24 o superior, por el uso de `node:sqlite`.
- macOS o Linux: solo necesitas `node` y `npm`. Los scripts `db:*` y `verify:publication` usan entrypoints Node multiplataforma.
- Windows: opcionalmente puedes seguir usando los wrappers `.ps1` (requieren PowerShell), aunque ya no son necesarios para `npm run db:*` ni para `npm run verify:publication`.

### Linux y macOS

```bash
npm install
npm start
```

Después abre:

```text
http://localhost:1325
```

Checks completos:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run verify:publication
```

### Windows

Los mismos comandos funcionan igual. Los wrappers `.ps1` (`scripts\db-*.ps1`, `scripts\verify-publication.ps1`) siguen disponibles como atajos nativos si los prefieres invocar directamente con PowerShell.

Reconstruir el instalador Windows en local (solo Windows):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-desktop-win.ps1
```

## Backups

Crear backup local:

```bash
npm run db:backup
```

Diagnóstico rápido de DB:

```bash
npm run db:doctor
```

Reset fresh destructivo, con confirmación:

```bash
npm run db:reset
```

La app conserva automáticamente los 6 backups más recientes. Flujo completo en [docs/DB_OPERATIONS.md](docs/DB_OPERATIONS.md).

## Documentación Útil

- [docs/FIRST_STEPS.md](docs/FIRST_STEPS.md): primeros 10 minutos para usuarios no técnicos.
- [docs/IMPORT_EXCEL.md](docs/IMPORT_EXCEL.md): plantilla Excel, columnas, FX y errores comunes.
- [docs/FAQ.md](docs/FAQ.md): preguntas frecuentes sobre Windows, privacidad, Docker y Pro.
- [docs/LEGAL_NOTICE.md](docs/LEGAL_NOTICE.md): aviso legal ampliado.
- [docs/ROADMAP.md](docs/ROADMAP.md): hoja de ruta Community y Pro/Enterprise.
- [docs/API.md](docs/API.md): endpoints de la API local.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): backend, frontend, histórico e importaciones.
- [docs/EDITIONS.md](docs/EDITIONS.md): separación Community / Pro-Enterprise.
- [docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md): despliegue local con Docker y CasaOS.
- [docs/GITHUB_RELEASE.md](docs/GITHUB_RELEASE.md): checklist de publicación.
- [SECURITY.md](SECURITY.md): notas estándar de privacidad y seguridad local.

## Apoyar El Proyecto

Si ValorGrid te resulta útil, puedes apoyar su desarrollo mediante GitHub Sponsors, feedback, issues o pull requests.

El objetivo del proyecto es mantener una herramienta local, privada y sencilla para seguimiento de cartera, sin convertirla en una plataforma de asesoramiento financiero.

## Licencia

Este proyecto se publica bajo licencia MIT. Consulta [LICENSE](LICENSE).
