const { resolveRouteHandlers } = require('../../route-service-bindings');
const { assertString, assertXor } = require('../../platform/validators');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handleTransactionRoutes(ctx, request, response, url) {
  const {
    sendJson,
    readJsonBody,
    getTransactions,
    createTransaction,
    previewTransaction,
    deleteTransaction,
    getAutoPlans,
    previewAutoPlanExecutions,
    replaceAutoPlans,
  } = resolveRouteHandlers(ctx);

  if (url.pathname === '/api/transactions' && request.method === 'GET') {
    sendJson(response, 200, { transactions: getTransactions() });
    return true;
  }

  if (url.pathname === '/api/transactions' && request.method === 'POST') {
    try {
      const input = await readJsonBody(request);
      assertString(input.symbol || input.ticker, 'symbol');
      assertXor(
        Number.isFinite(Number(input.euros)) && Number(input.euros) > 0,
        Number.isFinite(Number(input.shares)) && Number(input.shares) > 0,
        'euros',
        'shares',
      );
      const transaction = await createTransaction(input);
      sendJson(response, 201, { transaction });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/transactions/preview' && request.method === 'POST') {
    try {
      const input = await readJsonBody(request);
      assertString(input.symbol || input.ticker, 'symbol');
      const preview = await previewTransaction(input);
      const { instrument, quote, ...payload } = preview;
      sendJson(response, 200, { preview: payload });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const deleteMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    sendJson(response, deleteTransaction(decodeURIComponent(deleteMatch[1])) ? 200 : 404, {
      ok: true,
    });
    return true;
  }

  if (url.pathname === '/api/auto-plans' && request.method === 'GET') {
    sendJson(response, 200, { autoPlans: getAutoPlans() });
    return true;
  }

  if (url.pathname === '/api/auto-plans/preview' && request.method === 'POST') {
    try {
      sendJson(response, 200, { preview: previewAutoPlanExecutions((await readJsonBody(request)).autoPlans || []) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/auto-plans' && request.method === 'PUT') {
    try {
      const result = replaceAutoPlans((await readJsonBody(request)).autoPlans || []);
      sendJson(response, 200, { autoPlans: getAutoPlans(), warnings: result.warnings || [] });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  return false;
};
