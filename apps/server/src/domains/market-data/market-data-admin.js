function makeMarketDataAdmin({
  PROVIDER_LABELS,
  alphaKey,
  getInstrumentByInput,
  normalizeSymbol,
  upsertMarketPricePoint,
  listPriceSourcesForInstrument,
  listManualPricePoints,
  listProviderStates,
  invalidatePrices,
}) {
  function listMarketDataSources() {
    return {
      providers: [
        { key: 'yahoo', label: PROVIDER_LABELS.yahoo, enabled: true, primary: true },
        { key: 'alpha_vantage', label: PROVIDER_LABELS.alpha_vantage, enabled: Boolean(alphaKey()), primary: false },
        { key: 'manual', label: PROVIDER_LABELS.manual, enabled: true, primary: false },
      ],
      states: listProviderStates(),
    };
  }

  function saveManualMarketPrice(input = {}) {
    const symbol = normalizeSymbol(input.symbol || input.instrumentSymbol);
    const instrument = getInstrumentByInput(symbol);
    if (!instrument) throw new Error('Instrument not found for manual price');
    const date = String(input.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Manual price date must use YYYY-MM-DD');
    const price = Number(input.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Manual price must be greater than 0');
    const currency = String(input.currency || instrument.currency || 'EUR')
      .trim()
      .toUpperCase();
    const manualSource = listPriceSourcesForInstrument(instrument.symbol).find(
      (source) => source.provider === 'manual',
    );
    const providerSymbol = String(
      input.providerSymbol || input.isin || manualSource?.providerSymbol || instrument.symbol,
    )
      .trim()
      .toUpperCase();
    upsertMarketPricePoint({
      instrumentSymbol: instrument.symbol,
      provider: 'manual',
      providerSymbol,
      date,
      price,
      currency,
      source: 'Precio manual',
      quality: 'manual',
      note: input.note ? String(input.note).trim() : null,
    });
    invalidatePrices(date, 'manual-price');
    return {
      symbol: instrument.symbol,
      provider: 'manual',
      providerSymbol,
      date,
      price,
      currency,
      source: 'Precio manual',
      quality: 'manual',
    };
  }

  function listManualMarketPrices(symbol) {
    const instrument = getInstrumentByInput(symbol);
    if (!instrument) return [];
    return listManualPricePoints(instrument.symbol);
  }

  return { listMarketDataSources, saveManualMarketPrice, listManualMarketPrices };
}

module.exports = { makeMarketDataAdmin };
