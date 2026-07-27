# Privacy And Security

ValorGrid is designed as a local single-user application. Data stays on your machine.

## What Data Is Private

Do not upload to GitHub or share publicly:

- `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`
- `local/valorgrid/backups/`, `local/valorgrid/data/`
- `.env`, `config.local.*`, `local/`, `imports/`, `downloads/`
- real broker exports, personal Excel files
- logs containing paths or portfolio data

## Outbound Network Connections

ValorGrid may establish outbound connections only for:

- **Yahoo Finance** (`query1.finance.yahoo.com`, `query2.finance.yahoo.com`): market-price lookups for user-configured symbols. The full ledger is never sent.
- **Alpha Vantage** (`www.alphavantage.co`): commodity price lookups when the user has configured an API key.
- **GitHub API** (`api.github.com`): version check in the Administration section (release tag only, no portfolio data).

No outbound connections exist for telemetry, analytics, advertising or portfolio sync.

## Encryption

ValorGrid does **not apply its own encryption** to the SQLite database or backups. Data-at-rest protection depends on the operating system's filesystem encryption (BitLocker, FileVault, LUKS) or the container volume.

Connections to external providers use HTTPS where supported. The app does not manage TLS certificates for incoming HTTP traffic; deployment administrators are responsible for configuring a reverse proxy with HTTPS when exposing the app outside localhost.

## Local Network And Threat Model

- **Local machine access**: any user with filesystem access can read the SQLite database directly. There is no database password protection.
- **Local network**: the app listens on `127.0.0.1` by default. In Docker/CasaOS/Umbrel the listener binds to `0.0.0.0` inside the container; protection relies on network isolation and optional Basic Auth.
- **Internet exposure**: do not expose the HTTP port directly without HTTPS and authentication. The app does not implement rate limiting, WAF or intrusion detection.
- **External providers**: Yahoo Finance and Alpha Vantage may record symbol lookups. No portfolio data is sent.

## Local Database

DB path resolution:

1. Explicitly configured path, if present.
2. Default: `local/valorgrid/data/portfolio.sqlite`.

In the desktop app, the database and backups resolve automatically inside the application's private data folder.

Recommendation:

- For personal use, store the DB in a private folder.
- For Docker, mount a persistent volume.
- Include the DB and backups in your personal backup strategy.

## Backups

Backups are stored locally and must not be versioned.

Create backup:

```bash
npm run db:backup
```

Quick diagnostics:

```bash
npm run db:doctor
```

## Imports

Real broker CSV/XLSX files may contain:

- full product names
- ISINs
- amounts
- commissions
- dates
- order identifiers
- personal financial history

Do not save them in the repository. Use `samples/` only for synthetic fixtures.

The privacy test scans public `.xlsx` files (in `samples/`) to block broker tokens, real ISINs and private source names.

## Single-User Login

Authentication protects the whole app when configured. The password is not stored in SQLite or shown in the API; it must be managed as a deployment secret. If not configured, ValorGrid runs in local mode without login.

## GitHub

Before publishing:

1. Run `npm run verify:publication`.
2. Review `git status --short`.
3. Ensure no SQLite, backups, `.env`, user import files or logs appear.
4. Review [GITHUB_RELEASE.md](../GITHUB_RELEASE.md).

## SECURITY.md

`SECURITY.md` is the standard GitHub security policy document. This document covers practical local privacy and secure publication.
