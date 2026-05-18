module.exports = function attach(ctx) {
  with (ctx) {
function tableCount(table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
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
      oldest: db.prepare('SELECT MIN(from_date) AS fromDate FROM history_invalidations').get().fromDate,
    },
    counts: {
      instruments: tableCount('instruments'),
      transactions: tableCount('transactions'),
      priceCache: tableCount('price_cache'),
      dailyPriceCache: tableCount('daily_price_cache'),
      dailyPriceCacheRanges: tableCount('daily_price_cache_ranges'),
      portfolioHistoryCache: tableCount('portfolio_history_cache'),
      portfolioSnapshots: tableCount('portfolio_snapshots'),
      marketPricesDaily: tableCount('market_prices_daily'),
      fxRatesDaily: tableCount('fx_rates_daily'),
      portfolioPositionsDaily: tableCount('portfolio_positions_daily'),
      portfolioValueDaily: tableCount('portfolio_value_daily'),
      portfolioValueWeekly: tableCount('portfolio_value_weekly'),
      portfolioEvents: tableCount('portfolio_events'),
      historyBuilds: tableCount('history_builds'),
    },
    ranges,
  };
}

function getDatabaseStats() {
  const pageCount = db.prepare('PRAGMA page_count').get().page_count;
  const pageSize = db.prepare('PRAGMA page_size').get().page_size;
  const journalMode = db.prepare('PRAGMA journal_mode').get().journal_mode;
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

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildTransactionsCsv() {
  const headers = [
    'id',
    'date',
    'marketDate',
    'symbol',
    'type',
    'shares',
    'price',
    'currency',
    'valueEur',
    'commissionEur',
    'cashFlowEur',
    'origin',
    'autoKey',
  ];
  const lines = [headers.join(';')];
  for (const row of getTransactions()) {
    lines.push(headers.map((key) => csvCell(row[key])).join(';'));
  }
  return `${lines.join('\n')}\n`;
}
    Object.assign(ctx, { tableCount, buildPerformanceDiagnostics, getDatabaseStats, buildHealth, csvCell, buildTransactionsCsv });
  }
};
