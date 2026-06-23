const { assertCtxDeps } = require('./platform/ctx-utils');
const handleInstrumentRoutes = require('./domains/instruments/route-instruments');
const handleTransactionRoutes = require('./domains/transactions/route-transactions');
const handleImportRoutes = require('./domains/data-ingestion/route-data-ingestion');
const handlePortfolioRoutes = require('./domains/portfolio/route-portfolio');
const handleAdminRoutes = require('./domains/admin/route-admin');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['path', 'config', 'services'], 'routes');

  const { path, config } = ctx;

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
  const relativePath = cleanPath === '/' ? '' : cleanPath.replace(/^\/+/, '');
  const base = cleanPath === '/' || !cleanPath.startsWith('/assets/') ? config.staticRoot : config.repoRoot;
  const resolvedPath = cleanPath === '/' ? path.join(base, 'index.html') : path.resolve(base, relativePath);
  if (!resolvedPath.startsWith(base + path.sep) && resolvedPath !== base) return null;
  if (path.basename(resolvedPath) === 'secrets.json') return null;
  return resolvedPath;
}

async function handleApi(request, response, url) {
  if (await ctx.extensions.handleApiRoute(ctx, request, response, url)) return true;
  if (await ctx.handleAlphaVantageKeyRoutes(ctx, request, response, url)) return true;
  if (await handleInstrumentRoutes(ctx, request, response, url)) return true;
  if (await handleTransactionRoutes(ctx, request, response, url)) return true;
  if (await handleImportRoutes(ctx, request, response, url)) return true;
  if (await handlePortfolioRoutes(ctx, request, response, url)) return true;
  if (await handleAdminRoutes(ctx, request, response, url)) return true;
  return false;
}

  Object.assign(ctx, { monthLabel, resolveRequestPath, handleApi });
};
