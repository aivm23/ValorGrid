# Privacidad y seguridad práctica

ValorGrid está diseñado como una aplicación local monousuario. El objetivo es que cada usuario conserve sus datos en su propio equipo, servidor doméstico o volumen privado.

## Qué datos son privados

No deben subirse a GitHub ni compartirse públicamente:

- `*.sqlite`
- `*.sqlite-wal`
- `*.sqlite-shm`
- `.backups/`
- `data/`
- `backups/`
- `.env`
- `config.local.*`
- `local/`
- `imports/`
- `downloads/`
- exportaciones reales de broker
- hojas Excel personales
- logs con rutas o datos de cartera

## Archivos ignorados

El repositorio incluye `.gitignore` y `.dockerignore` para evitar publicar datos privados por accidente.

Comprueba antes de publicar:

```powershell
npm run verify:publication
```

El verificador ejecuta tests y comprobaciones de privacidad sobre archivos publicables.

## Base de datos local

La ruta de DB se decide así:

1. `PORTFOLIO_DB_PATH`, si está definido.
2. `portfolio.sqlite` en la raíz, si existe por compatibilidad con instalaciones antiguas.
3. `data/portfolio.sqlite` para instalaciones nuevas.

Recomendación:

- Para uso personal, guarda la DB en una carpeta privada.
- Para Docker, monta un volumen persistente.
- Incluye la DB y backups en tu sistema personal de copias.

## Backups

Los backups se guardan localmente y no deben versionarse.

Crear backup:

```powershell
npm run db:backup
```

Diagnóstico rápido:

```powershell
npm run db:doctor
```

## Importaciones

Los CSV/XLSX reales de broker pueden contener:

- nombre completo de productos;
- ISIN;
- importes;
- comisiones;
- fechas;
- identificadores de orden;
- historial financiero personal.

No deben guardarse en el repositorio. Usa `samples/` solo para fixtures sintéticos.

## Yahoo Finance

ValorGrid puede consultar Yahoo Finance para precios. La app no envía tu ledger completo a Yahoo, pero sí puede consultar símbolos de mercado concretos.

Los precios se cachean localmente en SQLite.

## Red local

Por defecto ValorGrid escucha en:

```text
127.0.0.1
```

En Docker se usa `0.0.0.0` dentro del contenedor para que el puerto pueda publicarse. Eso no significa que deba exponerse a Internet.

Recomendación:

- úsalo en localhost, LAN privada o VPN;
- no abras el puerto directamente a Internet;
- si necesitas acceso externo, añade reverse proxy con autenticación.

## GitHub

Antes de publicar:

1. Ejecuta `npm run verify:publication`.
2. Revisa `git status --short`.
3. Asegúrate de que no aparecen SQLite, backups, `.env`, imports privados ni logs.
4. Revisa [docs/GITHUB_RELEASE.md](GITHUB_RELEASE.md).

## SECURITY.md

`SECURITY.md` es el documento estándar de GitHub para notas de seguridad. Este documento explica la parte práctica de privacidad local y publicación segura.
