const crypto = require('node:crypto');
const { assertCtxDeps } = require('../../platform/ctx-utils');

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function corporateActionId(symbol, sourceEventId) {
  return `split:${symbol}:${crypto.createHash('sha256').update(sourceEventId).digest('hex').slice(0, 16)}`;
}

function firstTransactionDate(transactionRepository) {
  const dates = (transactionRepository.listTransactions?.() || [])
    .map((transaction) => transaction.date)
    .filter(Boolean)
    .sort();
  return dates[0] || null;
}

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'services',
      'getToday',
      'addDays',
      'dateUtc',
      'toUnixSeconds',
      'listInstruments',
      'fetchYahooChart',
      'invalidateLedger',
      'getMemoryCached',
      'setMemoryCached',
    ],
    'corporate-action-service',
  );

  const {
    repositories,
    getToday,
    addDays,
    dateUtc,
    toUnixSeconds,
    listInstruments,
    fetchYahooChart,
    invalidateLedger,
    getMemoryCached,
    setMemoryCached,
  } = ctx;

  const corporateActionRepository = repositories.corporateActions;
  const transactionRepository = repositories.transactions || {};
  if (!corporateActionRepository) {
    throw new Error('corporate-action-service requires ctx.repositories.corporateActions');
  }

  const {
    upsertSplitAction,
    listCorporateActions: listCorporateActionsFromRepo,
    listSplitsForSymbolUntil,
    listSplitsUntil,
  } = corporateActionRepository;

  function isSplitEligibleInstrument(instrument) {
    const type = String(instrument?.type || '').toLowerCase();
    const yahooSymbol = instrument?.yahooSymbol || instrument?.yahoo_symbol;
    return ['stock', 'etf'].includes(type) && Boolean(yahooSymbol);
  }

  function normalizeScanWindow(input = {}) {
    const today = getToday();
    const fallbackFromDate = firstTransactionDate(transactionRepository) || addDays(today, -3650);
    const fromDate = input.fromDate || fallbackFromDate;
    const toDate = input.toDate || today;
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) throw new Error('Corporate action scan dates must use YYYY-MM-DD');
    if (fromDate > toDate) throw new Error('fromDate cannot be after toDate');
    return { fromDate, toDate };
  }

  async function getYahooSplitEvents(yahooSymbol, fromDate, toDate) {
    const fromUnix = toUnixSeconds(dateUtc(fromDate));
    const toUnix = toUnixSeconds(dateUtc(addDays(toDate, 1)));
    const result = await fetchYahooChart(
      yahooSymbol,
      `period1=${fromUnix}&period2=${toUnix}&interval=1d&events=splits`,
    );

    return Object.values(result.events?.splits || {})
      .map((event) => {
        const numerator = Number(event.numerator);
        const denominator = Number(event.denominator);
        const eventDate = Number(event.date);
        if (
          !Number.isFinite(numerator) ||
          !Number.isFinite(denominator) ||
          !Number.isFinite(eventDate) ||
          numerator <= 0 ||
          denominator <= 0
        ) {
          return null;
        }
        const effectiveDate = new Date(eventDate * 1000).toISOString().slice(0, 10);
        if (effectiveDate < fromDate || effectiveDate > toDate) return null;
        const ratio = numerator / denominator;
        if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) <= 0.0000001) return null;
        return {
          sourceEventId: `${yahooSymbol}:${effectiveDate}:${numerator}:${denominator}`,
          effectiveDate,
          oldShares: denominator,
          newShares: numerator,
          ratio,
        };
      })
      .filter(Boolean);
  }

  async function scanCorporateActionsForInstrument(instrumentInput, fromDateInput = null, toDateInput = null) {
    const instrument =
      typeof instrumentInput === 'string'
        ? listInstruments().find((item) => item.symbol === instrumentInput)
        : instrumentInput;
    if (!isSplitEligibleInstrument(instrument)) {
      return { scanned: false, created: 0, updated: 0, actions: [], invalidatedFrom: null };
    }

    const { fromDate, toDate } = normalizeScanWindow({ fromDate: fromDateInput, toDate: toDateInput });
    const yahooSymbol = instrument.yahooSymbol || instrument.yahoo_symbol;
    const cacheKey = `corporate-actions:${instrument.symbol}:${fromDate}:${toDate}`;
    const cached = getMemoryCached(cacheKey);
    if (cached) return { ...cached, created: 0, updated: 0, cached: true };

    const events = await getYahooSplitEvents(yahooSymbol, fromDate, toDate);
    let created = 0;
    let updated = 0;
    let invalidatedFrom = null;
    const actions = [];

    for (const event of events) {
      const result = upsertSplitAction({
        id: corporateActionId(instrument.symbol, event.sourceEventId),
        type: 'split',
        symbol: instrument.symbol,
        yahooSymbol,
        source: 'Yahoo Finance',
        ...event,
      });
      actions.push(result.action);
      if (result.created) created += 1;
      if (result.updated) updated += 1;
      if ((result.created || result.updated) && (!invalidatedFrom || event.effectiveDate < invalidatedFrom)) {
        invalidatedFrom = event.effectiveDate;
      }
    }

    if (invalidatedFrom) invalidateLedger(invalidatedFrom, 'corporate-action-split');
    return setMemoryCached(cacheKey, { scanned: true, created, updated, actions, invalidatedFrom });
  }

  async function scanCorporateActions(input = {}) {
    const { fromDate, toDate } = normalizeScanWindow(input);
    const wanted = input.symbols?.length
      ? new Set(
          input.symbols
            .map((symbol) =>
              String(symbol || '')
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        )
      : null;
    const instruments = listInstruments().filter(
      (instrument) =>
        isSplitEligibleInstrument(instrument) && (!wanted || wanted.has(String(instrument.symbol).toUpperCase())),
    );
    const summary = {
      scannedSymbols: 0,
      createdActions: 0,
      updatedActions: 0,
      failedSymbols: [],
      fromDate,
      toDate,
    };
    const actions = [];

    for (const instrument of instruments) {
      summary.scannedSymbols += 1;
      try {
        const result = await scanCorporateActionsForInstrument(instrument, fromDate, toDate);
        summary.createdActions += result.created;
        summary.updatedActions += result.updated;
        actions.push(...result.actions);
      } catch (error) {
        summary.failedSymbols.push({
          symbol: instrument.symbol,
          yahooSymbol: instrument.yahooSymbol || instrument.yahoo_symbol,
          error: error.message,
        });
      }
    }

    return { summary, actions };
  }

  function listCorporateActions(filters = {}) {
    return { actions: listCorporateActionsFromRepo(filters) };
  }

  Object.assign(ctx, {
    getYahooSplitEvents,
    scanCorporateActions,
    scanCorporateActionsForInstrument,
    listCorporateActions,
    listSplitsForSymbolUntil,
    listSplitsUntil,
  });
};
