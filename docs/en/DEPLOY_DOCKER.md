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
- CasaOS image tags must use the exact release version, never `latest`.

Personal/local Docker usage may use `latest`.
