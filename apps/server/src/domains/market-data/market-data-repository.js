const { assertCtxDeps } = require('../../platform/ctx-utils');
const { withTransaction } = require('../../platform/db');

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

  function getLatestCachedPriceQuote(yahooSymbol, requestedDate) {
    return db
      .prepare(
        `SELECT price, currency, market_date AS marketDate, source, requested_date AS requestedDate
         FROM price_cache
         WHERE yahoo_symbol = ? AND requested_date <= ?
         ORDER BY requested_date DESC, market_date DESC, created_at DESC
         LIMIT 1`,
      )
      .get(yahooSymbol, requestedDate);
  }

  function getLatestDailyPrice(yahooSymbol, requestedDate) {
    return db
      .prepare(
        `SELECT price, currency, date AS marketDate, source
         FROM daily_price_cache
         WHERE yahoo_symbol = ? AND date <= ?
         ORDER BY date DESC, created_at DESC
         LIMIT 1`,
      )
      .get(yahooSymbol, requestedDate);
  }

  function getLatestMaterializedPrice(yahooSymbol, requestedDate) {
    return db
      .prepare(
        `SELECT price, currency, date AS marketDate, source
         FROM market_prices_daily
         WHERE yahoo_symbol = ? AND date <= ?
         ORDER BY date DESC, created_at DESC
         LIMIT 1`,
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

  function listPriceSourcesForInstrument(symbol) {
    return db
      .prepare(
        `SELECT instrument_symbol AS instrumentSymbol, provider, provider_symbol AS providerSymbol,
                priority, enabled, pricing_mode AS pricingMode, max_staleness_days AS maxStalenessDays,
                metadata_json AS metadataJson
         FROM instrument_price_sources
         WHERE instrument_symbol = ? AND enabled = 1
         ORDER BY priority ASC, provider ASC, provider_symbol ASC`,
      )
      .all(symbol)
      .map((row) => ({
        ...row,
        metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
        metadataJson: undefined,
      }));
  }

  function replacePriceSourcesForInstrument(symbol, sources = []) {
    const insert = db.prepare(
      `INSERT INTO instrument_price_sources
        (instrument_symbol, provider, provider_symbol, priority, enabled, pricing_mode, max_staleness_days, metadata_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(instrument_symbol, provider, provider_symbol)
       DO UPDATE SET
         priority = excluded.priority,
         enabled = excluded.enabled,
         pricing_mode = excluded.pricing_mode,
         max_staleness_days = excluded.max_staleness_days,
         metadata_json = excluded.metadata_json,
         updated_at = CURRENT_TIMESTAMP`,
    );
    withTransaction(db, () => {
      db.prepare('DELETE FROM instrument_price_sources WHERE instrument_symbol = ?').run(symbol);
      for (const source of sources) {
        insert.run(
          symbol,
          source.provider,
          source.providerSymbol,
          Number(source.priority || 0),
          source.enabled === false ? 0 : 1,
          source.pricingMode || 'provider',
          source.maxStalenessDays ?? null,
          source.metadata ? JSON.stringify(source.metadata) : null,
        );
      }
    });
  }

  function upsertMarketPricePoint(point) {
    db.prepare(
      `INSERT INTO market_price_points
        (instrument_symbol, provider, provider_symbol, date, price, currency, source, quality, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(instrument_symbol, provider, provider_symbol, date)
       DO UPDATE SET
         price = excluded.price,
         currency = excluded.currency,
         source = excluded.source,
         quality = excluded.quality,
         note = excluded.note,
         created_at = CURRENT_TIMESTAMP`,
    ).run(
      point.instrumentSymbol,
      point.provider,
      point.providerSymbol,
      point.date,
      point.price,
      point.currency,
      point.source,
      point.quality || 'ok',
      point.note || null,
    );
  }

  function getLatestMarketPricePoint(symbol, provider, providerSymbol, requestedDate) {
    return db
      .prepare(
        `SELECT instrument_symbol AS instrumentSymbol, provider, provider_symbol AS providerSymbol,
                date, price, currency, source, quality, note
         FROM market_price_points
         WHERE instrument_symbol = ? AND provider = ? AND provider_symbol = ? AND date <= ?
         ORDER BY date DESC, created_at DESC
         LIMIT 1`,
      )
      .get(symbol, provider, providerSymbol, requestedDate);
  }

  function listManualPricePoints(symbol) {
    return db
      .prepare(
        `SELECT instrument_symbol AS instrumentSymbol, provider, provider_symbol AS providerSymbol,
                date, price, currency, source, quality, note
         FROM market_price_points
         WHERE instrument_symbol = ? AND provider = 'manual'
         ORDER BY date DESC, provider_symbol ASC`,
      )
      .all(symbol);
  }

  function listMarketPricePointsInRange(symbol, provider, providerSymbol, fromDate, toDate) {
    return db
      .prepare(
        `SELECT date, price, currency, source, quality
         FROM market_price_points
         WHERE instrument_symbol = ? AND provider = ? AND provider_symbol = ?
           AND date <= ?
           AND (
             date >= ?
             OR date = (
               SELECT MAX(date)
               FROM market_price_points
               WHERE instrument_symbol = ? AND provider = ? AND provider_symbol = ? AND date < ?
             )
           )
         ORDER BY date ASC`,
      )
      .all(symbol, provider, providerSymbol, toDate, fromDate, symbol, provider, providerSymbol, fromDate);
  }

  function upsertProviderState(provider, status, reason = null, retryAfter = null) {
    db.prepare(
      `INSERT INTO market_data_provider_state (provider, status, reason, retry_after, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(provider) DO UPDATE SET
         status = excluded.status,
         reason = excluded.reason,
         retry_after = excluded.retry_after,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(provider, status, reason, retryAfter);
  }

  function listProviderStates() {
    return db
      .prepare(
        `SELECT provider, status, reason, retry_after AS retryAfter, updated_at AS updatedAt
         FROM market_data_provider_state
         ORDER BY provider ASC`,
      )
      .all();
  }

  repositories.marketData = {
    ...(repositories.marketData || {}),
    getCachedPriceQuote,
    getLatestCachedPriceQuote,
    getLatestDailyPrice,
    getLatestMaterializedPrice,
    upsertPriceQuote,
    hasDailyPriceRange,
    getDailyPricesInRange,
    replaceDailyPricesRange,
    listPriceSourcesForInstrument,
    replacePriceSourcesForInstrument,
    upsertMarketPricePoint,
    getLatestMarketPricePoint,
    listManualPricePoints,
    listMarketPricePointsInRange,
    upsertProviderState,
    listProviderStates,
  };
};
