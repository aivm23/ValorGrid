const { assertCtxDeps } = require('../../platform/ctx-utils');
const {
  PROVIDER_LABELS,
  alphaKey,
  alphaUrl,
  alphaSpotUrl,
  alphaSpotFunctionForSource,
  parseAlphaDaily,
  parseAlphaSpot,
  makeResolvePriceSources,
  quoteFromMarketPoint,
} = require('./market-data-providers');
const { makeMarketDataAdmin } = require('./market-data-admin');
const { makeGetYahooDividendEvents } = require('./market-data-dividends');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'getMemoryCached',
      'setMemoryCached',
      'getToday',
      'toUnixSeconds',
      'dateUtc',
      'addDays',
      'invalidatePrices',
      'getInstrumentByInput',
      'normalizeSymbol',
    ],
    'market-data',
  );

  const {
    repositories,
    getMemoryCached,
    setMemoryCached,
    getToday,
    toUnixSeconds,
    dateUtc,
    addDays,
    invalidatePrices,
    getInstrumentByInput,
    normalizeSymbol,
  } = ctx;

  const marketDataRepository = repositories.marketData;
  if (!marketDataRepository) {
    throw new Error('market-data requires ctx.repositories.marketData');
  }

  const {
    getCachedPriceQuote,
    getLatestCachedPriceQuote,
    getLatestDailyPrice,
    getLatestMaterializedPrice,
    upsertPriceQuote,
    hasDailyPriceRange,
    getDailyPricesInRange,
    replaceDailyPricesRange,
    listPriceSourcesForInstrument,
    upsertMarketPricePoint,
    getLatestMarketPricePoint,
    listManualPricePoints,
    listMarketPricePointsInRange,
    upsertProviderState,
    listProviderStates,
  } = marketDataRepository;

const resolvePriceSourcesForInstrument = makeResolvePriceSources(listPriceSourcesForInstrument);

async function alphaFetch(url, _source, _instrument) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 ValorGrid' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Alpha Vantage responded ${response.status}`);
  return response.json();
}

async function fetchAlphaSpotPrice(source, instrument) {
  const cacheKey = `alpha:spot:${source.providerSymbol}`;
  const cached = getMemoryCached(cacheKey);
  if (cached) return cached;
  const url = alphaSpotUrl(source);
  if (!url) return null;
  const payload = await alphaFetch(url, source, instrument);
  const spot = parseAlphaSpot(payload, source, instrument);
  upsertMarketPricePoint({ instrumentSymbol: instrument.symbol, provider: source.provider, providerSymbol: source.providerSymbol, date: spot.date, price: spot.price, currency: spot.currency, source: spot.source, quality: 'ok' });
  upsertProviderState('alpha_vantage', 'ok');
  return setMemoryCached(cacheKey, spot);
}

async function fetchAlphaDailyPrices(source, instrument, fromDate, toDate) {
  const cacheKey = `alpha:${source.providerSymbol}:${fromDate}:${toDate}`;
  const cached = getMemoryCached(cacheKey);
  if (cached) return cached;
  const payload = await alphaFetch(alphaUrl(source), source, instrument);
  const rows = parseAlphaDaily(payload, source, instrument).filter((row) => row.date >= fromDate && row.date <= toDate);
  for (const row of rows) {
    upsertMarketPricePoint({
      instrumentSymbol: instrument.symbol,
      provider: source.provider,
      providerSymbol: source.providerSymbol,
      date: row.date,
      price: row.price,
      currency: row.currency,
      source: row.source,
      quality: 'ok',
    });
  }
  upsertProviderState('alpha_vantage', 'ok');
  return setMemoryCached(cacheKey, rows);
}

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

function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const from = dateUtc(fromDate);
  const to = dateUtc(toDate);
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}

function normalizeLocalQuote(row, requestedDate, fallbackReason) {
  if (!row) return null;
  return {
    price: Number(row.price),
    currency: row.currency || 'EUR',
    marketDate: row.marketDate || row.requestedDate || requestedDate,
    marketTime: null,
    source: row.source || 'local cache',
    stale: true,
    cached: true,
    dataQuality: 'stale',
    fallbackReason,
    priceAgeDays: daysBetween(row.marketDate || row.requestedDate, requestedDate),
  };
}

