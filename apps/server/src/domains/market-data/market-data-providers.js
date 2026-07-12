const PROVIDER_LABELS = {
  yahoo: 'Yahoo Finance',
  alpha_vantage: 'Alpha Vantage',
};

const COMMODITY_DEFINITIONS = {
  GOLD: { label: 'Gold spot', currency: 'USD' },
  XAU: { label: 'Gold spot', currency: 'USD' },
  SILVER: { label: 'Silver spot', currency: 'USD' },
  XAG: { label: 'Silver spot', currency: 'USD' },
  WTI: { label: 'WTI crude oil', currency: 'USD' },
  BRENT: { label: 'Brent crude oil', currency: 'USD' },
  NATURAL_GAS: { label: 'Natural gas', currency: 'USD' },
  GAS: { label: 'Natural gas', currency: 'USD' },
};

const COMMODITY_HISTORY_FUNCTIONS = {
  GOLD: { functionName: 'GOLD_SILVER_HISTORY', symbol: 'GOLD' },
  XAU: { functionName: 'GOLD_SILVER_HISTORY', symbol: 'GOLD' },
  SILVER: { functionName: 'GOLD_SILVER_HISTORY', symbol: 'SILVER' },
  XAG: { functionName: 'GOLD_SILVER_HISTORY', symbol: 'SILVER' },
  WTI: { functionName: 'WTI' },
  BRENT: { functionName: 'BRENT' },
  NATURAL_GAS: { functionName: 'NATURAL_GAS' },
  GAS: { functionName: 'NATURAL_GAS' },
};

const COMMODITY_SPOT_FUNCTIONS = {
  GOLD: { functionName: 'GOLD_SILVER_SPOT', symbol: 'GOLD' },
  XAU: { functionName: 'GOLD_SILVER_SPOT', symbol: 'GOLD' },
  SILVER: { functionName: 'GOLD_SILVER_SPOT', symbol: 'SILVER' },
  XAG: { functionName: 'GOLD_SILVER_SPOT', symbol: 'SILVER' },
};

const VALID_COMMODITIES = new Set(['WTI', 'BRENT', 'NATURAL_GAS', 'GOLD', 'SILVER']);

function isCommodityProviderSymbol(value) {
  return VALID_COMMODITIES.has(
    String(value || '')
      .trim()
      .toUpperCase(),
  );
}

function isCommodityType(type) {
  return (
    String(type || '')
      .trim()
      .toLowerCase() === 'commodity'
  );
}

function commodityCurrency(providerSymbol) {
  return (
    COMMODITY_DEFINITIONS[
      String(providerSymbol || '')
        .trim()
        .toUpperCase()
    ]?.currency || 'USD'
  );
}

const FUNCTIONS_WITH_INTERVAL = new Set(['WTI', 'BRENT', 'NATURAL_GAS', 'GOLD_SILVER_HISTORY']);

