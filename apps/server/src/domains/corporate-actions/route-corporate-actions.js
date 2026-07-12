const { resolveRouteHandlers } = require('../../route-service-bindings');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handleCorporateActionRoutes(ctx, request, response, url) {
  const { sendJson, readJsonBody, listCorporateActions, scanCorporateActions } = resolveRouteHandlers(ctx);

  if (url.pathname === '/api/corporate-actions' && request.method === 'GET') {
    sendJson(response, 200, listCorporateActions({
      symbol: url.searchParams.get('symbol'),
      fromDate: url.searchParams.get('fromDate'),
      toDate: url.searchParams.get('toDate'),
    }));
    return true;
  }

  if (url.pathname === '/api/corporate-actions/scan' && request.method === 'POST') {
    try {
      sendJson(response, 200, await scanCorporateActions(await readJsonBody(request)));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  return false;
};