function getBestLocalQuote(yahooSymbol, requestedDate = getToday()) {
  return (
    normalizeLocalQuote(getCachedPriceQuote(yahooSymbol, requestedDate), requestedDate, 'exact-cache') ||
    normalizeLocalQuote(getLatestDailyPrice(yahooSymbol, requestedDate), requestedDate, 'daily-cache') ||
    normalizeLocalQuote(getLatestMaterializedPrice(yahooSymbol, requestedDate), requestedDate, 'materialized-cache') ||
    normalizeLocalQuote(getLatestCachedPriceQuote(yahooSymbol, requestedDate), requestedDate, 'quote-cache')
  );
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
  const cached = getCachedPriceQuote(yahooSymbol, requestedDate);

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

  upsertPriceQuote(yahooSymbol, requestedDate, quote);
  upsertProviderState('yahoo', 'ok');

  return quote;
}

async function fetchDatedYahooPriceWithFallback(yahooSymbol, requestedDate, options = {}) {
  try {
    return await fetchDatedYahooPrice(yahooSymbol, requestedDate);
  } catch (error) {
    upsertProviderState('yahoo', 'error', error.message);
    if (!options.allowStale) throw error;
    const cached = getBestLocalQuote(yahooSymbol, requestedDate);
    if (cached) return cached;
    throw error;
  }
}

async function fetchLatestYahooPriceWithFallback(yahooSymbol, options = {}) {
  try {
    const quote = await fetchLatestYahooPrice(yahooSymbol);
    upsertPriceQuote(yahooSymbol, getToday(), quote);
    upsertProviderState('yahoo', 'ok');
    return quote;
  } catch (error) {
    upsertProviderState('yahoo', 'error', error.message);
    if (!options.allowStale) throw error;
    const cached = getBestLocalQuote(yahooSymbol, getToday());
    if (cached) return cached;
    throw error;
  }
}

function dailyCacheHasRange(yahooSymbol, fromDate, toDate) {
  return hasDailyPriceRange(yahooSymbol, fromDate, toDate);
}

function getCachedDailyPrices(yahooSymbol, fromDate, toDate) {
  return getDailyPricesInRange(yahooSymbol, fromDate, toDate);
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
  if (hasDailyPriceRange(yahooSymbol, fromDate, toDate)) {
    return getDailyPricesInRange(yahooSymbol, fromDate, toDate);
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
    replaceDailyPricesRange(yahooSymbol, fromDate, toDate, prices);
    invalidatePrices(fromDate, 'daily-price-cache');
    upsertProviderState('yahoo', 'ok');
  } catch (error) {
    const cachedRows = getDailyPricesInRange(yahooSymbol, fromDate, toDate);
    if (cachedRows.length) {
      return cachedRows.map((row) => ({ ...row, source: `${row.source} cache parcial` }));
    }
    throw error;
  }

  return getDailyPricesInRange(yahooSymbol, fromDate, toDate);
}

async function getDailyPricesFromSource(instrument, source, fromDate, toDate) {
  if (source.provider === 'yahoo') {
    return getDailyPrices(source.providerSymbol, fromDate, toDate);
  }
if (source.provider === 'alpha_vantage') {
    const existing = listMarketPricePointsInRange(
      instrument.symbol,
      source.provider,
      source.providerSymbol,
      fromDate,
      toDate,
    );
    if (existing.some((row) => row.date >= fromDate && row.date <= toDate)) {
      return existing.map((row) => ({
        date: row.date,
        price: Number(row.price),
        currency: row.currency,
        source: row.source || 'Alpha Vantage',
      }));
    }
    return fetchAlphaDailyPrices(source, instrument, fromDate, toDate);
  }
  throw new Error(`Market data provider not supported: ${source.provider}`);
}

async function getDailyPricesForInstrument(instrumentInput, fromDate, toDate) {
  const instrument = typeof instrumentInput === 'string' ? getInstrumentByInput(instrumentInput) : instrumentInput;
  if (!instrument) return getDailyPrices(String(instrumentInput || ''), fromDate, toDate);
  const sources = resolvePriceSourcesForInstrument(instrument, instrument.yahooSymbol || instrument.yahoo_symbol);
  for (const source of sources) {
    try {
      const rows = await getDailyPricesFromSource(instrument, source, fromDate, toDate);
      if (rows.length) return rows;
    } catch (error) {
      upsertProviderState(source.provider, 'error', error.message);
    }
  }
  return [];
}

function makeAlphaQuote(quote, date, source) {
  return { price: quote.price, currency: quote.currency, marketDate: quote.date, marketTime: quote.timestamp || null, source: 'Alpha Vantage', provider: source.provider, stale: quote.date !== date, cached: false, dataQuality: quote.date === date ? 'ok' : 'stale', priceAgeDays: daysBetween(quote.date, date) };
}