function normalizeProvider(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function defaultMaxStalenessDays(source, instrument = {}) {
  if (source.maxStalenessDays !== null && source.maxStalenessDays !== undefined) {
    return Number(source.maxStalenessDays);
  }
  if (String(instrument.assetClass || instrument.type || '').toLowerCase() === 'fund') return 45;
  return 7;
}

function normalizeSource(source = {}, instrument = {}) {
  const provider = normalizeProvider(source.provider);
  const providerSymbol = String(
    source.providerSymbol || source.provider_symbol || instrument.yahoo_symbol || instrument.symbol || '',
  ).trim();
  return {
    provider,
    providerSymbol,
    priority: Number(source.priority || 0),
    enabled: source.enabled !== false && source.enabled !== 0,
    pricingMode: source.pricingMode || source.pricing_mode || 'provider',
    maxStalenessDays: source.maxStalenessDays ?? source.max_staleness_days ?? null,
    metadata: source.metadata || null,
  };
}

function fallbackYahooSource(instrument, yahooSymbol) {
  return normalizeSource(
    { provider: 'yahoo', providerSymbol: yahooSymbol, priority: 0, pricingMode: 'provider' },
    instrument,
  );
}

function makeResolvePriceSources(listPriceSourcesForInstrument) {
  return function resolvePriceSourcesForInstrument(instrument, yahooSymbol = null) {
    if (!instrument) return [fallbackYahooSource(null, yahooSymbol)];
    const configured = listPriceSourcesForInstrument(instrument.symbol)
      .map((source) => normalizeSource(source, instrument))
      .filter((source) => source.enabled && source.provider && source.providerSymbol);
    if (configured.length) return configured;
    if (isCommodityType(instrument.type) && instrument.yahoo_symbol) {
      return [
        normalizeSource(
          { provider: 'alpha_vantage', providerSymbol: instrument.yahoo_symbol, priority: 0 },
          instrument,
        ),
      ];
    }
    return [fallbackYahooSource(instrument, instrument.yahoo_symbol || yahooSymbol || instrument.symbol)];
  };
}

function quoteFromMarketPoint(row, requestedDate, source, instrument, daysBetween) {
  if (!row) return null;
  const age = daysBetween(row.date, requestedDate);
  const maxAge = defaultMaxStalenessDays(source, instrument);
  if (Number.isFinite(maxAge) && age !== null && age > maxAge) return null;
  return {
    price: Number(row.price),
    currency: row.currency || instrument?.currency || 'EUR',
    marketDate: row.date,
    marketTime: null,
    source: row.source || PROVIDER_LABELS[source.provider] || source.provider,
    provider: source.provider,
    stale: row.date !== requestedDate,
    cached: true,
    dataQuality: row.date === requestedDate ? 'ok' : 'stale',
    priceAgeDays: age,
  };
}

function alphaKey() {
  return process.env.VALORGRID_ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY || '';
}

function alphaFunctionForSource(source) {
  const symbol = String(source.providerSymbol || '')
    .trim()
    .toUpperCase();
  return COMMODITY_HISTORY_FUNCTIONS[symbol] || { functionName: 'TIME_SERIES_DAILY', symbol };
}

function alphaSpotFunctionForSource(source) {
  const symbol = String(source.providerSymbol || '')
    .trim()
    .toUpperCase();
  return COMMODITY_SPOT_FUNCTIONS[symbol] || null;
}

function alphaUrl(source) {
  const key = alphaKey();
  if (!key) throw new Error('Alpha Vantage API key not configured');
  const descriptor = alphaFunctionForSource(source);
  const params = new URLSearchParams({ function: descriptor.functionName, apikey: key });
  if (descriptor.symbol) params.set('symbol', descriptor.symbol);
  if (FUNCTIONS_WITH_INTERVAL.has(descriptor.functionName)) params.set('interval', 'daily');
  return `https://www.alphavantage.co/query?${params.toString()}`;
}

function alphaSpotUrl(source) {
  const key = alphaKey();
  if (!key) throw new Error('Alpha Vantage API key not configured');
  const spotFn = alphaSpotFunctionForSource(source);
  if (!spotFn) return null;
  const params = new URLSearchParams({ function: spotFn.functionName, apikey: key });
  if (spotFn.symbol) params.set('symbol', spotFn.symbol);
  return `https://www.alphavantage.co/query?${params.toString()}`;
}

function normalizeAlphaMessage(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'Alpha Vantage devolvió una respuesta vacía';
  const lower = text.toLowerCase();
  if (lower.includes('spreading out') || lower.includes('1 request per second') || lower.includes('per second burst')) {
    return 'Límite de frecuencia de Alpha Vantage alcanzado (1 petición/segundo)';
  }
  if (lower.includes('25 requests per day') || lower.includes('free key rate limit')) {
    return 'Límite diario de la clave gratuita de Alpha Vantage alcanzado (25 peticiones/día)';
  }
  if (lower.includes('thank you for using')) {
    return 'Límite de frecuencia de Alpha Vantage alcanzado (1 petición/segundo)';
  }
  if (lower.includes('invalid api key') || lower.includes('apikey invalid') || lower.includes('invalid apikey')) {
    return 'Clave de Alpha Vantage no válida';
  }
  if (text.length > 120) {
    return `${text.slice(0, 117)}...`;
  }
  return text;
}

function parseAlphaDaily(payload, source, instrument) {
  const currency = source.metadata?.currency || instrument?.currency || 'USD';
  if (payload['Time Series (Daily)']) return parseSeries(payload['Time Series (Daily)'], currency);
  if (payload['Time Series FX (Daily)']) return parseSeries(payload['Time Series FX (Daily)'], currency);
  if (Array.isArray(payload.data)) {
    return payload.data
      .map((row) => ({ date: row.date, price: Number(row.price || row.value), currency, source: 'Alpha Vantage' }))
      .filter((row) => row.date && Number.isFinite(row.price) && row.price > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  throw new Error(
    normalizeAlphaMessage(
      payload.Note || payload.Information || payload['Error Message'] || 'Alpha Vantage returned no data',
    ),
  );
}

function parseAlphaSpot(payload, source, instrument) {
  const currency = source.metadata?.currency || instrument?.currency || 'USD';
  if (payload.price && payload.nominal) {
    return {
      price: Number(payload.price),
      currency,
      date: (payload.timestamp || '').slice(0, 10),
      source: 'Alpha Vantage',
    };
  }
  throw new Error(
    normalizeAlphaMessage(
      payload.Note || payload.Information || payload['Error Message'] || 'Alpha Vantage spot returned no data',
    ),
  );
}

function parseSeries(series, currency) {
  return Object.entries(series)
    .map(([date, value]) => ({ date, price: Number(value['4. close']), currency, source: 'Alpha Vantage' }))
    .filter((row) => Number.isFinite(row.price) && row.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = {
  PROVIDER_LABELS,
  COMMODITY_DEFINITIONS,
  VALID_COMMODITIES,
  isCommodityProviderSymbol,
  isCommodityType,
  commodityCurrency,
  alphaKey,
  alphaUrl,
  alphaSpotUrl,
  alphaSpotFunctionForSource,
  normalizeAlphaMessage,
  parseAlphaDaily,
  parseAlphaSpot,
  makeResolvePriceSources,
  quoteFromMarketPoint,
};
