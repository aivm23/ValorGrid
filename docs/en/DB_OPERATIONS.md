# DB Operations

ValorGrid stores data in SQLite.

Operational rules:

- Back up before risky changes.
- Use `npm run db:backup` for local backups.
- Use `npm run db:doctor` to inspect DB health.
- Use `npm run db:reset` only when a fresh test/dev database is acceptable.
- Use the versioned SQL migration helpers for production schema changes.
- `apps/server/src/schema.js` is the canonical Community schema for fresh installs.
- Docker, CasaOS and Umbrel set `VALORGRID_RUNTIME_MODE=docker`; automatic migrations are disabled there by default and can only be enabled deliberately with `VALORGRID_AUTO_MIGRATE=1`.
- Optional encrypted backups: `VALORGRID_BACKUP_PASSPHRASE=... npm run db:backup -- --encrypted` stores a verified `.sqlite.enc` (scrypt + AES-256-GCM, `node:crypto` only). Decrypt with `npm run db:backup -- --decrypt <backup.sqlite.enc> --out <restored.sqlite>`. The 6-backup retention counts plain and encrypted together; without the passphrase an encrypted backup is unrecoverable.

Restore remains manual and documented. The application does not expose destructive reset endpoints in the HTTP API.
