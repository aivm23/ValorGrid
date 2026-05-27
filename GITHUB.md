# GitHub Setup

This project can be published as source code for local, single-user installations. Do not publish real portfolio data.

## Before The First Commit

Run:

```powershell
npm run backup
npm run verify:publication
```

Then initialize Git:

```powershell
git init
git status --short
git check-ignore portfolio.sqlite *.sqlite-wal *.sqlite-shm portfolio.loadtest.sqlite .backups dist
```

Only continue if private files are ignored and `git status` shows public project files only.

## First Commit

```powershell
git add .github .env.example .gitignore GITHUB.md LICENSE README.md SECURITY.md app.js client docs index.html package.json scripts server.js src styles.css test version.json
git status --short
git commit -m "Prepare public local portfolio dashboard"
```

If `git status` shows SQLite databases, backups, logs, generated files or private imports, stop and fix `.gitignore` before committing.

## Create The Remote

Create an empty repository on GitHub, then add it as `origin`:

```powershell
git remote add origin https://github.com/<owner>/<repo>.git
git branch -M main
git push -u origin main
```

GitHub CLI can also be used if it is installed and authenticated:

```powershell
gh repo create <owner>/<repo> --private --source . --remote origin --push
```

## Privacy Rules

Never commit:

- `*.sqlite`
- `*.sqlite-wal`
- `*.sqlite-shm`
- `.backups/`
- `.env`
- `config.local.*`
- `local/`
- `imports/`
- broker exports
- generated demo databases
- internal agent instructions

Each user should run the app with their own private SQLite database.
