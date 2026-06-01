const { assertCtxDeps } = require('../../ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'historyRanges',
      'getToday',
      'addYears',
      'listInstruments',
      'dateUtc',
      'formatDateUtc',
      'historyBuildKey',
      'getTransactions',
    ],
    'history-core',
  );

  const {
    repositories,
    historyRanges,
    getToday,
    addYears,
    listInstruments,
    dateUtc,
    formatDateUtc,
    historyBuildKey,
    getTransactions,
  } = ctx;

  const historyRepository = repositories.history;
  if (!historyRepository) {
    throw new Error('history-core requires ctx.repositories.history');
  }

function firstTransactionDate() {
  return historyRepository.getFirstTransactionDate();
}

function resolveHistoryWindow(inputRange) {
  const range = historyRanges[inputRange] ? inputRange : 'all';
  const firstDate = firstTransactionDate();
  const to = getToday();

  if (!firstDate) {
    return { range, granularity: historyRanges[range].granularity, from: to, to, empty: true };
  }

  let requestedFrom = firstDate;
  if (range === 'ytd') {
    requestedFrom = `${to.slice(0, 4)}-01-01`;
  } else if (historyRanges[range].years) {
    requestedFrom = addYears(to, -historyRanges[range].years);
  }

  const from = range === 'all' ? firstDate : requestedFrom;
  return {
    range,
    granularity: historyRanges[range].granularity,
    from,
    to,
    empty: from > to,
  };
}

function getHistoryInstruments(toDate) {
  return listInstruments()
    .filter((instrument) => instrument.type !== 'fx')
    .filter((instrument) => {
      if (Number(instrument.baseShares || 0) !== 0) return true;
      return historyRepository.hasTransactionForSymbolUntil(instrument.symbol, toDate);
    });
}

function getTransactionsUntil(toDate) {
  return historyRepository.listTransactionsUntil(toDate);
}

function getHistoryEvents(fromDate, toDate) {
  return historyRepository.listHistoryEventsFromTransactions(fromDate, toDate);
}

function weekKey(dateValue) {
  const date = dateUtc(dateValue);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return formatDateUtc(date);
}

function reduceDatesForGranularity(dates, granularity) {
  if (granularity === 'daily') return dates;

  const byWeek = new Map();
  for (const date of dates) {
    byWeek.set(weekKey(date), date);
  }
  return [...byWeek.values()].sort();
}

function pointDatesFromPriceRows(priceRowsBySymbol, fromDate, toDate, granularity, eventDates = []) {
  const dates = new Set();
  dates.add(fromDate);
  for (const rows of priceRowsBySymbol.values()) {
    for (const row of rows) {
      if (row.date >= fromDate && row.date <= toDate) dates.add(row.date);
    }
  }
  const reducedDates = new Set(reduceDatesForGranularity([...dates].sort(), granularity));
  reducedDates.add(fromDate);
  for (const date of eventDates) {
    if (date >= fromDate && date <= toDate) reducedDates.add(date);
  }
  return [...reducedDates].sort();
}

function getHistoryBuild() {
  return historyRepository.getHistoryBuildByKey(historyBuildKey);
}

function getOldestHistoryInvalidation() {
  return historyRepository.getOldestHistoryInvalidationDate();
}

function historyBuildIsFresh(fromDate, toDate, versions) {
  const build = getHistoryBuild();
  const invalidation = historyRepository.hasHistoryInvalidations();
  const weeklyReady = historyRepository.hasWeeklyPortfolioValues();
  return Boolean(
    build &&
      !invalidation &&
      weeklyReady &&
      build.status === 'ready' &&
      build.from_date <= fromDate &&
      build.to_date >= toDate &&
      Number(build.ledger_version) === versions.ledgerVersion &&
      Number(build.price_version) === versions.priceVersion,
  );
}

function markHistoryBuild(status, fromDate, toDate, versions, details = {}) {
  historyRepository.upsertHistoryBuild({
    buildKey: historyBuildKey,
    fromDate,
    toDate,
    ledgerVersion: versions.ledgerVersion,
    priceVersion: versions.priceVersion,
    status,
    error: details.error || null,
    durationMs: Number(details.durationMs || 0),
    points: Number(details.points || 0),
  });
}

function replaceMarketPrices(symbol, yahooSymbol, rows) {
  historyRepository.replaceMarketPricesRows(symbol, yahooSymbol, rows);
}

function replaceFxRates(pair, rows) {
  historyRepository.replaceFxRatesRows(pair, rows);
}

function rebuildPortfolioEvents() {
  historyRepository.replacePortfolioEvents(getTransactions());
}

  Object.assign(ctx, { firstTransactionDate, resolveHistoryWindow, getHistoryInstruments, getTransactionsUntil, getHistoryEvents, weekKey, reduceDatesForGranularity, pointDatesFromPriceRows, getHistoryBuild, getOldestHistoryInvalidation, historyBuildIsFresh, markHistoryBuild, replaceMarketPrices, replaceFxRates, rebuildPortfolioEvents });
};
