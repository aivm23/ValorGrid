const { assertCtxDeps } = require('../../ctx-utils');

const ALLOWED_COUNT_TABLES = new Set([
  'history_invalidations',
  'instruments',
  'transactions',
  'price_cache',
  'daily_price_cache',
  'daily_price_cache_ranges',
  'market_prices_daily',
  'fx_rates_daily',
  'portfolio_positions_daily',
  'portfolio_value_daily',
  'portfolio_value_weekly',
  'portfolio_events',
  'history_builds',
  'import_batches',
  'import_rows',
]);

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'diagnostics-repository');

  const { db, repositories } = ctx;

  function countRows(table) {
    if (!ALLOWED_COUNT_TABLES.has(table)) {
      throw new Error(`diagnostics-repository countRows does not allow table ${table}`);
    }
    return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }

  function getOldestHistoryInvalidationDate() {
    return db.prepare('SELECT MIN(from_date) AS fromDate FROM history_invalidations').get().fromDate;
  }

  function getDatabasePageStats() {
    const pageCount = db.prepare('PRAGMA page_count').get().page_count;
    const pageSize = db.prepare('PRAGMA page_size').get().page_size;
    const journalMode = db.prepare('PRAGMA journal_mode').get().journal_mode;
    return { pageCount, pageSize, journalMode };
  }

  repositories.diagnostics = {
    ...(repositories.diagnostics || {}),
    countRows,
    getOldestHistoryInvalidationDate,
    getDatabasePageStats,
  };
};
