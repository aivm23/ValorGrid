const { resolveRouteHandlers } = require('../../route-service-bindings');
const { assertString } = require('../../platform/validators');
const { validateTransactionAmountInput } = require('./transaction-entry-modes');

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
    previewTransactionEdit,
    updateTransaction,
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
      validateTransactionAmountInput(input);

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

  const editPreviewMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)\/preview$/);
  if (editPreviewMatch && request.method === 'POST') {
    try {
      const preview = previewTransactionEdit(decodeURIComponent(editPreviewMatch[1]), await readJsonBody(request));
      sendJson(response, 200, { preview });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const transactionMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
  const transactionId = transactionMatch ? decodeURIComponent(transactionMatch[1]) : null;

  if (transactionId && request.method === 'PUT') {
    try {
      const body = await readJsonBody(request);
      previewTransactionEdit(transactionId, body);
      const backup = createRiskBackup({ reason: 'before-transaction-update', metadata: { id: transactionId } });
      const transaction = updateTransaction(transactionId, body);
      sendJson(response, 200, { transaction, backup });
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
        sendJson(response, 200, { ok: true, deleted: 0 });
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

  if (transactionId && request.method === 'DELETE') {
    sendJson(response, deleteTransaction(transactionId) ? 200 : 404, {
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
