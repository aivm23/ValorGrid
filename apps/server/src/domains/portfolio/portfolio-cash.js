const { toPortfolioItem } = require('./portfolio-item');

async function buildCashValuation(instrument, deps, asOfDate = null) {
  const balance = Number(instrument.cash_balance || 0);
  const base = toPortfolioItem(instrument, {
    yahooSymbol: instrument.yahoo_symbol,
    type: instrument.type,
    color: instrument.color,
    shares: balance,
    price: 1,
    priceEur: 1,
    currency: instrument.currency,
    marketDate: null,
    value: 0,
    dataQuality: 'empty',
    priceSource: 'cash-balance',
    priceAgeDays: null,
    valuationAvailable: true,
  });
  if (balance <= 0.0000001) return base;
  const currency = String(instrument.currency || 'EUR').toUpperCase();
  const fxToEur =
    currency === 'EUR' ? 1 : await deps.getFxToEur(currency, asOfDate || deps.getToday(), { allowStale: true });
  if (!Number.isFinite(Number(fxToEur))) return { ...base, dataQuality: 'missing_fx', valuationAvailable: false };
  const priceEur = deps.toEur(1, currency, Number(fxToEur));
  return { ...base, priceEur, currency, value: balance * priceEur, dataQuality: 'ok' };
}

function buildCashHistoricalValuation(instrument) {
  return toPortfolioItem(instrument, {
    shares: 0,
    price: 0,
    priceEur: 0,
    currency: instrument.currency,
    marketDate: null,
    value: 0,
    dataQuality: 'cash-current-only',
  });
}

module.exports = { buildCashValuation, buildCashHistoricalValuation };
