# ValorGrid Editions

Este documento fija la frontera entre el repositorio público Community y el código privado Pro/Enterprise.

## ValorGrid Community

Community es la edición pública de ValorGrid. Su importador solo acepta la plantilla Excel oficial:

```text
valorgrid-xlsx
```

Reglas:

- La plantilla se descarga desde `GET /api/import/template.xlsx`.
- La hoja importable es `Movimientos`.
- El formato público no incluye adaptadores concretos de broker.
- No se publican muestras de exportaciones privadas.
- No se publican fixtures, tests, nombres de fuente ni parser logic de brokers concretos.
- Las muestras sintéticas en `samples/valorgrid-template/` usan tickers reales del S&P 500 pero datos de movimientos ficticios; no contienen datos de broker.
- Toda importación termina normalizada en el ledger comun de `transactions`.

## ValorGrid Pro/Enterprise

Pro/Enterprise contiene adaptadores privados para fuentes concretas de broker. Ese código vive fuera del repositorio público Community y no debe subirse a GitHub público.

Reglas:

- El repositorio o paquete privado se gestiona y documenta solo en el entorno privado.
- En desarrollo local debe vivir fuera del repositorio Community, nunca dentro de carpetas de imports ni de fixtures públicos.
- Los adaptadores privados deben convertir cada fuente al mismo payload normalizado que consume Community.
- La semántica financiera final debe ser idéntica a `docs/FINANCIAL_SEMANTICS.md`.
- Las pruebas privadas deben cubrir parseo, normalización, FX, deduplicación, ventas, comisiones, rollback y errores de formato.
- La documentación privada debe replicar la estructura pública: API de adaptadores, modelo de datos, testing, privacidad y checklist de release.

## Frontera técnica

Community no carga código privado por defecto. Cualquier integración Pro/Enterprise debe hacerse como módulo opcional o paquete privado, manteniendo estas invariantes:

- Sin cambios obligatorios en endpoints HTTP Community.
- Sin dependencias privadas en `package.json` público.
- Sin fixtures privados en `test/`, `samples/`, `docs/` ni `src/`.
- Sin nombres de fuentes privadas en parser, servicios, endpoints, fixtures, docs técnicas o contratos públicos.
- Se permite nombrar integraciones Pro en la UI pública solo como teaser comercial, siempre deshabilitadas en Community y sin publicar contratos técnicos privados.
- Sin credenciales, rutas locales, exportaciones reales ni datos de cartera.
- La personalización de métricas de Operativa (`PUT /api/preferences/ui`) está deshabilitada en Community y solo activa en Professional Edition. Community muestra el selector como teaser bloqueado con el mensaje "Personalización disponible en Professional Edition".
- La personalización de filtros de marcadores del gráfico Histórico (`historyEventFilters` en `PUT /api/preferences/ui`) también es exclusiva de Professional Edition. Community muestra los controles bloqueados con el mismo banner de Professional Edition.

## Desarrollo Local

Reglas para no mezclar Community y Pro:

- `imports/` queda reservado a archivos del usuario y está ignorado por Git.
- El código privado no debe clonarse dentro de `src/`, `test/`, `samples/`, `docs/`, `imports/` ni `data/`.
- El runtime público solo reconoce `VALORGRID_EDITION` como etiqueta de edición (`community` o `professional`); la carga de adaptadores privados no forma parte del contrato público Community.
- Las variables, rutas y comandos de carga Pro deben documentarse en la documentación privada, no en este repositorio.

## Publicación

Antes de publicar Community:

```bash
npm run verify:publication
```

La verificacion de publicación y `test/privacy.test.js` deben fallar si aparecen nombres de adaptadores privados conocidos, muestras privadas, rutas locales o datos de cartera.

## ESM

La decision actual se mantiene: backend CommonJS y frontend ESM nativo del navegador. Migrar el backend a ESM no es requisito para separar Community y Pro/Enterprise.

Una migracion ESM solo deberia abrirse como fase independiente si aporta una ventaja concreta: empaquetado TS real, dual packages, plugin loading formal o distribucion npm privada. Mientras la app siga siendo monolito modular local con Node 24, CommonJS reduce riesgo operativo.
