const { assertCtxDeps, getCtxDep } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['repositories', 'metaKeys', 'memoryCache'], 'meta-state');

  const { repositories, metaKeys, memoryCache } = ctx;
  const metaRepository = repositories.meta || {};
  const { getMetaNumberByKey, setMetaNumberByKey, insertHistoryInvalidation } = metaRepository;
  if (typeof getMetaNumberByKey !== 'function') throw new Error('meta-state requires repositories.meta.getMetaNumberByKey');
  if (typeof setMetaNumberByKey !== 'function') throw new Error('meta-state requires repositories.meta.setMetaNumberByKey');
  if (typeof insertHistoryInvalidation !== 'function') {
    throw new Error('meta-state requires repositories.meta.insertHistoryInvalidation');
  }

  function getMetaNumber(key) {
    return getMetaNumberByKey(key);
  }

  function bumpMetaVersion(key) {
    const nextValue = getMetaNumber(key) + 1;
    setMetaNumberByKey(key, nextValue);
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
    insertHistoryInvalidation(date, reason);
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

