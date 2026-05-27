---
description: Gestiona Git: revisa cambios, genera commit correcto y hace push
agent: code
---

Actúa como asistente técnico de control de versiones Git para este proyecto.

Objetivo:
revisar el estado real del repositorio, entender los cambios, agruparlos correctamente, crear un mensaje de commit siguiendo el patrón del proyecto y ejecutar add, commit y push cuando sea seguro.

Argumentos recibidos:
$ARGUMENTS

Contexto Git actual:

Estado:
!`git status --short --branch`

Últimos commits:
!`git log --oneline -8`

Diff sin staged:
!`git diff --stat && git diff`

Diff staged:
!`git diff --cached --stat && git diff --cached`

Ramas remotas:
!`git remote -v`

Instrucciones obligatorias:

1. Analiza primero los cambios.
   - Explica brevemente qué archivos han cambiado.
   - Separa cambios de código, documentación, configuración, estilos, tests o assets.
   - Detecta si hay archivos sensibles, secretos, claves API, tokens, .env, credenciales o datos privados.
   - Si hay riesgo de secreto o archivo que no debería subirse, detente y no hagas commit.

2. Detecta el patrón de mensajes del repositorio.
   - Usa los últimos commits como referencia.
   - Si el proyecto usa Conventional Commits, sigue ese formato:
     - feat:
     - fix:
     - docs:
     - refactor:
     - chore:
     - test:
     - style:
   - Si el proyecto usa otro patrón, imítalo.
   - El mensaje debe ser claro, breve y específico.

3. Decide qué añadir.
   - No uses `git add .` de forma ciega si hay archivos dudosos.
   - Añade solo los archivos relacionados con el cambio actual.
   - Si todos los cambios son coherentes y seguros, puedes añadirlos todos.
   - Si hay cambios mezclados, propón commits separados o haz solo el commit más coherente.

4. Antes de hacer commit:
   - Comprueba el estado con `git status`.
   - Revisa el diff staged con `git diff --cached`.
   - Si el proyecto tiene tests/lint evidentes y rápidos, ejecútalos.
   - No inventes tests si no está claro cómo ejecutarlos.
   - Si los tests fallan por los cambios actuales, no hagas push.

5. Ejecuta el flujo Git cuando sea seguro:
   - `git add <archivos>`
   - `git commit -m "<mensaje>"`
   - `git push`

6. Si la rama no tiene upstream:
   - detecta la rama actual con `git branch --show-current`
   - usa:
     `git push -u origin <rama-actual>`

7. Resultado final:
   - Indica el commit creado.
   - Indica la rama.
   - Indica si el push se completó.
   - Si no se hizo commit o push, explica exactamente por qué.

Restricciones:
- No modifiques código salvo que sea estrictamente necesario para completar el flujo Git.
- No hagas rebase, reset, force push, amend ni cambios destructivos salvo que se pida explícitamente.
- No subas archivos con secretos.
- No hagas commits enormes mezclando cambios no relacionados si se puede evitar.