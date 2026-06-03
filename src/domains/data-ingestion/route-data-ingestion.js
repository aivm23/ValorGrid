const { resolveRouteHandlers } = require('../../route-service-bindings');
const { LEGACY_GENERIC_SOURCES, listImportSources } = require('./ingestion-profiles');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

const TEMPLATE_FILENAME = 'ValorGrid_Plantilla_Importacion.xlsx';
const TEMPLATE_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function rejectLegacySource(sendJson, response, body) {
  const source = String(body?.source || '').trim().toLowerCase();
  if (LEGACY_GENERIC_SOURCES.has(source)) {
    sendJson(response, 400, {
      error: 'Fuente no soportada: usa la plantilla Excel de ValorGrid (valorgrid-xlsx). Descárgala en GET /api/import/template.xlsx',
    });
    return true;
  }
  return false;
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
    getImportTemplate,
  } = resolveRouteHandlers(ctx);

  if (url.pathname === '/api/import/sources' && request.method === 'GET') {
    const edition = ctx.appInfo?.edition || 'community';
    sendJson(response, 200, { sources: listImportSources(edition) });
    return true;
  }

  if (url.pathname === '/api/import/template.xlsx' && request.method === 'GET') {
    try {
      const buffer = getImportTemplate();
      response.writeHead(200, {
        'Content-Type': TEMPLATE_MIME,
        'Content-Disposition': `attachment; filename="${TEMPLATE_FILENAME}"`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-store',
      });
      response.end(buffer);
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/import/preview' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      if (rejectLegacySource(sendJson, response, body)) return true;
      sendJson(response, 200, { preview: previewImport(body) });
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
      const body = await readJsonBody(request);
      if (rejectLegacySource(sendJson, response, body)) return true;
      sendJson(response, 201, await commitImport(body));
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
