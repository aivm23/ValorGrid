const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'history-repository');

  const { db, repositories } = ctx;

  function getFirstTransactionDate() {
    return db.prepare('SELECT MIN(date) AS date FROM transactions').get().date;
  }

  function hasTransactionForSymbolUntil(symbol, toDate) {
    return Boolean(
      db
        .prepare('SELECT 1 FROM transactions WHERE symbol = ? AND date <= ? LIMIT 1')
        .get(symbol, toDate),
    );
  }

  function listTransactionsUntil(toDate) {
    return db
      .prepare(
        `SELECT type, symbol, date, shares
         FROM transactions
         WHERE date <= ?
         ORDER BY date ASC, created_at ASC`,
      )
      .all(toDate);
  }

  function listHistoryEventsFromTransactions(fromDate, toDate) {
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

  function getHistoryBuildByKey(buildKey) {
    return db.prepare('SELECT * FROM history_builds WHERE build_key = ?').get(buildKey);
  }

  function getOldestHistoryInvalidationDate() {
    return db.prepare('SELECT MIN(from_date) AS fromDate FROM history_invalidations').get().fromDate;
  }

  function hasHistoryInvalidations() {
    return Boolean(db.prepare('SELECT 1 FROM history_invalidations LIMIT 1').get());
  }

  function hasWeeklyPortfolioValues() {
    return Boolean(db.prepare('SELECT 1 FROM portfolio_value_weekly LIMIT 1').get());
  }

  function upsertHistoryBuild({
    buildKey,
    fromDate,
    toDate,
    ledgerVersion,
    priceVersion,
    status,
    error = null,
    durationMs = 0,
    points = 0,
  }) {
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
    ).run(buildKey, fromDate, toDate, ledgerVersion, priceVersion, status, error, Number(durationMs), Number(points));
  }

  function replaceMarketPricesRows(symbol, yahooSymbol, rows) {
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

  function replaceFxRatesRows(pair, rows) {
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

  function replacePortfolioEvents(transactions) {
    const insert = db.prepare(
      `INSERT OR REPLACE INTO portfolio_events
        (id, type, symbol, name, date, market_date, plot_date, shares, value_eur, price, currency, origin, color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM portfolio_events');
      for (const event of transactions) {
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

  function replaceMaterializedHistoryData({ deleteFrom, weekDeleteFrom, positionRows, pointRows, weeklyRows, versions }) {
    const positionInsert = db.prepare(
      `INSERT INTO portfolio_positions_daily
        (date, symbol, shares, price_eur, value_eur, data_quality)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const totalInsert = db.prepare(
      `INSERT INTO portfolio_value_daily (date, value_eur, data_quality)
       VALUES (?, ?, ?)`,
    );
    const weeklyInsert = db.prepare(
      `INSERT OR REPLACE INTO portfolio_value_weekly
        (week_start, date, value_eur, data_quality, ledger_version, price_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM portfolio_positions_daily WHERE date >= ?').run(deleteFrom);
      db.prepare('DELETE FROM portfolio_value_daily WHERE date >= ?').run(deleteFrom);
      db.prepare('DELETE FROM portfolio_value_weekly WHERE week_start >= ?').run(weekDeleteFrom || deleteFrom);

      for (const row of positionRows) {
        positionInsert.run(row.date, row.symbol, row.shares, row.priceEur, row.valueEur, row.dataQuality);
      }
      for (const row of pointRows) {
        totalInsert.run(row.date, row.value, row.dataQuality);
      }
      for (const row of weeklyRows) {
        weeklyInsert.run(
          row.weekStart,
          row.date,
          row.value,
          row.dataQuality,
          versions.ledgerVersion,
          versions.priceVersion,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function clearHistoryInvalidations() {
    db.prepare('DELETE FROM history_invalidations').run();
  }

  function listDailyHistorySeries(fromDate, toDate) {
    return db
      .prepare(
        `SELECT date, value_eur AS value, data_quality AS dataQuality
         FROM portfolio_value_daily
         WHERE date BETWEEN ? AND ?
         ORDER BY date ASC`,
      )
      .all(fromDate, toDate);
  }

  function listWeeklyHistorySeries(fromDate, toDate) {
    return db
      .prepare(
        `SELECT date, value_eur AS value, data_quality AS dataQuality
         FROM portfolio_value_weekly
         WHERE date BETWEEN ? AND ?
         ORDER BY date ASC`,
      )
      .all(fromDate, toDate);
  }

  function listPortfolioEventsByRange(fromDate, toDate) {
    return db
      .prepare(
        `SELECT id, type, symbol, name, date, market_date AS marketDate, plot_date AS plotDate,
                shares, value_eur AS valueEur, price, currency, origin, color, created_at AS createdAt
         FROM portfolio_events
         WHERE plot_date BETWEEN ? AND ?
         ORDER BY plot_date ASC, created_at ASC`,
      )
      .all(fromDate, toDate);
  }

  function getDailyValuePoint(date) {
    return db
      .prepare(
        `SELECT date, value_eur AS value, data_quality AS dataQuality
         FROM portfolio_value_daily
         WHERE date = ?`,
      )
      .get(date);
  }

  repositories.history = {
    ...(repositories.history || {}),
    getFirstTransactionDate,
    hasTransactionForSymbolUntil,
    listTransactionsUntil,
    listHistoryEventsFromTransactions,
    getHistoryBuildByKey,
    getOldestHistoryInvalidationDate,
    hasHistoryInvalidations,
    hasWeeklyPortfolioValues,
    upsertHistoryBuild,
    replaceMarketPricesRows,
    replaceFxRatesRows,
    replacePortfolioEvents,
    replaceMaterializedHistoryData,
    clearHistoryInvalidations,
    listDailyHistorySeries,
    listWeeklyHistorySeries,
    listPortfolioEventsByRange,
    getDailyValuePoint,
  };
};
