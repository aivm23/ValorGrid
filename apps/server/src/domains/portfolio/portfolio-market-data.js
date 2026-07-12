const { toPortfolioItem } = require('./portfolio-item');

function buildBaseValuation(instrument, shares) {
  return toPortfolioItem(instrument, {
    yahooSymbol: instrument.yahoo_symbol,
    type: instrument.type,
    color: instrument.color,
    shares,
    price: Number(instrument.fallback_price || 0),
    priceEur: Number(instrument.fallback_price || 0),
    currency: instrument.currency,
    marketDate: null,
    value: 0,
    dataQuality: 'missing',
    priceSource: 'fallback_price',
    priceAgeDays: null,
    valuationAvailable: false,
  });
}

function summarizeMarketDataStatus(valuations) {
  const priced = valuations.filter((item) => item.valuationAvailable);
  const missing = valuations.filter((item) => !item.valuationAvailable);
  const stale = priced.filter((item) => item.dataQuality === 'stale' || item.dataQuality === 'fallback');
  return {
    status: missing.length ? 'missing' : stale.length ? 'stale' : 'ok',
    priced: priced.length,
    missing: missing.length,
    stale: stale.length,
    missingSymbols: missing.map((item) => item.symbol),
  };
}

function withPercentages(items, total) {
  return [...items]
    .map((item) => ({ ...item, pct: total > 0 ? (item.value / total) * 100 : 0 }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
}

function isEffectiveValuation(item, minimumDisplayValueEur) {
  return Math.abs(Number(item?.shares || 0)) > 0.0000001 && Number(item?.value || 0) >= minimumDisplayValueEur;
}

module.exports = {
  buildBaseValuation,
  isEffectiveValuation,
  summarizeMarketDataStatus,
  withPercentages,
};
