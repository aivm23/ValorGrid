# GitHub Release

ValorGrid Community se publica con tags `vX.Y.Z`. Cada tag debe coincidir con la versión de `package.json`.

## Artefactos esperados

- `ValorGrid-Setup-X.Y.Z-x64.exe`: instalador Windows versionado.
- `ValorGrid-Setup-x64.exe`: alias estable del instalador Windows.
- `ValorGrid-Linux-x64.AppImage`: paquete portable Linux x64.
- `ValorGrid-Linux-x64.deb`: paquete instalable Debian/Ubuntu x64.
- `ValorGrid-macOS-x64.dmg`: imagen macOS Intel x64.
- `ValorGrid-macOS-arm64.dmg`: imagen macOS Apple Silicon.
- `SHA256SUMS.txt`: checksums SHA-256 de los artefactos de release.
- Digests SHA-256 visibles en los assets de GitHub Releases.
- `ghcr.io/aivm23/valorgrid:vX.Y.Z`: imagen Docker versionada publicada por el workflow Docker.
- `ghcr.io/aivm23/valorgrid:latest`: etiqueta Docker de uso personal (no usar en CasaOS; allí usar siempre el tag versionado).

La release no publica bases SQLite, backups, `.env`, ficheros de importación del usuario ni artefactos privados.

## Preparacion local

1. Crear backup local si existe una DB real:

   ```powershell
   npm run db:backup
   ```

2. Actualizar `CHANGELOG.md` con la nueva versión:

   ```powershell
   npm run changelog:update
   ```

3. Confirmar que `package.json` contiene la versión final.
4. Ejecutar:

   ```powershell
   npm run changelog:check
   npm run typecheck
   npm run lint
   npm run format:check
   npm run docs:spellcheck
   npm test
   npm run verify:publication
   npm run seed:demo
   ```

5. Revisar `git status --short`.
6. Confirmar que Git ignora datos privados:

   ```powershell
   git check-ignore portfolio.sqlite *.sqlite-wal *.sqlite-shm local/ .backups dist
   ```

## Instaladores de escritorio

La configuración Electron vive en `package.json`, `apps/desktop/electron-builder.config.cjs` y scripts de release bajo `scripts/`.

Windows usa NSIS y estos assets versionados:

- `assets/brand/valorgrid-logo.ico`: icono del instalador, desinstalador, cabecera y accesos directos.
- `apps/desktop/installer/installer.nsh`: macro NSIS incluida por `apps/desktop/electron-builder.config.cjs` para recrear los accesos directos de escritorio y menu Inicio con el icono de ValorGrid.

`apps/desktop/installer/installer.nsh` debe estar en git. GitHub Actions construye el `.exe` desde un checkout limpio; si el archivo falta, la release no puede aplicar la personalizacion NSIS y el instalador no queda reproducible desde el repositorio.

Linux publica `AppImage` y `.deb` desde el runner `ubuntu-latest`.

macOS publica DMG x64 y arm64 desde el runner `macos-latest`. En esta fase los builds son unsigned (`identity: null`) y no se notarizan; Gatekeeper puede pedir aprobacion manual en el primer arranque. La firma/notarizacion requiere Apple Developer ID y secretos de GitHub, y debe tratarse como fase independiente.

## Publicación

1. Crear un commit con el cambio de versión, changelog, docs y código.
2. Crear un tag limpio:

   ```powershell
   git tag vX.Y.Z
   ```

3. Subir commit y tag:

   ```powershell
   git push
   git push origin vX.Y.Z
   ```

4. Esperar a que terminen:
   - `Release`: valida el tag, construye instaladores Windows/Linux/macOS, genera checksums, crea attestation y publica GitHub Release.
   - `Docker`: publica la imagen GHCR versionada.

5. Verificar que la release contiene los instaladores de escritorio, `SHA256SUMS.txt` y notas de release.
6. Verificar que GHCR contiene la imagen `vX.Y.Z`.
7. Verificar que el README enlaza correctamente a `/releases/latest`, `docs/FIRST_STEPS.md`, `docs/IMPORT_EXCEL.md`, `docs/FAQ.md` y `docs/LEGAL_NOTICE.md`.

## Upgrade

Antes de actualizar, crear un backup desde la app o con:

```bash
npm run db:backup
```

En escritorio, descargar el nuevo instalador desde GitHub Releases y ejecutarlo. La instalación conserva los datos locales de usuario; la DB de escritorio vive fuera del directorio instalado.

En Docker/CasaOS, comprobar que `deploy/docker/compose.casaos.yml` usa `ghcr.io/aivm23/valorgrid:vX.Y.Z` (tag versionado, nunca `latest`), que `x-casaos.version` coincide con `package.json`, arrancar y comprobar `/api/health`.

## Rollback

Escritorio:

1. Cerrar ValorGrid.
2. Desinstalar la versión actual si es necesario.
3. Instalar el artefacto de la release anterior para la misma plataforma.
4. Si hay perdida o corrupción de datos, reemplazar manualmente la base de datos por un backup SQLite.

Docker/CasaOS:

1. Detener la app.
2. Volver al tag anterior en `deploy/docker/compose.casaos.yml`.
3. Arrancar y comprobar `/api/health`.
4. Restaurar manualmente la base de datos desde un backup solo si es necesario.

## Checksums

Descargar `SHA256SUMS.txt` junto al instalador. En Windows:

```powershell
Get-FileHash .\ValorGrid-Setup-X.Y.Z-x64.exe -Algorithm SHA256
```

En Linux:

```bash
sha256sum ./ValorGrid-Linux-x64.AppImage
sha256sum ./ValorGrid-Linux-x64.deb
```

En macOS:

```bash
shasum -a 256 ./ValorGrid-macOS-arm64.dmg
shasum -a 256 ./ValorGrid-macOS-x64.dmg
```

El hash debe coincidir con la linea correspondiente en `SHA256SUMS.txt`.

## Avisos del sistema operativo

Windows SmartScreen puede mostrar aviso en apps nuevas o sin firma de código con reputacion acumulada. No publiques instaladores por canales paralelos; la fuente oficial debe ser GitHub Releases o una futura landing que redirija a GitHub Releases.

macOS Gatekeeper puede mostrar aviso porque los DMG se publican sin firma/notarizacion en esta fase. No publiques builds macOS fuera de GitHub Releases ni prometas notarizacion hasta que existan certificados y secretos configurados en CI.

## Documentación de usuario

Cada release estable debe mantener actualizados:

- `README.md`: entrada pública principal.
- `docs/FIRST_STEPS.md`: primeros pasos para usuario no técnico.
- `docs/IMPORT_EXCEL.md`: plantilla Excel y errores comunes.
- `docs/FAQ.md`: preguntas frecuentes.
- `docs/LEGAL_NOTICE.md`: aviso legal ampliado.
