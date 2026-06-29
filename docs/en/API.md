# API

ValorGrid exposes a local HTTP API used by the web UI. The public API is stable for Community users and uses JSON payloads unless an endpoint explicitly returns a file.

Main areas:

- Portfolio: summary, performance, monthly and history.
- Instruments and groups.
- Transactions and automatic plans.
- Imports and rollbacks.
- Backups and diagnostics.
- Version, health and extension manifest.

Professional-only surfaces may return `403` in Community. The public documentation describes only the generic edition behavior and does not expose private adapter internals.
