# Privacidad y seguridad práctica

ValorGrid está diseñado como una aplicación local monousuario. El objetivo es que cada usuario conserve sus datos en su propio equipo, servidor doméstico o volumen privado.

## Qué datos son privados

No deben subirse a GitHub ni compartirse públicamente:

- `*.sqlite`
- `*.sqlite-wal`
- `*.sqlite-shm`
- `local/valorgrid/backups/`
- `local/valorgrid/data/`
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

```bash
npm run verify:publication
```

El verificador ejecuta tests y comprobaciones de privacidad sobre archivos publicables.

## Base de datos local

La ruta de DB se decide así:

1. `PORTFOLIO_DB_PATH`, si está definido.
2. `local/valorgrid/data/portfolio.sqlite` por defecto.

En la app de escritorio, ValorGrid define `PORTFOLIO_DB_PATH` automáticamente dentro de la carpeta privada de datos de usuario de la aplicación. Los backups de escritorio usan la misma zona privada mediante `VALORGRID_BACKUP_DIR`.

Recomendación:

- Para uso personal, guarda la DB en una carpeta privada.
- Para Docker, monta un volumen persistente.
- Incluye la DB y backups en tu sistema personal de copias.

## Backups

Los backups se guardan localmente y no deben versionarse.

Crear backup:

```bash
npm run db:backup
```

Diagnóstico rápido:

```bash
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

El test de privacidad escanea los archivos `.xlsx` públicos (en `samples/`) para bloquear tokens de broker, ISIN reales y nombres de fuentes privadas.

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
- si necesitas acceso externo en Docker/CasaOS, configura `VALORGRID_AUTH_PASSWORD` y usa HTTPS delante del contenedor.

## Login monousuario

`VALORGRID_AUTH_PASSWORD` activa Basic Auth para toda la app. `VALORGRID_AUTH_USER` es opcional y por defecto es `valorgrid`.

La contraseña no se guarda en SQLite ni se muestra en la API. Debe gestionarse como secreto del despliegue. Si `VALORGRID_AUTH_PASSWORD` está vacío, ValorGrid mantiene el modo local sin login.

## GitHub

Antes de publicar:

1. Ejecuta `npm run verify:publication`.
2. Revisa `git status --short`.
3. Asegúrate de que no aparecen SQLite, backups, `.env`, archivos de importación del usuario ni logs.
4. Revisa [docs/GITHUB_RELEASE.md](GITHUB_RELEASE.md).

## SECURITY.md

`SECURITY.md` es el documento estándar de GitHub para notas de seguridad. Este documento explica la parte práctica de privacidad local y publicación segura.
