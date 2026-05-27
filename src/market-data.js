module.exports = function attach(ctx) {
  with (ctx) {
async function fetchYahooChart(yahooSymbol, query) {
  const cacheKey = `${yahooSymbol}:${query}`;
  const cached = getMemoryCached(cacheKey);
  if (cached) return cached;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${query}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 ValorGrid',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance responded ${response.status}`);
  }

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo Finance did not return chart data for ${yahooSymbol}`);
  }

  return setMemoryCached(cacheKey, result);
}

async function fetchLatestYahooPrice(yahooSymbol) {
  const result = await fetchYahooChart(yahooSymbol, 'range=1d&interval=1d');
  const meta = result.meta;
  const price = Number(meta?.regularMarketPrice ?? meta?.previousClose);

  if (!Number.isFinite(price)) {
    throw new Error(`Yahoo Finance did not return a valid price for ${yahooSymbol}`);
  }

  return {
    price,
    currency: meta.currency || 'EUR',
    marketDate: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
      : getToday(),
    marketTime: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    source: 'Yahoo Finance',
    stale: false,
  };
}

function firstDailyCloseAtOrAfter(result, requestedDate) {
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const currency = result.meta?.currency || 'EUR';
  const targetDate = new Date(`${requestedDate}T00:00:00.000Z`);
  const targetTime = Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
  );

  for (let index = 0; index < timestamps.length; index += 1) {
    const close = Number(closes[index]);
    const closeDate = new Date(timestamps[index] * 1000);
    const closeDayTime = Date.UTC(
      closeDate.getUTCFullYear(),
      closeDate.getUTCMonth(),
      closeDate.getUTCDate(),
    );

    if (closeDayTime >= targetTime && Number.isFinite(close)) {
      return {
        price: close,
        currency,
        marketDate: closeDate.toISOString().slice(0, 10),
        marketTime: closeDate.toISOString(),
        source: 'Yahoo Finance',
        stale: false,
      };
    }
  }

  return null;
}

async function fetchDatedYahooPrice(yahooSymbol, requestedDate) {
  const cached = db
    .prepare(
      `SELECT price, currency, market_date AS marketDate, source
       FROM price_cache
       WHERE yahoo_symbol = ? AND requested_date = ?`,
    )
    .get(yahooSymbol, requestedDate);

  if (cached) {
    return { ...cached, stale: false, cached: true };
  }

  const periodStart = new Date(`${requestedDate}T00:00:00.000Z`);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 8);
  const query = new URLSearchParams({
    period1: String(toUnixSeconds(periodStart)),
    period2: String(toUnixSeconds(periodEnd)),
    interval: '1d',
  });

  const result = await fetchYahooChart(yahooSymbol, query.toString());
  const quote = firstDailyCloseAtOrAfter(result, requestedDate);
  if (!quote) {
    throw new Error(`Quote not available for ${yahooSymbol} at ${requestedDate}`);
  }

  db.prepare(
    `INSERT OR REPLACE INTO price_cache
      (yahoo_symbol, requested_date, market_date, price, currency, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(yahooSymbol, requestedDate, quote.marketDate, quote.price, quote.currency, quote.source);

  return quote;
}

function dailyCacheHasRange(yahooSymbol, fromDate, toDate) {
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

function getCachedDailyPrices(yahooSymbol, fromDate, toDate) {
  return db
    .prepare(
      `SELECT date, price, currency, source
       FROM daily_price_cache
       WHERE yahoo_symbol = ? AND date BETWEEN ? AND ?
       ORDER BY date ASC`,
    )
    .all(yahooSymbol, fromDate, toDate);
}

function parseDailyPrices(result) {
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const currency = result.meta?.currency || 'EUR';

  return timestamps
    .map((timestamp, index) => {
      const price = Number(closes[index]);
      if (!Number.isFinite(price) || price <= 0) return null;
      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        price,
        currency,
        source: 'Yahoo Finance',
      };
    })
    .filter(Boolean);
}

async function getDailyPrices(yahooSymbol, fromDate, toDate) {
  if (dailyCacheHasRange(yahooSymbol, fromDate, toDate)) {
    return getCachedDailyPrices(yahooSymbol, fromDate, toDate);
  }

  try {
    const periodStart = dateUtc(fromDate);
    const periodEnd = dateUtc(addDays(toDate, 1));
    const query = new URLSearchParams({
      period1: String(toUnixSeconds(periodStart)),
      period2: String(toUnixSeconds(periodEnd)),
      interval: '1d',
    });
    const result = await fetchYahooChart(yahooSymbol, query.toString());
    const prices = parseDailyPrices(result);
    const insert = db.prepare(
      `INSERT OR REPLACE INTO daily_price_cache
        (yahoo_symbol, date, price, currency, source)
       VALUES (?, ?, ?, ?, ?)`,
    );

    db.exec('BEGIN');
    for (const price of prices) {
      insert.run(yahooSymbol, price.date, price.price, price.currency, price.source);
    }
    db.prepare(
      `INSERT OR REPLACE INTO daily_price_cache_ranges
        (yahoo_symbol, from_date, to_date)
       VALUES (?, ?, ?)`,
    ).run(yahooSymbol, fromDate, toDate);
    db.exec('COMMIT');
    invalidatePrices(fromDate, 'daily-price-cache');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // No transaction was opened if the network request failed before writing.
    }
    const cachedRows = getCachedDailyPrices(yahooSymbol, fromDate, toDate);
    if (cachedRows.length) {
      return cachedRows.map((row) => ({ ...row, source: `${row.source} cache parcial` }));
    }
    throw error;
  }

  return getCachedDailyPrices(yahooSymbol, fromDate, toDate);
}

async function getQuoteForSymbol(inputSymbol, requestedDate = null) {
  const instrument = getInstrumentByInput(inputSymbol);
  const yahooSymbol = instrument?.yahoo_symbol || String(inputSymbol || '').trim();

  if (!yahooSymbol) {
    throw new Error('Missing symbol');
  }

  const quote = requestedDate
    ? await fetchDatedYahooPrice(yahooSymbol, requestedDate)
    : await fetchLatestYahooPrice(yahooSymbol);

  return {
    symbol: instrument?.symbol || normalizeSymbol(inputSymbol),
    yahooSymbol,
    ...quote,
  };
}

async function getQuoteForYahooSymbol(symbol, yahooSymbol, requestedDate = null) {
  const resolvedYahooSymbol = String(yahooSymbol || symbol || '').trim();
  if (!resolvedYahooSymbol) throw new Error('Missing Yahoo symbol');
  const quote = requestedDate
    ? await fetchDatedYahooPrice(resolvedYahooSymbol, requestedDate)
    : await fetchLatestYahooPrice(resolvedYahooSymbol);
  return {
    symbol: normalizeSymbol(symbol || resolvedYahooSymbol),
    yahooSymbol: resolvedYahooSymbol,
    ...quote,
  };
}

async function getUsdToEur(requestedDate = null) {
  const quote = await getQuoteForSymbol('USDEUR', requestedDate);
  return quote.price || 1;
}

async function getFxToEur(currencyInput, requestedDate = null) {
  const currency = String(currencyInput || 'EUR').trim().toUpperCase();
  if (!currency || currency === 'EUR') return 1;
  if (currency === 'USD') return getUsdToEur(requestedDate);
  try {
    const yahooSymbol = `${currency}EUR=X`;
    const quote = await getQuoteForYahooSymbol(`${currency}EUR`, yahooSymbol, requestedDate);
    return Number.isFinite(Number(quote.price)) ? Number(quote.price) : null;
  } catch {
    return null;
  }
}
    Object.assign(ctx, { fetchYahooChart, fetchLatestYahooPrice, firstDailyCloseAtOrAfter, fetchDatedYahooPrice, dailyCacheHasRange, getCachedDailyPrices, parseDailyPrices, getDailyPrices, getQuoteForSymbol, getQuoteForYahooSymbol, getUsdToEur, getFxToEur });
  }
};
