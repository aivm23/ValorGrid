const { resolveRouteHandlers } = require('./route-service-bindings');

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
      const transaction = await createTransaction(await readJsonBody(request));
      sendJson(response, 201, { transaction });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/transactions/preview' && request.method === 'POST') {
    try {
      const preview = await previewTransaction(await readJsonBody(request));
      const { instrument, quote, ...payload } = preview;
      sendJson(response, 200, { preview: payload });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
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
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/auto-plans' && request.method === 'PUT') {
    try {
      const result = replaceAutoPlans((await readJsonBody(request)).autoPlans || []);
      sendJson(response, 200, { autoPlans: getAutoPlans(), warnings: result.warnings || [] });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  return false;
};
