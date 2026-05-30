const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'path',
      'root',
      'sendJson',
      'appInfo',
      'buildHealth',
      'listInstruments',
      'listInstrumentIdentifiers',
      'upsertInstrumentIdentifier',
      'readJsonBody',
      'deleteInstrumentIdentifier',
      'createInstrument',
      'previewInstrumentDelete',
      'deleteInstruments',
      'updateInstrument',
      'deleteInstrument',
      'listInstrumentGroups',
      'createInstrumentGroup',
      'deleteInstrumentGroups',
      'updateInstrumentGroup',
      'deleteInstrumentGroup',
      'buildOnboardingStatus',
      'previewOnboardingWizard',
      'commitOnboardingWizard',
      'getTransactions',
      'createTransaction',
      'previewTransaction',
      'previewImport',
      'searchTickerSuggestions',
      'commitImport',
      'listImportBatches',
      'getImportBatch',
      'getImportRows',
      'rollbackImportBatch',
      'listImportRollbackLog',
      'deleteTransaction',
      'getAutoPlans',
      'previewAutoPlanExecutions',
      'replaceAutoPlans',
      'buildSummary',
      'buildPortfolioPerformance',
      'buildMonthly',
      'currentYear',
      'buildPortfolioHistory',
      'buildPerformanceDiagnostics',
      'listBackups',
      'createBackup',
      'db',
      'dbPath',
      'sendText',
      'buildTransactionsCsv',
      'resolveBackupPath',
      'fsSync',
      'getQuoteForSymbol',
    ],
    'routes',
  );

  const {
    path,
    root,
    sendJson,
    appInfo,
    buildHealth,
    listInstruments,
    listInstrumentIdentifiers,
    upsertInstrumentIdentifier,
    readJsonBody,
    deleteInstrumentIdentifier,
    createInstrument,
    previewInstrumentDelete,
    deleteInstruments,
    updateInstrument,
    deleteInstrument,
    listInstrumentGroups,
    createInstrumentGroup,
    deleteInstrumentGroups,
    updateInstrumentGroup,
    deleteInstrumentGroup,
    buildOnboardingStatus,
    previewOnboardingWizard,
    commitOnboardingWizard,
    getTransactions,
    createTransaction,
    previewTransaction,
    previewImport,
    searchTickerSuggestions,
    commitImport,
    listImportBatches,
    getImportBatch,
    getImportRows,
    rollbackImportBatch,
    listImportRollbackLog,
    deleteTransaction,
    getAutoPlans,
    previewAutoPlanExecutions,
    replaceAutoPlans,
    buildSummary,
    buildPortfolioPerformance,
    buildMonthly,
    currentYear,
    buildPortfolioHistory,
    buildPerformanceDiagnostics,
    listBackups,
    createBackup,
    db,
    dbPath,
    sendText,
    buildTransactionsCsv,
    resolveBackupPath,
    fsSync,
    getQuoteForSymbol,
  } = ctx;

function monthLabel(month) {
  return [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ][month - 1];
}

function resolveRequestPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const relativePath = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  return filePath.startsWith(root + path.sep) || filePath === root ? filePath : null;
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/version' && request.method === 'GET') {
    sendJson(response, 200, appInfo);
    return true;
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, buildHealth());
    return true;
  }

  if (url.pathname === '/api/instruments' && request.method === 'GET') {
    sendJson(response, 200, { instruments: listInstruments() });
    return true;
  }

  if (url.pathname === '/api/instrument-identifiers' && request.method === 'GET') {
    sendJson(response, 200, {
      identifiers: listInstrumentIdentifiers({
        symbol: url.searchParams.get('symbol'),
        provider: url.searchParams.get('provider'),
        type: url.searchParams.get('type'),
      }),
    });
    return true;
  }

  if (url.pathname === '/api/instrument-identifiers' && request.method === 'POST') {
    try {
      sendJson(response, 201, { identifier: upsertInstrumentIdentifier(await readJsonBody(request)) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  const identifierMatch = url.pathname.match(/^\/api\/instrument-identifiers\/([^/]+)$/);
  if (identifierMatch && request.method === 'DELETE') {
    const ok = deleteInstrumentIdentifier(decodeURIComponent(identifierMatch[1]));
    sendJson(response, ok ? 200 : 404, ok ? { ok: true } : { error: 'Identifier not found' });
    return true;
  }

  if (url.pathname === '/api/instruments' && request.method === 'POST') {
    try {
      sendJson(response, 201, { instrument: createInstrument(await readJsonBody(request)) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/instruments/preview-delete' && request.method === 'POST') {
    sendJson(response, 200, { results: previewInstrumentDelete((await readJsonBody(request)).symbols || []) });
    return true;
  }

  if (url.pathname === '/api/instruments' && request.method === 'DELETE') {
    try {
      sendJson(response, 200, { results: deleteInstruments((await readJsonBody(request)).symbols || []) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  const instrumentMatch = url.pathname.match(/^\/api\/instruments\/([^/]+)$/);
  if (instrumentMatch && request.method === 'PUT') {
    sendJson(response, 200, { instrument: updateInstrument(decodeURIComponent(instrumentMatch[1]), await readJsonBody(request)) });
    return true;
  }

  if (instrumentMatch && request.method === 'DELETE') {
    try {
      sendJson(response, 200, { result: deleteInstrument(decodeURIComponent(instrumentMatch[1])) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/instrument-groups' && request.method === 'GET') {
    sendJson(response, 200, { groups: listInstrumentGroups() });
    return true;
  }

  if (url.pathname === '/api/instrument-groups' && request.method === 'POST') {
    try {
      sendJson(response, 201, { group: createInstrumentGroup(await readJsonBody(request)) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/instrument-groups' && request.method === 'DELETE') {
    try {
      sendJson(response, 200, { results: deleteInstrumentGroups((await readJsonBody(request)).ids || []) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  const groupMatch = url.pathname.match(/^\/api\/instrument-groups\/([^/]+)$/);
  if (groupMatch && request.method === 'PUT') {
    try {
      sendJson(response, 200, { group: updateInstrumentGroup(decodeURIComponent(groupMatch[1]), await readJsonBody(request)) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (groupMatch && request.method === 'DELETE') {
    try {
      sendJson(response, 200, { result: deleteInstrumentGroup(decodeURIComponent(groupMatch[1])) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/onboarding/status' && request.method === 'GET') {
    sendJson(response, 200, buildOnboardingStatus());
    return true;
  }

  if (url.pathname === '/api/onboarding/wizard/preview' && request.method === 'POST') {
    try {
      sendJson(response, 200, { preview: await previewOnboardingWizard(await readJsonBody(request)) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/onboarding/wizard/commit' && request.method === 'POST') {
    try {
      sendJson(response, 201, await commitOnboardingWizard(await readJsonBody(request)));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

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

  if (url.pathname === '/api/import/preview' && request.method === 'POST') {
    try {
      sendJson(response, 200, { preview: previewImport(await readJsonBody(request)) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/import/ticker-suggestions' && request.method === 'POST') {
    try {
      sendJson(response, 200, { suggestions: await searchTickerSuggestions(await readJsonBody(request)) });
    } catch (error) {
      sendJson(response, 200, { suggestions: [], warning: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/import/commit' && request.method === 'POST') {
    try {
      sendJson(response, 201, await commitImport(await readJsonBody(request)));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
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

  if (url.pathname === '/api/portfolio/summary' && request.method === 'GET') {
    sendJson(response, 200, await buildSummary());
    return true;
  }

  if (url.pathname === '/api/portfolio/performance' && request.method === 'GET') {
    sendJson(response, 200, await buildPortfolioPerformance());
    return true;
  }

  if (url.pathname === '/api/portfolio/monthly' && request.method === 'GET') {
    sendJson(response, 200, await buildMonthly(Number(url.searchParams.get('year')) || currentYear));
    return true;
  }

  if (url.pathname === '/api/portfolio/history' && request.method === 'GET') {
    sendJson(
      response,
      200,
      await buildPortfolioHistory(url.searchParams.get('range') || 'all', url.searchParams.get('granularity') || 'auto'),
    );
    return true;
  }

  if (url.pathname === '/api/diagnostics/performance' && request.method === 'GET') {
    sendJson(response, 200, await buildPerformanceDiagnostics());
    return true;
  }

  if (url.pathname === '/api/backups' && request.method === 'GET') {
    sendJson(response, 200, { backups: listBackups(root) });
    return true;
  }

  if (url.pathname === '/api/backups' && request.method === 'POST') {
    sendJson(response, 201, { backup: createBackup({ db, dbPath, root }) });
    return true;
  }

  if (url.pathname === '/api/export/transactions.json' && request.method === 'GET') {
    sendJson(response, 200, { transactions: getTransactions() });
    return true;
  }

  if (url.pathname === '/api/export/transactions.csv' && request.method === 'GET') {
    sendText(response, 200, buildTransactionsCsv(), 'text/csv; charset=utf-8', {
      'Content-Disposition': 'attachment; filename="transactions.csv"',
    });
    return true;
  }

  const backupMatch = url.pathname.match(/^\/api\/backups\/([^/]+)$/);
  if (backupMatch && request.method === 'GET') {
    const backupPath = resolveBackupPath(root, decodeURIComponent(backupMatch[1]));
    if (!backupPath) {
      sendJson(response, 404, { error: 'Backup not found' });
      return true;
    }
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(backupPath)}"`,
      'Cache-Control': 'no-store',
    });
    fsSync.createReadStream(backupPath).pipe(response);
    return true;
  }

  if (url.pathname === '/api/state' && request.method === 'GET') {
    sendJson(response, 200, {
      transactions: getTransactions(),
      autoPlans: getAutoPlans(),
      instruments: listInstruments(),
      groups: listInstrumentGroups(),
      dbPath,
    });
    return true;
  }

  if (url.pathname === '/api/quote' && request.method === 'GET') {
    try {
      const quote = await getQuoteForSymbol(url.searchParams.get('symbol'), url.searchParams.get('date'));
      sendJson(response, 200, { quote });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return true;
  }

  return false;
}

  Object.assign(ctx, { monthLabel, resolveRequestPath, handleApi });
};
