module.exports = function attach(ctx) {
  with (ctx) {
function firstTransactionDate() {
  return db.prepare('SELECT MIN(date) AS date FROM transactions').get().date;
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
      return Boolean(
        db
          .prepare('SELECT 1 FROM transactions WHERE symbol = ? AND date <= ? LIMIT 1')
          .get(instrument.symbol, toDate),
      );
    });
}

function getTransactionsUntil(toDate) {
  return db
    .prepare(
      `SELECT type, symbol, date, shares
       FROM transactions
       WHERE date <= ?
       ORDER BY date ASC, created_at ASC`,
    )
    .all(toDate);
}

function getHistoryEvents(fromDate, toDate) {
  return db
    .prepare(
      `SELECT id, type, symbol, name, date, market_date AS marketDate, shares,
              COALESCE(market_date, date) AS plotDate,
              value_eur AS valueEur, price, currency, origin, color
       FROM transactions
       WHERE date BETWEEN ? AND ?
       ORDER BY date ASC, created_at ASC`,
    )
    .all(fromDate, toDate)
    .filter((event) => event.plotDate >= fromDate && event.plotDate <= toDate);
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
  return db.prepare('SELECT * FROM history_builds WHERE build_key = ?').get(historyBuildKey);
}

function getOldestHistoryInvalidation() {
  return db.prepare('SELECT MIN(from_date) AS fromDate FROM history_invalidations').get().fromDate;
}

function historyBuildIsFresh(fromDate, toDate, versions) {
  const build = getHistoryBuild();
  const invalidation = db.prepare('SELECT 1 FROM history_invalidations LIMIT 1').get();
  const weeklyReady = db.prepare('SELECT 1 FROM portfolio_value_weekly LIMIT 1').get();
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
  db.prepare(
    `INSERT INTO history_builds
      (build_key, from_date, to_date, ledger_version, price_version, status, error, duration_ms, points, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(build_key) DO UPDATE SET
       from_date = excluded.from_date,
       to_date = excluded.to_date,
       ledger_version = excluded.ledger_version,
       price_version = excluded.price_version,
       status = excluded.status,
       error = excluded.error,
       duration_ms = excluded.duration_ms,
       points = excluded.points,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(
    historyBuildKey,
    fromDate,
    toDate,
    versions.ledgerVersion,
    versions.priceVersion,
    status,
    details.error || null,
    Number(details.durationMs || 0),
    Number(details.points || 0),
  );
}

function replaceMarketPrices(symbol, yahooSymbol, rows) {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO market_prices_daily
      (symbol, yahoo_symbol, date, price, currency, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      insert.run(symbol, yahooSymbol, row.date, row.price, row.currency, row.source);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function replaceFxRates(pair, rows) {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO fx_rates_daily (pair, date, rate, source)
     VALUES (?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      insert.run(pair, row.date, row.price, row.source);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function rebuildPortfolioEvents() {
  db.exec('DELETE FROM portfolio_events');
  const insert = db.prepare(
    `INSERT OR REPLACE INTO portfolio_events
      (id, type, symbol, name, date, market_date, plot_date, shares, value_eur, price, currency, origin, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const event of getTransactions()) {
      insert.run(
        event.id,
        event.type,
        event.symbol,
        event.name,
        event.date,
        event.marketDate || null,
        event.marketDate || event.date,
        event.shares,
        event.valueEur,
        event.price,
        event.currency,
        event.origin,
        event.color,
        event.createdAt,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
    Object.assign(ctx, { firstTransactionDate, resolveHistoryWindow, getHistoryInstruments, getTransactionsUntil, getHistoryEvents, weekKey, reduceDatesForGranularity, pointDatesFromPriceRows, getHistoryBuild, getOldestHistoryInvalidation, historyBuildIsFresh, markHistoryBuild, replaceMarketPrices, replaceFxRates, rebuildPortfolioEvents });
  }
};
