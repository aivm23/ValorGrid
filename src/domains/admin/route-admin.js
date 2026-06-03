const { resolveRouteHandlers } = require('../../route-service-bindings');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handleAdminRoutes(ctx, request, response, url) {
  const {
    sendJson,
    getQuoteForSymbol,
    buildHealth,
    getTransactions,
    getAutoPlans,
    listInstruments,
    listInstrumentGroups,
    buildPerformanceDiagnostics,
    buildTransactionsXlsx,
  } = resolveRouteHandlers(ctx);

  const { appInfo, root, db, dbPath, listBackups, createBackup, resolveBackupPath, fsSync, path } = ctx;

  if (url.pathname === '/api/version' && request.method === 'GET') {
    sendJson(response, 200, appInfo);
    return true;
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, buildHealth());
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

  if (url.pathname === '/api/export/transactions.xlsx' && request.method === 'GET') {
    const buffer = buildTransactionsXlsx();
    response.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ValorGrid_Movimientos.xlsx"',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
    });
    response.end(buffer);
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
      sendError(response, sendJson, error);
    }
    return true;
  }

  return false;
};
