const { resolveRouteHandlers } = require('../../route-service-bindings');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handleAdminRoutes(ctx, request, response, url) {
  const {
    sendJson,
    getQuoteForSymbol,
    listMarketDataSources,
    buildHealth,
    getTransactions,
    getAutoPlans,
    listInstruments,
    listInstrumentGroups,
    buildPerformanceDiagnostics,
    buildTransactionsXlsx,
    listBackups,
    createBackup,
    resolveBackupPath,
    deleteBackupFile,
    getUpdateStatus,
    getDockerCommands,
  } = resolveRouteHandlers(ctx);

  const { appInfo, dbPath } = ctx.config || ctx;
  const { fsSync, path } = ctx;
  const { getUiPreferences, saveUiPreferences } = ctx;

  if (url.pathname === '/api/version' && request.method === 'GET') {
    sendJson(response, 200, appInfo);
    return true;
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, buildHealth());
    return true;
  }

  if (url.pathname === '/api/update/status' && request.method === 'GET') {
    try {
      const status = await getUpdateStatus();
      sendJson(response, 200, status);
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/update/docker-commands' && request.method === 'GET') {
    const version = url.searchParams.get('version') || undefined;
    sendJson(response, 200, { commands: getDockerCommands(version) });
    return true;
  }

  if (url.pathname === '/api/diagnostics/performance' && request.method === 'GET') {
    sendJson(response, 200, await buildPerformanceDiagnostics());
    return true;
  }

  if (url.pathname === '/api/backups' && request.method === 'GET') {
    sendJson(response, 200, { backups: listBackups() });
    return true;
  }

  if (url.pathname === '/api/backups' && request.method === 'POST') {
    sendJson(response, 201, { backup: createBackup() });
    return true;
  }

  if (url.pathname === '/api/export/transactions.xlsx' && request.method === 'GET') {
    try {
      const ALLOWED_ORIGINS = ['manual', 'auto', 'import'];
      const ALLOWED_TYPES = ['add', 'remove', 'dividend'];
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

      const filters = {};
      const symbol = url.searchParams.get('symbol');
      const origin = url.searchParams.get('origin');
      const type = url.searchParams.get('type');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      if (symbol) filters.symbol = symbol;
      if (origin) {
        if (!ALLOWED_ORIGINS.includes(origin)) {
          sendJson(response, 400, { error: `origin must be one of: ${ALLOWED_ORIGINS.join(', ')}` });
          return true;
        }
        filters.origin = origin;
      }
      if (type) {
        if (!ALLOWED_TYPES.includes(type)) {
          sendJson(response, 400, { error: `type must be one of: ${ALLOWED_TYPES.join(', ')}` });
          return true;
        }
        filters.type = type;
      }
      if (from) {
        if (!DATE_RE.test(from)) {
          sendJson(response, 400, { error: 'from must be a valid date (YYYY-MM-DD)' });
          return true;
        }
        filters.from = from;
      }
      if (to) {
        if (!DATE_RE.test(to)) {
          sendJson(response, 400, { error: 'to must be a valid date (YYYY-MM-DD)' });
          return true;
        }
        filters.to = to;
      }

      const buffer = await buildTransactionsXlsx(Object.keys(filters).length > 0 ? filters : undefined);
      response.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="ValorGrid_Movimientos.xlsx"',
        'Content-Length': buffer.length,
        'Cache-Control': 'no-store',
      });
      response.end(buffer);
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const backupMatch = url.pathname.match(/^\/api\/backups\/([^/]+)$/);
  if (backupMatch && request.method === 'GET') {
    const backupPath = resolveBackupPath(decodeURIComponent(backupMatch[1]));
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

  if (backupMatch && request.method === 'DELETE') {
    try {
      const result = deleteBackupFile(decodeURIComponent(backupMatch[1]));
      sendJson(response, 200, result);
    } catch (error) {
      sendError(response, sendJson, error);
    }
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
      const quote = await getQuoteForSymbol(url.searchParams.get('symbol'), url.searchParams.get('date'), {
        allowStale: true,
      });
      sendJson(response, 200, { quote });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/market-data/sources' && request.method === 'GET') {
    sendJson(response, 200, listMarketDataSources());
    return true;
  }

  if (url.pathname === '/api/preferences/ui' && request.method === 'GET') {
    try {
      const result = getUiPreferences();
      sendJson(response, 200, result);
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/preferences/ui' && request.method === 'PUT') {
    try {
      const body = await ctx.readJsonBody(request);
      const result = saveUiPreferences(body, request);
      sendJson(response, 200, result);
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  return false;
};
