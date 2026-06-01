const { assertCtxDeps } = require('./ctx-utils');
const { withTransaction } = require('./db');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'market-data-repository');

  const { db, repositories } = ctx;

  function getCachedPriceQuote(yahooSymbol, requestedDate) {
    return db
      .prepare(
        `SELECT price, currency, market_date AS marketDate, source
         FROM price_cache
         WHERE yahoo_symbol = ? AND requested_date = ?`,
      )
      .get(yahooSymbol, requestedDate);
  }

  function upsertPriceQuote(yahooSymbol, requestedDate, quote) {
    db.prepare(
      `INSERT OR REPLACE INTO price_cache
        (yahoo_symbol, requested_date, market_date, price, currency, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(yahooSymbol, requestedDate, quote.marketDate, quote.price, quote.currency, quote.source);
  }

  function hasDailyPriceRange(yahooSymbol, fromDate, toDate) {
    return Boolean(
      db
        .prepare(
          `SELECT 1
           FROM daily_price_cache_ranges
           WHERE yahoo_symbol = ? AND from_date <= ? AND to_date >= ?
           LIMIT 1`,
        )
        .get(yahooSymbol, fromDate, toDate),
    );
  }

  function getDailyPricesInRange(yahooSymbol, fromDate, toDate) {
    return db
      .prepare(
        `SELECT date, price, currency, source
         FROM daily_price_cache
         WHERE yahoo_symbol = ? AND date BETWEEN ? AND ?
         ORDER BY date ASC`,
      )
      .all(yahooSymbol, fromDate, toDate);
  }

  function replaceDailyPricesRange(yahooSymbol, fromDate, toDate, prices) {
    const insert = db.prepare(
      `INSERT OR REPLACE INTO daily_price_cache
        (yahoo_symbol, date, price, currency, source)
       VALUES (?, ?, ?, ?, ?)`,
    );

    withTransaction(db, () => {
      for (const price of prices) {
        insert.run(yahooSymbol, price.date, price.price, price.currency, price.source);
      }
      db.prepare(
        `INSERT OR REPLACE INTO daily_price_cache_ranges
          (yahoo_symbol, from_date, to_date)
         VALUES (?, ?, ?)`,
      ).run(yahooSymbol, fromDate, toDate);
    });
  }

  repositories.marketData = {
    ...(repositories.marketData || {}),
    getCachedPriceQuote,
    upsertPriceQuote,
    hasDailyPriceRange,
    getDailyPricesInRange,
    replaceDailyPricesRange,
  };
};
