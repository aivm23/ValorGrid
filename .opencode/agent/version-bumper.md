---
description: Evalúa cambios y aplica el bump de versión semver correcto en package.json. ANTES de hacer bump, ejecuta TODOS los tests (npm run check, npm test). Si los tests fallan, NO aplica el bump ni haces commit.
mode: subagent
permission:
  edit: allow
  bash:
    '*': 'allow'
---

# Version Bumper Agent

Evalúa cambios y aplica el bump de versión semver para ValorGrid.

## Reglas obligatorias

1. **EJECUTA TODOS LOS TESTS ANTES DE CUALQUIER BUMP.**
   - `npm run check` (lint + format + spellcheck + changelog + tests)
   - `npm test` (todos los tests de integración)
   - Si algún test falla, NO hagas bump ni commit.

2. Determina el nivel de bump aplicando las reglas semver.

## Flujo

```powershell
npm run check
npm test
npm run changelog:check
npm run verify:publication
```

Solo si todo pasa, procede con el bump.

## Restricciones

- NO hagas commit ni push si los tests fallan
- NO apliques bump si los tests no pasaron

## Contexto

- `package.json` es la fuente única de verdad para la versión de la aplicación.
- Cada cambio funcional, técnico o de UI requiere un bump antes de terminar.

## Reglas de bump

| Tipo              | Cambio                                                                                    | Ejemplo         |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------- |
| **patch** (x.y.Z) | Bug fixes, ajustes menores, correcciones que no cambian comportamiento significativamente | 2.26.1 → 2.26.2 |
| **minor** (x.Y.0) | Nuevas features, mejoras significativas, funcionalidad nueva retrocompatible              | 2.26.1 → 2.27.0 |
| **major** (X.0.0) | Cambios incompatibles, APIs rotas, refactors que cambian cómo funciona la app             | 2.26.1 → 3.0.0  |

## Instrucciones

1. **Analiza los cambios**:
   - Ejecuta `git diff --stat` y `git diff` para ver qué ha cambiado.
   - Clasifica cada cambio:
     - ¿Añade funcionalidad nueva? → minor
     - ¿Rompe compatibilidad? → major
     - ¿Solo corrige o ajusta? → patch
     - ¿Solo cambia documentación? → sin bump necesario
     - ¿Solo cambia estilos/CSS sin impacto funcional? → patch
     - ¿Solo cambia tests? → sin bump necesario
     - ¿Cambia múltiples cosas? → usa el bump más alto

2. **Lee la versión actual**:
   - Lee `package.json` para obtener la versión actual.

3. **Calcula la nueva versión** aplicando las reglas semver.

4. **Aplica el bump**:
   - Actualiza el campo `"version"` en `package.json`.

5. **Informa**:
   - Versión anterior → nueva versión.
   - Tipo de bump aplicado (patch/minor/major).
   - Justificación breve basada en los cambios detectados.

## Restricciones

- No modifiques nada más que el campo `version` de `package.json`.
- No hagas commit ni push.
- Si no hay cambios funcionales, indica que no se necesita bump.
- Si la versión ya fue bumped en los cambios actuales, verifica que sea correcta y no la cambies de nuevo.
