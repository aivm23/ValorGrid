const { assertCtxDeps } = require('../../platform/ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'getToday',
      'getDataVersions',
      'weekKey',
      'markHistoryBuild',
      'getHistoryInstruments',
      'getDailyPrices',
      'getDailyPricesForInstrument',
      'replaceMarketPrices',
      'replaceFxRates',
      'getHistoryEvents',
      'pointDatesFromPriceRows',
      'getTransactionsUntil',
      'transactionSign',
      'toEur',
      'rebuildPortfolioEvents',
      'historyBuildIsFresh',
      'getHistoryBuild',
      'getOldestHistoryInvalidation',
      'addDays',
      'getTransactions',
      'executeDueAutoPlans',
      'resolveHistoryWindow',
      'firstTransactionDate',
    ],
    'history-service',
  );

  const {
    repositories,
    getToday,
    getDataVersions,
    weekKey,
    markHistoryBuild,
    getHistoryInstruments,
    getDailyPrices,
    getDailyPricesForInstrument,
    replaceMarketPrices,
    replaceFxRates,
    getHistoryEvents,
    pointDatesFromPriceRows,
    getTransactionsUntil,
    transactionSign,
    toEur,
    rebuildPortfolioEvents,
    historyBuildIsFresh,
    getHistoryBuild,
    getOldestHistoryInvalidation,
    addDays,
    getTransactions,
    executeDueAutoPlans,
    resolveHistoryWindow,
    firstTransactionDate,
  } = ctx;

  const marketDataRepo = repositories.marketData;

  const historyRepository = repositories.history;
  if (!historyRepository) {
    throw new Error('history-service requires ctx.repositories.history');
  }

  function replaceMaterializedHistory(pointRows, positionRows, replaceFromDate) {
    const deleteFrom = replaceFromDate || pointRows[0]?.date || getToday();
    const versions = getDataVersions();
    const weeklyRows = new Map();

    for (const row of pointRows) {
      weeklyRows.set(weekKey(row.date), row);
    }

    historyRepository.replaceMaterializedHistoryData({
      deleteFrom,
      weekDeleteFrom: weekKey(deleteFrom),
      positionRows,
      pointRows,
      weeklyRows: [...weeklyRows.entries()].map(([weekStart, row]) => ({ weekStart, ...row })),
      versions,
    });
  }

  async function rebuildDailyPortfolioHistory(fromDate, toDate, versionsBefore, coverageFrom = fromDate) {
    const started = Date.now();
    markHistoryBuild('building', coverageFrom, toDate, versionsBefore);

    try {
      const instruments = getHistoryInstruments(toDate);
      const priceRowsBySymbol = new Map();

      const instrumentPriceResults = await Promise.all(
        instruments.map(async (instrument) => ({
          instrument,
          rows: await getDailyPricesForInstrument(instrument, fromDate, toDate).catch(() => []),
        })),
      );

      for (const { instrument, rows } of instrumentPriceResults) {
        const seed = marketDataRepo.getLatestDailyPriceBefore(instrument.yahooSymbol, fromDate);
        if (seed && (!rows.length || rows[0].date > seed.date)) {
          rows.unshift({ date: seed.date, price: seed.price, currency: seed.currency, source: seed.source });
        }
        priceRowsBySymbol.set(instrument.symbol, rows);
        replaceMarketPrices(instrument.symbol, instrument.yahooSymbol, rows);
      }

      const fxRowsByCurrency = new Map();
      const fxIndexes = new Map();
      const currencies = Array.from(
        new Set(
          instruments
            .map((instrument) => String(instrument.currency || 'EUR').toUpperCase())
            .filter((currency) => currency && currency !== 'EUR'),
        ),
      );
      for (const currency of currencies) {
        try {
          const pairSymbol = `${currency}EUR=X`;
          const rows = await getDailyPrices(pairSymbol, fromDate, toDate);
          const seed = marketDataRepo.getLatestDailyPriceBefore(pairSymbol, fromDate);
          if (seed && (!rows.length || rows[0].date > seed.date)) {
            rows.unshift({ date: seed.date, price: seed.price, currency: seed.currency, source: seed.source });
          }
          fxRowsByCurrency.set(currency, rows);
          fxIndexes.set(currency, -1);
          replaceFxRates(`${currency}EUR`, rows);
        } catch {
          fxRowsByCurrency.set(currency, []);
          fxIndexes.set(currency, -1);
        }
      }

      const events = getHistoryEvents(fromDate, toDate);
      const pointDates = pointDatesFromPriceRows(
        priceRowsBySymbol,
        fromDate,
        toDate,
        'daily',
        events.map((event) => event.plotDate || event.date),
      );
      const positions = new Map(
        instruments.map((instrument) => [instrument.symbol, Number(instrument.baseShares || 0)]),
      );
      const transactionRows = getTransactionsUntil(toDate);
      const priceIndexes = new Map(instruments.map((instrument) => [instrument.symbol, -1]));
      let transactionIndex = 0;
      const pointRows = [];
      const positionRows = [];

      for (const date of pointDates) {
        while (transactionIndex < transactionRows.length && transactionRows[transactionIndex].date <= date) {
          const transaction = transactionRows[transactionIndex];
          if (positions.has(transaction.symbol)) {
            positions.set(
              transaction.symbol,
              positions.get(transaction.symbol) + transactionSign(transaction.type) * Number(transaction.shares),
            );
          }
          transactionIndex += 1;
        }

        for (const currency of currencies) {
          const rows = fxRowsByCurrency.get(currency) || [];
          let fxIndex = fxIndexes.get(currency) ?? -1;
          while (fxIndex + 1 < rows.length && rows[fxIndex + 1].date <= date) {
            fxIndex += 1;
          }
          fxIndexes.set(currency, fxIndex);
        }
        let value = 0;
        let dataQuality = 'ok';

        for (const instrument of instruments) {
          const rows = priceRowsBySymbol.get(instrument.symbol) || [];
          let priceIndex = priceIndexes.get(instrument.symbol);
          while (priceIndex + 1 < rows.length && rows[priceIndex + 1].date <= date) {
            priceIndex += 1;
          }
          priceIndexes.set(instrument.symbol, priceIndex);

          const shares = Number(positions.get(instrument.symbol) || 0);
          if (priceIndex < 0) {
            if (Math.abs(shares) > 0.0000001) dataQuality = 'missing';
            positionRows.push({
              date,
              symbol: instrument.symbol,
              shares,
              priceEur: 0,
              valueEur: 0,
              dataQuality: 'missing',
            });
            continue;
          }

          const price = rows[priceIndex];
          const rowQuality = price.date === date ? 'ok' : 'stale';
          if (rowQuality === 'stale' && dataQuality === 'ok') dataQuality = 'stale';
          const currency = String(price.currency || instrument.currency || 'EUR').toUpperCase();
          const fxRows = fxRowsByCurrency.get(currency) || [];
          const fxIndex = fxIndexes.get(currency) ?? -1;
          const fxToEur = currency === 'EUR' ? 1 : fxIndex >= 0 ? Number(fxRows[fxIndex].price) : null;
          if (currency !== 'EUR' && !Number.isFinite(fxToEur)) dataQuality = 'missing';
          const priceEur = toEur(Number(price.price), currency, Number.isFinite(fxToEur) ? fxToEur : 1);
          const valueEur = shares * priceEur;
          value += valueEur;
          positionRows.push({
            date,
            symbol: instrument.symbol,
            shares,
            priceEur,
            valueEur,
            dataQuality: rowQuality,
          });
        }

        pointRows.push({ date, value, dataQuality });
      }

      replaceMaterializedHistory(pointRows, positionRows, fromDate);
      rebuildPortfolioEvents();
      historyRepository.clearHistoryInvalidations();

      const versionsAfter = getDataVersions();
      markHistoryBuild('ready', coverageFrom, toDate, versionsAfter, {
        durationMs: Date.now() - started,
        points: pointRows.length,
      });
    } catch (error) {
      markHistoryBuild('error', fromDate, toDate, getDataVersions(), {
        durationMs: Date.now() - started,
        error: error.message || 'Unknown history build error',
      });
      throw error;
    }
  }

  async function ensureHistoryBuilt(fromDate, toDate) {
    const versions = getDataVersions();
    if (historyBuildIsFresh(fromDate, toDate, versions)) {
      return { cached: true, build: getHistoryBuild() };
    }

    const build = getHistoryBuild();
    const oldestInvalidation = getOldestHistoryInvalidation();
    let rebuildFrom = fromDate;
    let coverageFrom = fromDate;

    if (build?.status === 'ready' && build.from_date <= fromDate) {
      coverageFrom = build.from_date;
      if (oldestInvalidation && oldestInvalidation > build.from_date) {
        rebuildFrom = oldestInvalidation;
      } else if (build.to_date && build.to_date < toDate) {
        rebuildFrom = addDays(build.to_date, 1);
      }
    }

    await rebuildDailyPortfolioHistory(rebuildFrom, toDate, versions, coverageFrom);
    return { cached: false, build: getHistoryBuild() };
  }

  function queryHistorySeries(window) {
    if (window.granularity === 'daily') {
      return historyRepository.listDailyHistorySeries(window.from, window.to);
    }

    return historyRepository.listWeeklyHistorySeries(window.from, window.to);
  }

  function queryHistoryEvents(fromDate, toDate) {
    return historyRepository.listPortfolioEventsByRange(fromDate, toDate);
  }

  function ensureRangeStartPoint(series, fromDate) {
    if (!series.length || series[0].date === fromDate) return series;
    const start = historyRepository.getDailyValuePoint(fromDate);
    return start ? [start, ...series] : series;
  }

  function enrichSeriesWithContributed(series) {
    const transactions = getTransactions();
    let index = 0;
    let contributed = 0;
    return series.map((point) => {
      while (index < transactions.length && transactions[index].date <= point.date) {
        contributed -= Number(transactions[index].cashFlowEur || 0);
        index += 1;
      }
      return { ...point, contributed };
    });
  }

  async function buildPortfolioHistory(inputRange = 'all', inputGranularity = 'auto') {
    await executeDueAutoPlans();

    const window = resolveHistoryWindow(inputRange);
    if (inputGranularity === 'daily' || inputGranularity === 'weekly') {
      window.granularity = inputGranularity;
    }
    if (window.empty) {
      return { ...window, series: [], events: [], meta: { cached: true, points: 0, status: 'empty' } };
    }

    const started = Date.now();
    const buildState = await ensureHistoryBuilt(window.from, window.to);
    let series = enrichSeriesWithContributed(ensureRangeStartPoint(queryHistorySeries(window), window.from));
    const events = queryHistoryEvents(window.from, window.to);

    if (!series.length && events.length) {
      series = enrichSeriesWithContributed(
        ensureRangeStartPoint(
          queryHistorySeries({ ...window, from: firstTransactionDate() || window.from }),
          window.from,
        ),
      );
    }

    const build = getHistoryBuild();
    return {
      range: window.range,
      granularity: window.granularity,
      from: window.from,
      to: window.to,
      series,
      events,
      meta: {
        cached: buildState.cached,
        status: build?.status || 'ready',
        points: series.length,
        durationMs: Date.now() - started,
        buildDurationMs: Number(build?.duration_ms || 0),
        dataQuality: series.some((row) => row.dataQuality === 'missing')
          ? 'missing'
          : series.some((row) => row.dataQuality === 'stale')
            ? 'stale'
            : 'ok',
      },
    };
  }

  Object.assign(ctx, {
    replaceMaterializedHistory,
    rebuildDailyPortfolioHistory,
    ensureHistoryBuilt,
    queryHistorySeries,
    queryHistoryEvents,
    ensureRangeStartPoint,
    enrichSeriesWithContributed,
    buildPortfolioHistory,
  });
};
