async function buildCashValuation(instrument, deps, asOfDate = null) {
  const balance = Number(instrument.cash_balance || 0);
  const base = {
    symbol: instrument.symbol,
    yahooSymbol: instrument.yahoo_symbol,
    name: instrument.name,
    type: instrument.type,
    groupId: instrument.group_id,
    showInDistribution: Boolean(instrument.show_in_distribution),
    showInMonthly: Boolean(instrument.show_in_monthly),
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
  };
  if (balance <= 0.0000001) return base;
  const currency = String(instrument.currency || 'EUR').toUpperCase();
  const fxToEur =
    currency === 'EUR' ? 1 : await deps.getFxToEur(currency, asOfDate || deps.getToday(), { allowStale: true });
  if (!Number.isFinite(Number(fxToEur))) return { ...base, dataQuality: 'missing_fx', valuationAvailable: false };
  const priceEur = deps.toEur(1, currency, Number(fxToEur));
  return { ...base, priceEur, currency, value: balance * priceEur, dataQuality: 'ok' };
}

function buildCashHistoricalValuation(instrument) {
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    groupId: instrument.group_id,
    showInDistribution: Boolean(instrument.show_in_distribution),
    showInMonthly: Boolean(instrument.show_in_monthly),
    shares: 0,
    price: 0,
    priceEur: 0,
    currency: instrument.currency,
    marketDate: null,
    value: 0,
    dataQuality: 'cash-current-only',
  };
}

module.exports = { buildCashValuation, buildCashHistoricalValuation };
