# /audit-privacy - Auditoría de Privacidad

Verifica que no se filtrarán datos sensibles al publicar.

**Comandos:**

- `npm run verify:publication` — escaneo de fugas

**Archivos:**

- `.gitignore` — exclusiones git
- `.dockerignore` — exclusiones docker
- `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm` — fuera de `local/`
- `.env`, `.env.*` — fuera de `local/`
