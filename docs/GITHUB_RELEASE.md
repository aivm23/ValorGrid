# GitHub Release

ValorGrid Community se publica con tags `vX.Y.Z`. Cada tag debe coincidir con la versión de `package.json`.

## Artefactos esperados

- `ValorGrid-Setup-X.Y.Z-x64.exe`: instalador Windows.
- `SHA256SUMS.txt`: checksums SHA-256 de los artefactos de release.
- Digests SHA-256 visibles en los assets de GitHub Releases.
- `ghcr.io/aivm23/valorgrid:vX.Y.Z`: imagen Docker versionada publicada por el workflow Docker.
- `ghcr.io/aivm23/valorgrid:latest`: etiqueta Docker de uso personal.

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
   git check-ignore portfolio.sqlite *.sqlite-wal *.sqlite-shm portfolio.loadtest.sqlite .backups dist
   ```

## Instalador Windows

La configuración Electron/NSIS vive en `package.json` y usa estos assets versionados:

- `assets/brand/valorgrid-logo.ico`: icono del instalador, desinstalador, cabecera y accesos directos.
- `desktop/installer/installer.nsh`: macro NSIS incluida por `package.json` para recrear los accesos directos de escritorio y menu Inicio con el icono de ValorGrid.

`desktop/installer/installer.nsh` debe estar en git. GitHub Actions construye el `.exe` desde un checkout limpio; si el archivo falta, la release no puede aplicar la personalizacion NSIS y el instalador no queda reproducible desde el repositorio.

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
   - `Release`: construye el instalador Windows, genera checksums, crea attestation y publica GitHub Release.
   - `Docker`: publica la imagen GHCR versionada.

5. Verificar que la release contiene el instalador, `SHA256SUMS.txt` y notas de release.
6. Verificar que GHCR contiene la imagen `vX.Y.Z`.
7. Verificar que el README enlaza correctamente a `/releases/latest`, `docs/FIRST_STEPS.md`, `docs/IMPORT_EXCEL.md`, `docs/FAQ.md` y `docs/LEGAL_NOTICE.md`.

## Upgrade

Antes de actualizar, crear un backup desde la app o con:

```bash
npm run db:backup
```

En Windows, descargar el nuevo instalador desde GitHub Releases y ejecutarlo. La instalación conserva los datos locales de usuario; la DB de escritorio vive fuera del directorio instalado.

En Docker/CasaOS, comprobar que `compose.casaos.yml` usa `ghcr.io/aivm23/valorgrid:latest`, que `x-casaos.version` coincide con `package.json`, arrancar y comprobar `/api/health`.

## Rollback

Windows:

1. Cerrar ValorGrid.
2. Desinstalar la versión actual si es necesario.
3. Instalar el `.exe` de la release anterior.
4. Si hay perdida o corrupción de datos, restaurar un backup SQLite manualmente.

Docker/CasaOS:

1. Detener la app.
2. Volver al tag anterior.
3. Arrancar y comprobar `/api/health`.
4. Restaurar backup manualmente solo si es necesario.

## Checksums

Descargar `SHA256SUMS.txt` junto al instalador. En Windows:

```powershell
Get-FileHash .\ValorGrid-Setup-X.Y.Z-x64.exe -Algorithm SHA256
```

El hash debe coincidir con la linea correspondiente en `SHA256SUMS.txt`.

## SmartScreen

Windows SmartScreen puede mostrar aviso en apps nuevas o sin firma de código con reputacion acumulada. No publiques instaladores por canales paralelos; la fuente oficial debe ser GitHub Releases o una futura landing que redirija a GitHub Releases.

## Documentación de usuario

Cada release estable debe mantener actualizados:

- `README.md`: entrada pública principal.
- `docs/FIRST_STEPS.md`: primeros pasos para usuario no técnico.
- `docs/IMPORT_EXCEL.md`: plantilla Excel y errores comunes.
- `docs/FAQ.md`: preguntas frecuentes.
- `docs/LEGAL_NOTICE.md`: aviso legal ampliado.
