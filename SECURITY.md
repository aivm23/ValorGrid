# Security And Privacy

This is a local, single-user portfolio app. It does not provide accounts, cloud sync, or multi-user isolation.

Portfolio data is stored in a local SQLite database. Keep these files private:

- `*.sqlite`
- `*.sqlite-wal`
- `*.sqlite-shm`
- `.backups/`
- `.env`
- `config.local.*`
- `local/`

Before publishing or pushing changes, run:

```powershell
node --test
```

The test suite includes privacy checks that fail when publishable files contain local Windows user paths, bundled SQLite databases, personal import labels, or non-zero default holdings.

If you use GitHub, do not upload your database or backups. Share only the application code and synthetic demo data generators.
