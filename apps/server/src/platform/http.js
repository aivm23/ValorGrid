const { assertCtxDeps } = require('./ctx-utils');
const { createBasicAuthGuard } = require('./auth');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['http', 'port', 'handleApi', 'sendJson', 'resolveRequestPath', 'fs', 'path', 'contentTypes', 'config'], 'http');

  const { http, port, handleApi, sendJson, resolveRequestPath, fs, path, contentTypes, config } = ctx;
  const authGuard = createBasicAuthGuard(config.auth);

  const server = http.createServer(async (request, response) => {
    if (authGuard && !authGuard(request, response)) return;

    let url;
    try {
      url = new URL(request.url || '/', `http://${request.headers.host || `localhost:${port}`}`);
    } catch {
      sendJson(response, 400, { error: 'Bad request' });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        const handled = await handleApi(request, response, url);
        if (!handled) sendJson(response, 404, { error: 'Not found' });
      } catch (error) {
        console.error(error);
        sendJson(response, 500, { error: 'Internal server error' });
      }
      return;
    }

    const filePath = resolveRequestPath(request.url || '/');
    if (!filePath) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      response.writeHead(200, {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(data);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });

  Object.assign(ctx, { server });
};
