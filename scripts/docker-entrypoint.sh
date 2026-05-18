#!/bin/sh
set -eu

mkdir -p /data /app/.backups

if [ "$(id -u)" = "0" ]; then
  chown -R node:node /data /app/.backups 2>/dev/null || true
  if command -v runuser >/dev/null 2>&1; then
    exec runuser -u node -- "$@"
  fi
  exec su node -s /bin/sh -c "exec $*"
fi

exec "$@"
