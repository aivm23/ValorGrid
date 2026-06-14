const { assertCtxDeps } = require('../../platform/ctx-utils');
const ExcelJS = require('exceljs');
const { MOVIMIENTOS_HEADERS, appendSheet } = require('../data-ingestion/template-generator');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'historyRanges',
      'buildPortfolioHistory',
      'getDataVersions',
      'historyBuildIsFresh',
      'dbPath',
      'appInfo',
      'host',
      'port',
      'getHistoryBuild',
      'getTransactions',
    ],
    'diagnostics-service',
  );

  const {
    repositories,
    historyRanges,
    buildPortfolioHistory,
    getDataVersions,
    historyBuildIsFresh,
    dbPath,
    appInfo,
    host,
    port,
    getHistoryBuild,
    getTransactions,
  } = ctx;
  const diagnosticsRepository = repositories.diagnostics || {};
  const { countRows, getOldestHistoryInvalidationDate, getDatabasePageStats } = diagnosticsRepository;
  if (typeof countRows !== 'function') {
    throw new Error('diagnostics-service requires repositories.diagnostics.countRows');
  }
  if (typeof getOldestHistoryInvalidationDate !== 'function') {
    throw new Error('diagnostics-service requires repositories.diagnostics.getOldestHistoryInvalidationDate');
  }
  if (typeof getDatabasePageStats !== 'function') {
    throw new Error('diagnostics-service requires repositories.diagnostics.getDatabasePageStats');
  }

function tableCount(table) {
  return countRows(table);
}

async function buildPerformanceDiagnostics() {
  const ranges = {};

  for (const range of Object.keys(historyRanges)) {
    const started = Date.now();
    const history = await buildPortfolioHistory(range);
    const currentVersions = getDataVersions();
    ranges[range] = {
      ms: Date.now() - started,
      points: history.series.length,
      events: history.events.length,
      granularity: history.granularity,
      cached: historyBuildIsFresh(history.from, history.to, currentVersions),
    };
  }

  return {
    versions: getDataVersions(),
    database: getDatabaseStats(),
    invalidations: {
      pending: tableCount('history_invalidations'),
      oldest: getOldestHistoryInvalidationDate(),
    },
    counts: {
      instruments: tableCount('instruments'),
      transactions: tableCount('transactions'),
      priceCache: tableCount('price_cache'),
      dailyPriceCache: tableCount('daily_price_cache'),
      dailyPriceCacheRanges: tableCount('daily_price_cache_ranges'),
      marketPricesDaily: tableCount('market_prices_daily'),
      fxRatesDaily: tableCount('fx_rates_daily'),
      portfolioPositionsDaily: tableCount('portfolio_positions_daily'),
      portfolioValueDaily: tableCount('portfolio_value_daily'),
      portfolioValueWeekly: tableCount('portfolio_value_weekly'),
      portfolioEvents: tableCount('portfolio_events'),
      historyBuilds: tableCount('history_builds'),
      importBatches: tableCount('import_batches'),
      importRows: tableCount('import_rows'),
    },
    ranges,
  };
}

function getDatabaseStats() {
  const { pageCount, pageSize, journalMode } = getDatabasePageStats();
  return {
    path: dbPath,
    bytes: pageCount * pageSize,
    journalMode,
  };
}

function buildHealth() {
  const build = getHistoryBuild();
  const pendingInvalidations = tableCount('history_invalidations');
  return {
    status: build?.status === 'error' ? 'degraded' : 'ok',
    version: appInfo.version,
    dbPath,
    host,
    port,
    versions: getDataVersions(),
    counts: {
      instruments: tableCount('instruments'),
      transactions: tableCount('transactions'),
      portfolioValueDaily: tableCount('portfolio_value_daily'),
      portfolioValueWeekly: tableCount('portfolio_value_weekly'),
      pendingInvalidations,
    },
    historyBuild: build || null,
    database: getDatabaseStats(),
  };
}

function rowToValorGridExport(row) {
  const type = row.type === 'remove' ? 'venta' : 'compra';
  const shares = Number(row.shares || 0);
return [
    type,
    row.date || '',
    row.symbol || '',
    row.yahooSymbol || '',
    row.type === 'remove' ? -Math.abs(shares) : Math.abs(shares),
    Number(row.price || 0),
    row.currency || 'EUR',
    Number(row.fxToEur || 1),
    Number(row.valueEur || 0),
    Number(row.commissionEur || 0),
    row.externalId || row.id || '',
  ];
}

async function buildTransactionsXlsx() {
  const workbook = new ExcelJS.Workbook();
  const rows = [MOVIMIENTOS_HEADERS, ...getTransactions().map(rowToValorGridExport)];
  appendSheet(workbook, 'Movimientos', rows, MOVIMIENTOS_HEADERS.map(() => 18));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

  Object.assign(ctx, { tableCount, buildPerformanceDiagnostics, getDatabaseStats, buildHealth, buildTransactionsXlsx });
};
