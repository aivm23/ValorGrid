# Data Model

The database is a local SQLite file created from the schema in source code.

Core concepts:

- Instruments and instrument groups.
- Transactions and automatic plans.
- Import batches and import rows.
- Market price cache and daily materialized prices.
- Portfolio history materialization.
- Dividend drafts and confirmation settings.
- App metadata and invalidations.

Schema changes follow the DB operations policy. Fresh installs are created from the current schema; production schema updates use versioned SQL under `deploy/sql/`.
