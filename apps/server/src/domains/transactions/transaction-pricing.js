async function resolveFxToEur({ currency, date, inputFxToEur = null, getFxToEur }) {
  const normalizedCurrency = String(currency || 'EUR').toUpperCase();
  if (normalizedCurrency === 'EUR') return 1;

  const manualFxToEur = Number(inputFxToEur);
  if (Number.isFinite(manualFxToEur) && manualFxToEur > 0) return manualFxToEur;

  const marketFxToEur = await getFxToEur(normalizedCurrency, date);
  if (!Number.isFinite(Number(marketFxToEur))) {
    throw new Error('FX to EUR is required when market FX is unavailable');
  }
  return marketFxToEur;
}

module.exports = {
  resolveFxToEur,
};
