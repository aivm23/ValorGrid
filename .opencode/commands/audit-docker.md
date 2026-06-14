# /audit-docker - Auditoría de Docker / CasaOS

Verifica consistencia de la configuración Docker y metadatos CasaOS.

**Archivos:**

- `deploy/docker/Dockerfile` — imagen de build
- `deploy/docker/docker-compose.yml` — compose local
- `deploy/docker/compose.casaos.yml` — metadatos CasaOS
- `package.json` — versión de referencia

**Validaciones:**

- `x-casaos.version` coincide con `package.json` version
- `image` tag coincide con `package.json` version
- Puertos expuestos, volúmenes, variables de entorno
