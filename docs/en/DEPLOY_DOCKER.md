# Docker And CasaOS

Run ValorGrid with Docker:

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
```

CasaOS uses `deploy/docker/compose.casaos.yml`.

Important:

- Persist `/data` for SQLite.
- Persist `/app/.backups` for backups.
- Set a strong auth password before exposing the app outside your LAN.
- No built-in 2FA: single-user login is stateless Basic Auth. For exposure beyond your LAN, put an authenticating reverse proxy with two-step login (e.g. Authelia or Authentik) in front and keep ValorGrid Basic Auth as a second layer. Native TOTP is future work.
- CasaOS image tags must use the exact release version, never `latest`.

Personal/local Docker usage may use `latest`.
