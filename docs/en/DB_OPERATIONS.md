# DB Operations

ValorGrid stores data in SQLite.

Operational rules:

- Back up before risky changes.
- Use `npm run db:backup` for local backups.
- Use `npm run db:doctor` to inspect DB health.
- Use `npm run db:reset` only when a fresh test/dev database is acceptable.
- Use the versioned SQL migration helpers for production schema changes.

Restore remains manual and documented. The application does not expose destructive reset endpoints in the HTTP API.
