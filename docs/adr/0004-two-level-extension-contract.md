# ADR 0004: Contrato de extensiones en dos niveles (Superficie Community)

- Estado: aceptada
- Fecha: 2026-07-28

## Contexto

ValorGrid Community necesita un mecanismo que permita a ediciones profesionales ampliar la aplicación sin modificar el código fuente de Community. Las extensiones pueden añadir endpoints HTTP, modificar el comportamiento de servicios existentes o registrar nuevas fuentes de importación.

Community debe definir un contrato de extensión estable para que las ediciones privadas puedan integrarse sin riesgo de rotura en cada actualización, pero sin exponer detalles de implementación privados en la documentación pública.

## Decisión

El contrato de extensiones se organiza en dos niveles:

### Nivel 1: Contrato público estable (Community)

La superficie de extensión que Community documenta como estable incluye:

1. **Catálogo de fuentes de importación (`GET /api/import/sources`)**: las ediciones profesionales pueden aparecer en el catálogo con `edition: "professional"` y `available: false` en Community, `available: true` cuando Professional está instalado. El formato del catálogo es público y estable.
2. **Estado de capacidades (`GET /api/extensions`)**: Community expone un manifiesto público de capacidades por edición. Las ediciones privadas pueden registrar capacidades adicionales sin publicar sus contratos internos.
3. **Preferencias de UI (`GET/PUT /api/preferences/ui`)**: Community devuelve un objeto vacío con `editable: false`. Las ediciones profesionales pueden registrar una implementación privada que acepte payloads sin cambiar el contrato público.
4. **Endpoints de retorno `403`**: los endpoints que Community reserva para ediciones profesionales devuelven `403` con mensaje `Feature available in Professional Edition`. El código de estado y el mensaje son parte del contrato público.
5. **Registro de extensiones en arranque**: `platform/extensions-runtime.js` inicializa capacidades opcionales por edición antes de montar rutas HTTP. Las ediciones privadas pueden extender el comportamiento registrando implementaciones en la tabla de extensiones en tiempo de arranque, sin modificar el código de Community.

### Nivel 2: Contrato privado (Professional)

Los detalles de implementación de cada extensión profesional (adaptadores de broker, parsers específicos, lógica de importación, pruebas y datos de ejemplo) son privados y no se documentan en el repositorio Community. Community solo referencia la existencia de estas capacidades mediante los mecanismos del nivel 1.

## Consecuencias

- Community puede evolucionar independientemente sin romper integraciones profesionales que respeten el contrato público.
- Las ediciones profesionales no necesitan bifurcar el repositorio Community para añadir funcionalidad.
- La documentación pública de Community se mantiene limpia de detalles de implementación privados.
- Los tests de Community solo cubren el comportamiento Community; las ediciones profesionales mantienen sus propias pruebas.
- `npm run verify:publication` bloquea la publicación de contratos privados en el repositorio Community.

## Referencias

- `apps/server/src/platform/extensions.js`
- `apps/server/src/platform/extensions-runtime.js`
- `apps/web/src/extensions.js`
- `docs/API.md`
- `docs/EDITIONS.md`
- `test/privacy.test.js`
- `scripts/verify-publication.js`
