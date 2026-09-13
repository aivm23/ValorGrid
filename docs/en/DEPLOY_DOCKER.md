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
- Bind interface: the local compose publishes `${BIND_IP:-127.0.0.1}:1325:1325` (loopback by default). Set `BIND_IP` in a root `.env` file to expose it on your LAN. CasaOS/Umbrel composes stay fixed on purpose.
- No built-in 2FA: single-user login is stateless Basic Auth. For exposure beyond your LAN, put an authenticating reverse proxy with two-step login (e.g. Authelia or Authentik) in front and keep ValorGrid Basic Auth as a second layer. Native TOTP is future work.
- No proxy support for market lookups: price queries go out directly without `HTTPS_PROXY`/SOCKS support. This is a product decision (see ARCHITECTURE.md: no runtime dependencies); isolate that traffic at host or network level if needed.
- CasaOS image tags must use the exact release version, never `latest`.

Personal/local Docker usage may use `latest`.
