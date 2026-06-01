const { assertCtxDeps } = require('./ctx-utils');
const { resolveRouteHandlers } = require('./route-service-bindings');
const handleInstrumentRoutes = require('./route-instruments');
const handleTransactionRoutes = require('./route-transactions');
const handleImportRoutes = require('./route-imports');
const handlePortfolioRoutes = require('./route-portfolio');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'path',
      'root',
      'appInfo',
      'services',
      'currentYear',
      'listBackups',
      'createBackup',
      'db',
      'dbPath',
      'resolveBackupPath',
      'fsSync',
    ],
    'routes',
  );

  const {
    path,
    root,
    appInfo,
    listBackups,
    createBackup,
    db,
    dbPath,
    resolveBackupPath,
    fsSync,
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
  const {
    sendJson,
    sendText,
    getQuoteForSymbol,
    buildHealth,
    getTransactions,
    getAutoPlans,
    listInstruments,
    listInstrumentGroups,
    buildPerformanceDiagnostics,
    buildTransactionsCsv,
  } = resolveRouteHandlers(ctx);

  if (await handleInstrumentRoutes(ctx, request, response, url)) return true;
  if (await handleTransactionRoutes(ctx, request, response, url)) return true;
  if (await handleImportRoutes(ctx, request, response, url)) return true;
  if (await handlePortfolioRoutes(ctx, request, response, url)) return true;

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
