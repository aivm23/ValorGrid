# Ediciones de ValorGrid

Este repositorio contiene solo ValorGrid Community. La documentación pública describe sus contratos y no detalla la implementación comercial.

## Community

Community es la edición pública y local-first de ValorGrid, distribuida bajo `MPL-2.0` para las versiones cubiertas por la licencia. Incluye movimientos manuales, la plantilla Excel oficial, dashboard, histórico, backups y despliegues de escritorio, Docker, CasaOS y Umbrel.

La plantilla pública se descarga desde `GET /api/import/template.xlsx`, usa la hoja `Movimientos` y se normaliza en `transactions`. Las muestras públicas son sintéticas; no se publican exportaciones reales de broker.

La licencia de código no concede derechos sobre el nombre, logotipo, iconos, identidad visual ni materiales promocionales. Consulta `NOTICE.md` y `TRADEMARKS.md`.

## Professional / Enterprise

Pro/Enterprise puede ofrecer conectores de importación y capacidades comerciales adicionales bajo condiciones propietarias. Su código, documentación operativa, pruebas y datos de ejemplo viven fuera de este repositorio público.

Si Pro/Enterprise necesita compatibilidad temporal de schema con una versión Community concreta, esa capa pertenece a la distribución no pública y debe ser retirada o formalizada allí. Community mantiene como contrato público `apps/server/src/schema.js` para instalaciones limpias y los SQL versionados de `deploy/sql/` para actualizaciones explícitas.

## Frontera pública

- Community puede mostrar un teaser genérico de Professional Edition, siempre deshabilitado cuando la capacidad no está disponible.
- No se publican identificadores de adaptadores privados, contratos de parser, nombres de fuentes, fixtures, exportaciones de broker, secretos, rutas locales ni detalles de carga.
- Las integraciones privadas no se declaran como dependencias de Community ni requieren cambios en su contrato HTTP público.
- Las reglas financieras publicadas en [FINANCIAL_SEMANTICS.md](FINANCIAL_SEMANTICS.md) son el contrato común para cualquier dato que llegue al ledger.

## Publicación

Antes de publicar Community, ejecutar:

```bash
npm run verify:publication
```

La verificación y `test/privacy.test.js` bloquean datos privados y superficie profesional no publicable.
