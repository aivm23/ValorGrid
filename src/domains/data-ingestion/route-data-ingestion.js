const { resolveRouteHandlers } = require('../../route-service-bindings');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handleImportRoutes(ctx, request, response, url) {
  const {
    sendJson,
    readJsonBody,
    previewImport,
    searchTickerSuggestions,
    commitImport,
    listImportBatches,
    getImportBatch,
    getImportRows,
    rollbackImportBatch,
    listImportRollbackLog,
  } = resolveRouteHandlers(ctx);

  if (url.pathname === '/api/import/preview' && request.method === 'POST') {
    try {
      sendJson(response, 200, { preview: previewImport(await readJsonBody(request)) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/import/ticker-suggestions' && request.method === 'POST') {
    try {
      sendJson(response, 200, { suggestions: await searchTickerSuggestions(await readJsonBody(request)) });
    } catch (error) {
      sendJson(response, 200, { suggestions: [], warning: error.message || 'suggestion not available' });
    }
    return true;
  }

  if (url.pathname === '/api/import/commit' && request.method === 'POST') {
    try {
      sendJson(response, 201, await commitImport(await readJsonBody(request)));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/import/batches' && request.method === 'GET') {
    sendJson(response, 200, { batches: listImportBatches() });
    return true;
  }

  const importBatchMatch = url.pathname.match(/^\/api\/import\/batches\/([^/]+)$/);
  if (importBatchMatch && request.method === 'GET') {
    const batchId = decodeURIComponent(importBatchMatch[1]);
    const batch = getImportBatch(batchId);
    sendJson(response, batch ? 200 : 404, batch ? { batch, rows: getImportRows(batchId) } : { error: 'Import batch not found' });
    return true;
  }

  const importRollbackMatch = url.pathname.match(/^\/api\/import\/batches\/([^/]+)\/rollback$/);
  if (importRollbackMatch && request.method === 'POST') {
    const ok = rollbackImportBatch(decodeURIComponent(importRollbackMatch[1]));
    sendJson(response, ok ? 200 : 404, ok ? { ok: true } : { error: 'Import batch not found' });
    return true;
  }

  if (url.pathname === '/api/import/rollback-log' && request.method === 'GET') {
    sendJson(response, 200, { entries: listImportRollbackLog() });
    return true;
  }

  return false;
};
