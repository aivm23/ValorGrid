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
    bulkDeleteTransactions,
    getAutoPlans,
    previewAutoPlanExecutions,
    replaceAutoPlans,
    createRiskBackup,
  } = resolveRouteHandlers(ctx);

  if (url.pathname === '/api/transactions' && request.method === 'GET') {
    sendJson(response, 200, { transactions: getTransactions() });
    return true;
  }

  if (url.pathname === '/api/transactions' && request.method === 'POST') {
    try {
      const input = await readJsonBody(request);
      assertString(input.symbol || input.ticker, 'symbol');

      const hasManualUnitPrice = Number.isFinite(Number(input.unitPrice)) && Number(input.unitPrice) > 0;
      const hasShares = Number.isFinite(Number(input.shares)) && Number(input.shares) > 0;
      const hasEuros = Number.isFinite(Number(input.euros)) && Number(input.euros) > 0;
      const hasInvalidUnitPrice = Number.isFinite(Number(input.unitPrice)) && Number(input.unitPrice) <= 0;

      if (hasInvalidUnitPrice) {
        throw new Error('unitPrice must be a positive number');
      }

      if (hasManualUnitPrice) {
        if (hasEuros) {
          throw new Error('unitPrice cannot be combined with euros');
        }
        if (!hasShares) {
          throw new Error('unitPrice requires shares');
        }
      }
      else {
        assertXor(hasEuros, hasShares, 'euros', 'shares');
      }

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

  if (url.pathname === '/api/transactions' && request.method === 'DELETE') {
    try {
      const body = await readJsonBody(request);
      const ids = Array.isArray(body?.ids) ? body.ids : [];
      if (!ids.length) {
        sendJson(response, 200, { ok: true, deleted: 0, backup: null });
        return true;
      }
      let riskBackup = null;
      try {
        riskBackup = createRiskBackup({ reason: 'before-bulk-transaction-delete', metadata: { count: ids.length } });
      } catch (backupError) {
        sendError(response, sendJson, backupError);
        return true;
      }
      const deleted = bulkDeleteTransactions(ids);
      sendJson(response, 200, { ok: true, deleted, backup: riskBackup });
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
      const body = await readJsonBody(request);
      let riskBackup = null;
      try {
        riskBackup = createRiskBackup({ reason: 'before-auto-plans-replace', metadata: { planCount: (body.autoPlans || []).length } });
      } catch (backupError) {
        sendError(response, sendJson, backupError);
        return true;
      }
      const result = replaceAutoPlans(body.autoPlans || []);
      sendJson(response, 200, { autoPlans: getAutoPlans(), warnings: result.warnings || [], backup: riskBackup });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  return false;
};
