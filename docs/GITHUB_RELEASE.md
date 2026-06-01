# GitHub Release Checklist

Use this checklist before creating a repository or pushing code.

1. Create a fresh local backup of the private database with `npm run db:backup`.
2. Run `npm run lint`.
3. Run `npm run format:check`.
4. Run `npm test`.
5. Run `npm run verify:publication`.
6. Confirm private data remains ignored:
   `git check-ignore portfolio.sqlite *.sqlite-wal *.sqlite-shm portfolio.loadtest.sqlite .backups dist`
7. Review `git status --short` before staging files.
8. Stage only public source, tests, docs, CI, examples and portable scripts.
9. Do not stage:
   - SQLite databases or sidecar files
   - backups
   - logs
   - `.env`
   - private imports
   - generated demo databases
   - internal agent instructions
10. Commit locally.
11. Create the GitHub repository.
12. Add the remote URL as `origin`.
13. Push only after the staged file list is clean.

Fresh installations create a private SQLite database locally. Users can override the database path with `PORTFOLIO_DB_PATH`.
