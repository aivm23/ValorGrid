FROM node:24-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/aivm23/ValorGrid" \
      org.opencontainers.image.description="ValorGrid — Private local portfolio dashboard" \
      org.opencontainers.image.licenses="MPL-2.0"

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=1325 \
    PORTFOLIO_DB_PATH=/data/portfolio.sqlite

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/server/package.json apps/server/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node apps/desktop/package.json apps/desktop/
COPY --chown=node:node packages/contracts/package.json packages/contracts/

RUN npm ci --omit=dev --ignore-scripts

COPY --chown=node:node . .

RUN mkdir -p /data /app/.backups \
  && chown -R node:node /data /app/.backups \
  && chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 1325

VOLUME ["/data", "/app/.backups"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port = process.env.PORT || 1325; fetch('http://127.0.0.1:' + port + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));"

USER node

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "apps/server/server.js"]
