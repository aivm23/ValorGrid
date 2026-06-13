---
description: Verificación pre-push: tests, privacidad, documentación y versión
---

Actúa como asistente de verificación pre-push para ValorGrid.

Objetivo:
ejecutar todas las comprobaciones necesarias antes de un push para asegurar que el código es correcto, seguro y está completo.

Argumentos recibidos:
$ARGUMENTS

Instrucciones obligatorias:

1. Ejecuta los tests:
   - Ejecuta `npm test`.
   - Si algún test falla, detente e informa. No continúes con los siguientes pasos.

2. Verifica privacidad:
   - Ejecuta `npm run verify:publication`.
   - Si detecta datos privados o archivos que no deberían publicarse, detente e informa.

3. Verifica sincronización de documentación:
   - Compara los endpoints en `src/routes.js` con los documentados en `docs/API.md`.
   - Compara las tablas en `src/schema.js` con las documentadas en `docs/DATA_MODEL.md`.
   - Compara los módulos en `src/` y `client/` con los documentados en `docs/ARCHITECTURE.md`.
   - Si hay discrepancias, lista cada una claramente.

4. Verifica versión:
   - Lee `git diff --name-only HEAD~1` o `git diff --cached --name-only` para ver archivos cambiados.
   - Si hay cambios funcionales en `src/`, `client/` o `index.html` y `package.json` no está entre los archivos modificados, advierte que falta el bump de versión.
   - Verifica que `deploy/docker/compose.casaos.yml` tiene `x-casaos.version` e `image: ...:vX.Y.Z` coincidiendo con `package.json`. Si usa `:latest`, advierte error.

5. Verifica estado Git:
   - Ejecuta `git status --short`.
   - Si hay archivos sin commitear, indícalo.
   - Si hay archivos que no deberían commitearse (\*.sqlite, .env, data/, .backups/), advierte.

6. Resultado final:
   - Muestra un resumen con el estado de cada verificación:
     ```
     Tests:        OK / FAIL (N fallos)
     Privacidad:   OK / FAIL
     Docs sync:    OK / N discrepancias
     Versión:      OK / FALTA BUMP / DESINCRONIZADA
     Git status:   LIMPIO / N archivos pendientes
     ```
   - Si todo está OK, indica que el proyecto está listo para push y sugiere ejecutar `/save` para commitear y pushear.
   - Si algo falla, indica exactamente qué hay que resolver antes de hacer push.

7. Integración con `/save`:
   - Si el usuario ejecutó `/check` antes de `/save` y todo pasó, `/save` puede proceder con confianza.
   - Si `/check` detectó errores, `/save` debe negarse a pushear hasta que se resuelvan.
   - Recomienda al usuario: "Ejecuta `/save` para commitear y pushear" solo si todo está OK.

Restricciones:

- No modifiques código ni documentación.
- No hagas commit ni push.
- Solo verifica e informa.
