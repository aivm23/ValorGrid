# Despliegue Umbrel

ValorGrid tiene un paquete Umbrel independiente de los ficheros Docker y CasaOS:

- `deploy/umbrel/official/valorgrid/`: paquete preparado para `getumbrel/umbrel-apps`.
- `deploy/umbrel/community-store/`: tienda comunitaria local con id `valorgrid-store`.
- `scripts/update-umbrel-package.js`: sincroniza versión e imagen en ambos paquetes.

## Decisiones del paquete

- El contenedor usa la misma imagen GHCR que Docker/CasaOS, pero fijada por tag versionado y digest SHA-256.
- La Web UI se publica por `app_proxy`; el compose de Umbrel no declara `ports:`.
- La base SQLite, los backups internos y la configuración local viven en el almacenamiento persistente de Umbrel.
- Umbrel aporta autenticación delante de la app.
- La clave de Alpha Vantage puede guardarse desde la UI dentro de los datos persistentes de la aplicación.
- La ficha no promete que ningún dato salga del servidor: los movimientos y configuración son locales, pero las consultas de precios se envían al proveedor de mercado configurado.

## Sincronizar el paquete

Después de cambiar `package.json`, ejecuta:

```bash
npm run umbrel:sync
```

Esto actualiza:

- `deploy/umbrel/official/valorgrid/umbrel-app.yml`
- `deploy/umbrel/official/valorgrid/docker-compose.yml`
- `deploy/umbrel/community-store/valorgrid-store-valorgrid/umbrel-app.yml`
- `deploy/umbrel/community-store/valorgrid-store-valorgrid/docker-compose.yml`

Sin digest real publicado, el compose queda con el placeholder `sha256:000...000`. Es válido para mantener la estructura local sincronizada, pero no sirve para enviar a la tienda oficial.

Cuando GHCR ya tenga la imagen de la versión:

```bash
npm run umbrel:sync -- --digest sha256:<digest-multiarch>
npm run umbrel:check
```

El digest debe ser el del índice multiarch de `ghcr.io/aivm23/valorgrid:vX.Y.Z`, no el digest de una sola arquitectura.

## Community App Store

Para probar sin esperar revisión oficial:

1. Crear un repositorio desde `getumbrel/umbrel-community-app-store`.
2. Copiar el contenido de `deploy/umbrel/community-store/` a ese repositorio.
3. Confirmar que `umbrel-app-store.yml` mantiene:

   ```yaml
   id: valorgrid-store
   name: ValorGrid Community App Store
   ```

4. Publicar el repositorio.
5. Añadir su URL desde la interfaz de umbrelOS.
6. Instalar `valorgrid-store-valorgrid`.

El id de la app comunitaria debe mantener el prefijo del store: `valorgrid-store-valorgrid`.

## Tienda oficial

Para preparar el PR oficial:

1. Hacer fork de `getumbrel/umbrel-apps`.
2. Copiar `deploy/umbrel/official/valorgrid/` al directorio raíz del fork.
3. Ejecutar en el fork:

   ```bash
   npm run lint:apps -- valorgrid --check-images
   git diff --check
   ```

4. Instalar y probar en umbrelOS real con `umbrel-test-app`.
5. Adjuntar icono y capturas en la pull request; no añadir assets binarios al paquete oficial salvo que Umbrel lo pida.

## Pruebas manuales obligatorias

- Instalación limpia desde Umbrel y apertura desde el icono.
- Crear cartera, instrumentos, compras y ventas.
- Importar la plantilla XLSX de ValorGrid.
- Consultar precios de mercado.
- Crear backup desde la UI.
- Reiniciar la app y umbrelOS; comprobar que DB, backups y configuración persisten.
- Actualizar desde una versión anterior con datos existentes.
- Restaurar backup de Umbrel y comprobar `/api/health`.
- Probar `linux/amd64` y `linux/arm64` antes de pedir revisión oficial.

## Validación local

Antes de publicar o abrir PR:

```bash
npm run check
npm run typecheck
npm run verify:publication
npm run audit:release
```

`verify:publication` falla si el paquete Umbrel usa `latest`, `build:`, `ports:`, socket Docker, volúmenes nombrados o rutas persistentes fuera del directorio de datos de la aplicación. Mientras el digest sea placeholder, emite un warning; antes del envío oficial debe reemplazarse por el digest real.

## Fuentes oficiales

- [Umbrel app packaging skill](https://github.com/getumbrel/umbrel-apps/blob/master/.claude/skills/umbrel-package-app/SKILL.md)
- [Umbrel Community App Store template](https://github.com/getumbrel/umbrel-community-app-store)
