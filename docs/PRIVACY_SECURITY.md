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

1. La ruta activa configurada explícitamente, si existe.
2. `local/valorgrid/data/portfolio.sqlite` por defecto.

En la app de escritorio, la base de datos y los backups se resuelven automáticamente dentro de la carpeta privada de datos de la aplicación.

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

## Conexiones de red salientes

ValorGrid puede establecer conexiones de red salientes únicamente para:

- **Yahoo Finance** (`query1.finance.yahoo.com`, `query2.finance.yahoo.com`): consulta de precios de mercado de los símbolos configurados por el usuario. No se envía el ledger completo, solo el símbolo solicitado.
- **Alpha Vantage** (`www.alphavantage.co`): consulta de precios de commodities cuando el usuario ha configurado una clave API.
- **GitHub API** (`api.github.com`): consulta de nuevas versiones en la sección de Administración (solo el tag de la última release, sin datos de cartera).

No existen conexiones salientes para telemetría, analíticas, publicidad ni sincronización de cartera con servicios externos.

## Cifrado

ValorGrid **no aplica cifrado propio** a la base de datos SQLite ni a los backups. La protección de datos en reposo depende del cifrado del sistema de archivos del sistema operativo (BitLocker, FileVault, LUKS) o del volumen del contenedor.

Las conexiones a proveedores externos (Yahoo Finance, Alpha Vantage, GitHub API) usan HTTPS cuando el proveedor lo soporta. La app no impone ni gestiona certificados TLS para el tráfico HTTP entrante; el administrador del despliegue es responsable de configurar un proxy inverso con HTTPS si se expone la app fuera de localhost.

## Amenazas de equipo y red

- **Acceso local al equipo**: cualquier usuario con acceso al sistema de archivos puede leer la base de datos SQLite directamente. No hay protección por contraseña de la DB.
- **Red local**: la app escucha en `127.0.0.1` por defecto. En Docker/CasaOS/Umbrel el listener se expone en `0.0.0.0` dentro del contenedor; la protección recae en el aislamiento de red del despliegue y en Basic Auth opcional.
- **Exposición a Internet**: no exponer el puerto HTTP directamente sin HTTPS y autenticación. La app no implementa rate limiting, WAF ni detección de intrusiones.
- **Proveedores externos**: Yahoo Finance y Alpha Vantage pueden registrar las consultas de símbolos. No se envían datos de cartera del usuario.

## Login monousuario

La autenticación protege toda la app cuando está configurada. La contraseña no se guarda en SQLite ni se muestra en la API; debe gestionarse como secreto del despliegue. Si no se configura, ValorGrid mantiene el modo local sin login.

## GitHub

Antes de publicar:

1. Ejecuta `npm run verify:publication`.
2. Revisa `git status --short`.
3. Asegúrate de que no aparecen SQLite, backups, `.env`, archivos de importación del usuario ni logs.
4. Revisa [docs/GITHUB_RELEASE.md](GITHUB_RELEASE.md).

## SECURITY.md

`SECURITY.md` es el documento estándar de GitHub para notas de seguridad. Este documento explica la parte práctica de privacidad local y publicación segura.
