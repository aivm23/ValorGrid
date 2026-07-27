# API

ValorGrid exposes the current local HTTP API used by the web UI. It uses JSON payloads unless an endpoint explicitly returns a file.

The API surface documented here is the **stable public contract for Community**. Professional editions may expose additional undocumented endpoints; those endpoints are not part of the public contract and may change without notice.

Main areas:

- Portfolio: summary, performance, monthly and history.
- Instruments and groups.
- Transactions and automatic plans.
- Corporate actions: automatic Yahoo Finance stock/ETF splits and reverse splits, exposed through read/scan audit endpoints.
- Imports and rollbacks.
- Backups and diagnostics.
- Version, health and extension manifest.

Professional-only surfaces may return `403` in Community. The public documentation describes only the generic edition behavior and does not expose private adapter internals.
