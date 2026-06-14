# /audit-deps - Auditoría de Dependencias

Ejecuta el policy checker y el auditor de npm.

**Comandos:**

- `node scripts/audit/check-dependency-policy.js` — política de dependencias
- `npm audit` — vulnerabilidades conocidas

**Archivos:**

- `package.json` — dependencias del workspace raíz
- `apps/*/package.json` — dependencias por app
- `scripts/audit/check-dependency-policy.js` — reglas de policy