async function quoteFromSource(instrument, source, requestedDate, options = {}) {
  const date = requestedDate || getToday();
  if (source.provider === 'alpha_vantage') {
    const cached = quoteFromMarketPoint(getLatestMarketPricePoint(instrument.symbol, source.provider, source.providerSymbol, date), date, source, instrument, daysBetween);
    if (cached && (cached.marketDate === date || options.allowStale)) return cached;
    if (!requestedDate && alphaSpotFunctionForSource(source)) {
      try {
        const spot = await fetchAlphaSpotPrice(source, instrument);
        if (spot && spot.price > 0) return makeAlphaQuote(spot, date, source);
      } catch { /* fall through to daily history */ }
    }
    const lookback = addDays(date, -30);
    const rows = await fetchAlphaDailyPrices(source, instrument, lookback, date);
    const exact = rows.find((row) => row.date === date) || rows[rows.length - 1];
    if (!exact) throw new Error(`Alpha Vantage quote not available for ${source.providerSymbol} at ${date}`);
    return makeAlphaQuote(exact, date, source);
  }
  if (source.provider === 'yahoo') {
    return requestedDate
      ? await fetchDatedYahooPriceWithFallback(source.providerSymbol, requestedDate, options)
      : await fetchLatestYahooPriceWithFallback(source.providerSymbol, options);
  }
  throw new Error(`Market data provider not supported: ${source.provider}`);
}

async function getQuoteForSymbol(inputSymbol, requestedDate = null, options = {}) {
  const instrument = getInstrumentByInput(inputSymbol);
  const yahooSymbol = instrument?.yahoo_symbol || String(inputSymbol || '').trim();

  if (!yahooSymbol) {
    throw new Error('Missing symbol');
  }

  const sources = resolvePriceSourcesForInstrument(instrument, yahooSymbol);
  const errors = [];
  let quote = null;
  for (const source of sources) {
    try {
      quote = await quoteFromSource(instrument || { symbol: normalizeSymbol(inputSymbol), yahoo_symbol: yahooSymbol }, source, requestedDate, options);
      if (quote) break;
    } catch (error) {
      errors.push(error);
      upsertProviderState(source.provider, 'error', error.message);
    }
  }

  if (!quote) {
    throw errors[0] || new Error(`Quote not available for ${yahooSymbol}`);
  }

  return {
    symbol: instrument?.symbol || normalizeSymbol(inputSymbol),
    yahooSymbol,
    ...quote,
  };
}

async function getQuoteForYahooSymbol(symbol, yahooSymbol, requestedDate = null, options = {}) {
  const resolvedYahooSymbol = String(yahooSymbol || symbol || '').trim();
  if (!resolvedYahooSymbol) throw new Error('Missing Yahoo symbol');
  const quote = requestedDate
    ? await fetchDatedYahooPriceWithFallback(resolvedYahooSymbol, requestedDate, options)
    : await fetchLatestYahooPriceWithFallback(resolvedYahooSymbol, options);
  return {
    symbol: normalizeSymbol(symbol || resolvedYahooSymbol),
    yahooSymbol: resolvedYahooSymbol,
    ...quote,
  };
}

async function getUsdToEur(requestedDate = null, options = {}) {
  const quote = await getQuoteForSymbol('USDEUR', requestedDate, options);
  return quote.price || 1;
}

async function getFxToEur(currencyInput, requestedDate = null, options = {}) {
  const currency = String(currencyInput || 'EUR').trim().toUpperCase();
  if (!currency || currency === 'EUR') return 1;
  if (currency === 'USD') return getUsdToEur(requestedDate, options);
  try {
    const yahooSymbol = `${currency}EUR=X`;
    const quote = await getQuoteForYahooSymbol(`${currency}EUR`, yahooSymbol, requestedDate, options);
    return Number.isFinite(Number(quote.price)) ? Number(quote.price) : null;
  } catch {
    return null;
  }
}

const { listMarketDataSources } = makeMarketDataAdmin({
    PROVIDER_LABELS,
    alphaKey,
    getInstrumentByInput,
    normalizeSymbol,
    upsertMarketPricePoint,
    listPriceSourcesForInstrument,
    listManualPricePoints,
    listProviderStates,
    invalidatePrices,
  });
  const getYahooDividendEvents = makeGetYahooDividendEvents({ fetchYahooChart, dateUtc, addDays, toUnixSeconds });

  Object.assign(ctx, { fetchYahooChart, fetchLatestYahooPrice, getYahooDividendEvents, firstDailyCloseAtOrAfter, fetchDatedYahooPrice, fetchDatedYahooPriceWithFallback, fetchLatestYahooPriceWithFallback, getBestLocalQuote, resolvePriceSourcesForInstrument, dailyCacheHasRange, getCachedDailyPrices, parseDailyPrices, getDailyPrices, getDailyPricesForInstrument, getQuoteForSymbol, getQuoteForYahooSymbol, getUsdToEur, getFxToEur, listMarketDataSources });
};
