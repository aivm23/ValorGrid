# ValorGrid Editions

Este documento fija la frontera entre el repositorio publico Community y el codigo privado Pro/Enterprise.

## ValorGrid Community

Community es la edicion publica de ValorGrid. Su importador solo acepta la plantilla Excel oficial:

```text
valorgrid-xlsx
```

Reglas:

- La plantilla se descarga desde `GET /api/import/template.xlsx`.
- La hoja importable es `Movimientos`.
- El formato publico no incluye adaptadores concretos de broker.
- No se publican muestras de exportaciones privadas.
- No se publican fixtures, tests, nombres de fuente ni parser logic de brokers concretos.
- Las muestras sintéticas en `samples/valorgrid-template/` usan tickers reales del S&P 500 pero datos de movimientos ficticios; no contienen datos de broker.
- Toda importacion termina normalizada en el ledger comun de `transactions`.

## ValorGrid Pro/Enterprise

Pro/Enterprise contiene adaptadores privados para fuentes concretas de broker. Ese codigo vive fuera del repositorio publico Community y no debe subirse a GitHub publico.

Reglas:

- El repositorio o paquete privado se gestiona y documenta solo en el entorno privado.
- En desarrollo local debe vivir fuera del repositorio Community, nunca dentro de carpetas de imports ni de fixtures publicos.
- Los adaptadores privados deben convertir cada fuente al mismo payload normalizado que consume Community.
- La semantica financiera final debe ser identica a `docs/FINANCIAL_SEMANTICS.md`.
- Las pruebas privadas deben cubrir parseo, normalizacion, FX, deduplicacion, ventas, comisiones, rollback y errores de formato.
- La documentacion privada debe replicar la estructura publica: API de adaptadores, modelo de datos, testing, privacidad y checklist de release.

## Frontera Tecnica

Community no carga codigo privado por defecto. Cualquier integracion Pro/Enterprise debe hacerse como modulo opcional o paquete privado, manteniendo estas invariantes:

- Sin cambios obligatorios en endpoints HTTP Community.
- Sin dependencias privadas en `package.json` publico.
- Sin fixtures privados en `test/`, `samples/`, `docs/` ni `src/`.
- Sin nombres de fuentes privadas en parser, servicios, endpoints, fixtures, docs tecnicas o contratos publicos.
- Se permite nombrar integraciones Pro en la UI publica solo como teaser comercial, siempre deshabilitadas en Community y sin publicar contratos tecnicos privados.
- Sin credenciales, rutas locales, exportaciones reales ni datos de cartera.

## Desarrollo Local

Reglas para no mezclar Community y Pro:

- `imports/` queda reservado a archivos del usuario y esta ignorado por Git.
- El codigo privado no debe clonarse dentro de `src/`, `test/`, `samples/`, `docs/`, `imports/` ni `data/`.
- El runtime publico solo reconoce `VALORGRID_EDITION` como etiqueta de edicion (`community` o `professional`); la carga de adaptadores privados no forma parte del contrato publico Community.
- Las variables, rutas y comandos de carga Pro deben documentarse en la documentacion privada, no en este repositorio.

## Publicacion

Antes de publicar Community:

```powershell
npm run verify:publication
```

La verificacion de publicacion y `test/privacy.test.js` deben fallar si aparecen nombres de adaptadores privados conocidos, muestras privadas, rutas locales o datos de cartera.

## ESM

La decision actual se mantiene: backend CommonJS y frontend ESM nativo del navegador. Migrar el backend a ESM no es requisito para separar Community y Pro/Enterprise.

Una migracion ESM solo deberia abrirse como fase independiente si aporta una ventaja concreta: empaquetado TS real, dual packages, plugin loading formal o distribucion npm privada. Mientras la app siga siendo monolito modular local con Node 24, CommonJS reduce riesgo operativo.
