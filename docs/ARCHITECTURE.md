# Arquitectura

ValorGrid es una aplicación local monousuario con backend Node.js, SQLite local y frontend estático modular.

## Objetivos de arquitectura

- Mantener datos privados en la máquina del usuario.
- Evitar servicios remotos obligatorios.
- Mantener `transactions` como fuente contable única.
- Materializar histórico para lecturas rápidas.
- Separar importación, validación, commit y rollback.
- Mantener el servidor atado a `127.0.0.1` por defecto.

## Backend

### `server.js`

Bootstrap mínimo (9 líneas): delega en `src/app.js` para toda la lógica. Solo arranca el listener HTTP cuando se ejecuta directamente.

### `src/app.js`

Orquestador del backend:

- crea el objeto `ctx` compartido,
- carga cada módulo `src/*.js` como `require(modulePath)(ctx)`,
- cada módulo usa `with (ctx) { ... }` para leer y escribir estado compartido,
- cada módulo exporta funciones vía `Object.assign(ctx, { ... })`,
- llama a `ctx.initDatabase()` para ejecutar schema y migraciones idempotentes.

### `src/`

La lógica principal vive en módulos:

- `config`: host, puerto, rutas, versión y DB activa.
- `db`: apertura SQLite, PRAGMAs, helpers y transacciones.
- `schema`: creación y evolución idempotente de tablas.
- `routes`: enrutado HTTP y normalización de respuestas.
- `portfolio-service`: instrumentos, grupos, transacciones, planes, resumen y revisión mensual.
- `history-service`: materialización diaria/semanal, eventos e invalidaciones.
- `market-data`: precios, Yahoo, caché y FX.
- `import-service`: preview, normalización, conciliación, commit y rollback.
- `backup-service`: creación y listado de backups.

`node:sqlite` debe quedar aislado detrás de `src/db.js`.

## Frontend

### `index.html`

Punto de entrada del frontend. Carga los módulos de `client/` como `<script type="module">`.

### `client/attach.js`

Mecanismo de inyección de dependencias del frontend. Usa `new Function` con `with (ctx)` para cargar módulos ES y exponer sus funciones en el objeto `ctx` global, replicando el patrón del backend.

### `client/`

Módulos principales:

- `api.js`: fetch local, errores y timeouts.
- `state.js`: estado global de UI.
- `dom.js`: referencias a nodos.
- `charts.js`: donut e histórico SVG.
- `format.js`: formato monetario, fechas, porcentajes y privacidad de saldos.
- `events.js`: eventos de UI.
- `operations.js`: instrumentos, grupos, backups y administración.
- `ledger.js`: movimientos y filtros.
- `monthly.js`: revisión YTD.
- `history.js`: histórico lineal.
- `imports.js`, `import-workflow.js`, `import-preview-renderer.js`: asistente de importación.
- `bulk-actions.js`: acciones masivas de selección y borrado.
- `privacy.js`: ocultación de saldos.
- `theme.js`: tema claro/oscuro.
- `attach.js`: mecanismo de inyección de dependencias.
- `forms.js`: helpers de formularios.
- `onboarding.js`: wizard de onboarding.
- `summary.js`: resumen de cartera expandido.

## Histórico

El histórico no se calcula desde cero en cada petición.

Flujo:

1. El ledger cambia.
2. Se registra invalidación desde la fecha afectada.
3. Se reconstruyen posiciones y valores derivados.
4. La API lee de tablas materializadas.

Rangos:

- `ytd` y `1y`: diario.
- `2y`, `5y` y `all`: semanal por defecto.

Tablas clave:

- `portfolio_positions_daily`
- `portfolio_value_daily`
- `portfolio_value_weekly`
- `portfolio_events`
- `history_invalidations`
- `history_builds`

## Importaciones

El importador está diseñado como un flujo de conciliación, no como una carga directa.

Fases:

1. Parseo de fuente.
2. Normalización canónica.
3. Detección de instrumentos.
4. Conciliación visual.
5. Validación contable.
6. Preview de impacto.
7. Commit atómico de filas seleccionadas.
8. Rollback por lote si hace falta corregir.

Fuentes:

- CSV genérico.
- XLSX genérico.
- DEGIRO CSV.
- IBKR CSV.

Los adaptadores de broker solo transforman a un formato normalizado común. La resolución de instrumentos se apoya en identificadores genéricos y confirmaciones del usuario.

## Backups

La app puede crear copias locales de SQLite con:

- API local,
- UI de administración,
- script PowerShell.

Antes de copiar, se hace checkpoint WAL para reducir riesgo de backup inconsistente.

## Docker y CasaOS

Docker ejecuta la app como servicio local con:

- `HOST=0.0.0.0`
- `PORT=5173`
- `PORTFOLIO_DB_PATH=/data/portfolio.sqlite`

Los volúmenes guardan datos y backups fuera del contenedor.

## Seguridad

La app no incluye autenticación. Para uso doméstico debe quedarse en:

- localhost,
- LAN privada,
- VPN,
- o reverse proxy con autenticación externa.

No debe exponerse directamente a Internet sin una capa de autenticación adicional.
