const { assertCtxDeps, getCtxDep } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'metaKeys', 'memoryCache'], 'meta-state');

  const { db, metaKeys, memoryCache } = ctx;

  function getMetaNumber(key) {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
    return Number(row?.value || 0);
  }

  function bumpMetaVersion(key) {
    const nextValue = getMetaNumber(key) + 1;
    db.prepare(
      `INSERT INTO app_meta (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    ).run(key, String(nextValue));
    return nextValue;
  }

  function getDataVersions() {
    return {
      ledgerVersion: getMetaNumber(metaKeys.ledgerVersion),
      priceVersion: getMetaNumber(metaKeys.priceVersion),
    };
  }

  function recordHistoryInvalidation(fromDate = null, reason = 'ledger') {
    const today = getCtxDep(ctx, 'getToday', 'meta-state')();
    const firstDateFn = ctx.firstTransactionDate;
    const firstDate = typeof firstDateFn === 'function' ? firstDateFn() : null;
    const date = fromDate || firstDate || today;
    db.prepare('INSERT INTO history_invalidations (from_date, reason) VALUES (?, ?)').run(date, reason);
  }

  function invalidateLedger(fromDate = null, reason = 'ledger') {
    memoryCache.clear();
    recordHistoryInvalidation(fromDate, reason);
    return bumpMetaVersion(metaKeys.ledgerVersion);
  }

  function invalidatePrices(fromDate = null, reason = 'price') {
    memoryCache.clear();
    recordHistoryInvalidation(fromDate, reason);
    return bumpMetaVersion(metaKeys.priceVersion);
  }

  Object.assign(ctx, {
    getMetaNumber,
    bumpMetaVersion,
    getDataVersions,
    recordHistoryInvalidation,
    invalidateLedger,
    invalidatePrices,
  });
};

