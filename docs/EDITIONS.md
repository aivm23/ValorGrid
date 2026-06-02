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
- Toda importacion termina normalizada en el ledger comun de `transactions`.

## ValorGrid Pro/Enterprise

Pro/Enterprise contiene adaptadores privados para fuentes concretas de broker. Ese codigo vive en un repositorio privado separado y no debe subirse al GitHub publico de Community.

Reglas:

- El repositorio privado se gestiona mediante GitHub CLI cuando el entorno tenga `gh` instalado y autenticado.
- El nombre operativo recomendado del repositorio privado es `ValorGrid-PRO`.
- Los adaptadores privados deben convertir cada fuente al mismo payload normalizado que consume Community.
- La semantica financiera final debe ser identica a `docs/FINANCIAL_SEMANTICS.md`.
- Las pruebas privadas deben cubrir parseo, normalizacion, FX, deduplicacion, ventas, comisiones, rollback y errores de formato.
- La documentacion privada debe replicar la estructura publica: API de adaptadores, modelo de datos, testing, privacidad y checklist de release.

## Frontera Tecnica

Community no carga codigo privado por defecto. La integracion Pro/Enterprise debe hacerse como modulo opcional o paquete privado, manteniendo estas invariantes:

- Sin cambios obligatorios en endpoints HTTP Community.
- Sin dependencias privadas en `package.json` publico.
- Sin fixtures privados en `test/`, `samples/`, `docs/` ni `src/`.
- Sin nombres de fuentes privadas en selects, mensajes o contratos publicos.
- Sin credenciales, rutas locales, exportaciones reales ni datos de cartera.

## Publicacion

Antes de publicar Community:

```powershell
npm run verify:publication
```

La verificacion de publicacion y `test/privacy.test.js` deben fallar si aparecen nombres de adaptadores privados conocidos, muestras privadas, rutas locales o datos de cartera.

## ESM

La decision actual se mantiene: backend CommonJS y frontend ESM nativo del navegador. Migrar el backend a ESM no es requisito para separar Community y Pro/Enterprise.

Una migracion ESM solo deberia abrirse como fase independiente si aporta una ventaja concreta: empaquetado TS real, dual packages, plugin loading formal o distribucion npm privada. Mientras la app siga siendo monolito modular local con Node 24, CommonJS reduce riesgo operativo.
