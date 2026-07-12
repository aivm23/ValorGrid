const { alphaUrl, alphaSpotUrl, parseAlphaDaily, parseAlphaSpot } = require('./market-data-providers');

function createAlphaVantageMarketData({
  getMemoryCached,
  setMemoryCached,
  upsertMarketPricePoint,
  upsertProviderState,
}) {
  async function alphaFetch(url) {
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
    const payload = await alphaFetch(url);
    const spot = parseAlphaSpot(payload, source, instrument);
    upsertMarketPricePoint({
      instrumentSymbol: instrument.symbol,
      provider: source.provider,
      providerSymbol: source.providerSymbol,
      date: spot.date,
      price: spot.price,
      currency: spot.currency,
      source: spot.source,
      quality: 'ok',
    });
    upsertProviderState('alpha_vantage', 'ok');
    return setMemoryCached(cacheKey, spot);
  }

  async function fetchAlphaDailyPrices(source, instrument, fromDate, toDate) {
    const cacheKey = `alpha:${source.providerSymbol}:${fromDate}:${toDate}`;
    const cached = getMemoryCached(cacheKey);
    if (cached) return cached;
    const payload = await alphaFetch(alphaUrl(source));
    const rows = parseAlphaDaily(payload, source, instrument).filter(
      (row) => row.date >= fromDate && row.date <= toDate,
    );
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

  return { fetchAlphaSpotPrice, fetchAlphaDailyPrices };
}

module.exports = { createAlphaVantageMarketData };
