const { resolveRouteHandlers } = require('../../route-service-bindings');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handleLiquidityRoutes(ctx, request, response, url) {
  const {
    sendJson,
    readJsonBody,
    getLiquidityState,
    createLiquidityAccount,
    updateLiquidityAccount,
    deleteLiquidityAccount,
  } = resolveRouteHandlers(ctx);

  if (url.pathname === '/api/liquidity' && request.method === 'GET') {
    sendJson(response, 200, await getLiquidityState());
    return true;
  }

  if (url.pathname === '/api/liquidity/accounts' && request.method === 'POST') {
    try {
      sendJson(response, 201, await createLiquidityAccount(await readJsonBody(request)));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const accountMatch = url.pathname.match(/^\/api\/liquidity\/accounts\/([^/]+)$/);
  if (accountMatch && request.method === 'PUT') {
    try {
      sendJson(
        response,
        200,
        await updateLiquidityAccount(decodeURIComponent(accountMatch[1]), await readJsonBody(request)),
      );
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (accountMatch && request.method === 'DELETE') {
    try {
      sendJson(response, 200, await deleteLiquidityAccount(decodeURIComponent(accountMatch[1])));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  return false;
};
