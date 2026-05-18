# GitHub Release Checklist

Use this checklist before creating a repository or pushing code.

1. Create a fresh local backup of the private database with `npm run backup`.
2. Run `npm run verify:publication`.
3. Confirm private data remains ignored:
   `git check-ignore portfolio.sqlite *.sqlite-wal *.sqlite-shm portfolio.loadtest.sqlite .backups dist AGENTS.md`
4. Review `git status --short` before staging files.
5. Stage only public source, tests, docs, CI, examples and portable scripts.
6. Do not stage:
   - SQLite databases or sidecar files
   - backups
   - logs
   - `.env`
   - private imports
   - generated demo databases
   - internal agent instructions
7. Commit locally.
8. Create the GitHub repository.
9. Add the remote URL as `origin`.
10. Push only after the staged file list is clean.

Fresh installations create a private SQLite database locally. Users can override the database path with `PORTFOLIO_DB_PATH`.
