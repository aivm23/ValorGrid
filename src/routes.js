const { assertCtxDeps } = require('./ctx-utils');
const handleInstrumentRoutes = require('./domains/instruments/route-instruments');
const handleTransactionRoutes = require('./route-transactions');
const handleImportRoutes = require('./route-imports');
const handlePortfolioRoutes = require('./route-portfolio');
const handleAdminRoutes = require('./route-admin');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['path', 'root', 'services'], 'routes');

  const { path, root } = ctx;

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
  if (await handleInstrumentRoutes(ctx, request, response, url)) return true;
  if (await handleTransactionRoutes(ctx, request, response, url)) return true;
  if (await handleImportRoutes(ctx, request, response, url)) return true;
  if (await handlePortfolioRoutes(ctx, request, response, url)) return true;
  if (await handleAdminRoutes(ctx, request, response, url)) return true;
  return false;
}

  Object.assign(ctx, { monthLabel, resolveRequestPath, handleApi });
};
