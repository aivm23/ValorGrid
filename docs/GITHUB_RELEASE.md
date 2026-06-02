# GitHub Release Checklist

Use this checklist before creating a repository or pushing code.

1. Create a fresh local backup of the private database with `npm run db:backup`.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Run `npm run format:check`.
5. Run `npm test`.
6. Run `npm run verify:publication`.
7. Confirm private data remains ignored:
   `git check-ignore portfolio.sqlite *.sqlite-wal *.sqlite-shm portfolio.loadtest.sqlite .backups dist`
8. Review `git status --short` before staging files.
9. Stage only public source, tests, docs, CI, examples and portable scripts.
10. Do not stage:
   - SQLite databases or sidecar files
   - backups
   - logs
   - `.env`
   - user import files
   - generated demo databases
   - local agent workdirs such as `.agents/` or `.opencode/`
11. Commit locally.
12. Create the GitHub repository.
13. Add the remote URL as `origin`.
14. Push only after the staged file list is clean.

Fresh installations create a private SQLite database locally. Users can override the database path with `PORTFOLIO_DB_PATH`.
