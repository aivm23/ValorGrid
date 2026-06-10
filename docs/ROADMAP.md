# Roadmap

Este roadmap describe la dirección pública del proyecto. No compromete fechas.

## Community

Prioridades:

- mejorar la primera experiencia de usuario;
- reforzar la importación mediante plantilla Excel;
- ampliar guías para usuarios no técnicos;
- mantener instalador Windows, checksums y Docker versionado;
- mejorar edición y auditoría visual de movimientos;
- simplificar conceptos de instrumentos, grupos y vistas;
- estudiar soporte de fondos con valoración NAV/manual.

## Pro/Enterprise

Línea reservada a funcionalidades privadas o comerciales:

- conectores avanzados de broker;
- conciliación privada por fuente;
- informes avanzados;
- soporte prioritario;
- multi-cartera o escenarios profesionales;
- instalador firmado cuando el producto lo justifique.

El código y los contratos operativos de Pro/Enterprise no se publican en el repositorio Community.

## Distribución

Estado actual:

- Windows: GitHub Releases con instalador NSIS.
- Integridad: `SHA256SUMS.txt` y digests de assets en GitHub Releases.
- Docker: GHCR con tags `vX.Y.Z` y `latest`.
- CasaOS: compose público con imagen `latest` y metadata `version` fija para la ficha AppStore.

Siguientes pasos:

- landing: https://valorgrid.app ya está operativa como ficha principal del proyecto.
- valorar firma de código para reducir fricción de Windows SmartScreen;
- publicar material de onboarding y vídeo corto.
