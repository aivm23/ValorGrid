const { resolveRouteHandlers } = require('../../route-service-bindings');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handleDividendRoutes(ctx, request, response, url) {
  const {
    sendJson,
    readJsonBody,
    scanDividendEvents,
    runStartupDividendScan,
    listDividendDrafts,
    getDividendSummary,
    updateDividendDraft,
    confirmDividendDraft,
    ignoreDividendDraft,
    setDividendAutoInclude,
  } = resolveRouteHandlers(ctx);

  if (url.pathname === '/api/dividends/summary' && request.method === 'GET') {
    sendJson(response, 200, getDividendSummary());
    return true;
  }

  if (url.pathname === '/api/dividends/drafts' && request.method === 'GET') {
    sendJson(response, 200, listDividendDrafts());
    return true;
  }

  if (url.pathname === '/api/dividends/scan' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      const mode = body?.mode === 'startup' ? 'startup' : body?.mode === 'test' ? 'test' : 'api';
      const result = mode === 'startup' ? await runStartupDividendScan() : await scanDividendEvents({ ...body, mode });
      sendJson(response, 200, result);
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const draftMatch = url.pathname.match(/^\/api\/dividends\/drafts\/([^/]+)$/);
  if (draftMatch && request.method === 'PATCH') {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 200, updateDividendDraft(decodeURIComponent(draftMatch[1]), body));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const confirmMatch = url.pathname.match(/^\/api\/dividends\/drafts\/([^/]+)\/confirm$/);
  if (confirmMatch && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 200, confirmDividendDraft(decodeURIComponent(confirmMatch[1]), body || {}));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const ignoreMatch = url.pathname.match(/^\/api\/dividends\/drafts\/([^/]+)\/ignore$/);
  if (ignoreMatch && request.method === 'POST') {
    try {
      sendJson(response, 200, ignoreDividendDraft(decodeURIComponent(ignoreMatch[1])));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const settingMatch = url.pathname.match(/^\/api\/dividends\/settings\/([^/]+)$/);
  if (settingMatch && request.method === 'PUT') {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 200, setDividendAutoInclude(decodeURIComponent(settingMatch[1]), Boolean(body?.autoInclude)));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  return false;
};
