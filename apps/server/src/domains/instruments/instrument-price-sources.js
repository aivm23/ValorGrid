function normalizeSourceProvider(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function normalizeProviderSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeSource(source = {}, fallback = {}) {
  const provider = normalizeSourceProvider(source.provider || fallback.provider || 'yahoo');
  const providerSymbol = String(
    source.providerSymbol || source.provider_symbol || fallback.providerSymbol || fallback.yahooSymbol || fallback.symbol || '',
  ).trim();
  if (!provider || !providerSymbol) return null;
  return {
    provider,
    providerSymbol: provider === 'manual' ? normalizeProviderSymbol(providerSymbol) : providerSymbol,
    priority: Number(source.priority ?? fallback.priority ?? 0),
    enabled: source.enabled === undefined ? true : Boolean(source.enabled),
    pricingMode: source.pricingMode || source.pricing_mode || (provider === 'manual' ? 'manual' : 'provider'),
    maxStalenessDays: source.maxStalenessDays ?? source.max_staleness_days ?? fallback.maxStalenessDays ?? null,
    metadata: source.metadata || fallback.metadata || null,
  };
}

function normalizeInstrumentPriceSources(input = {}, fallback = {}) {
  if (Array.isArray(input.priceSources)) {
    return input.priceSources
      .map((source, index) => normalizeSource(source, { ...fallback, priority: index }))
      .filter(Boolean);
  }

  const pricingMode = normalizeSourceProvider(input.pricingMode || input.pricing_mode);
  const provider = normalizeSourceProvider(input.provider || input.priceProvider || input.price_provider);
  if (pricingMode === 'manual' || provider === 'manual') {
    const providerSymbol = input.providerSymbol || input.provider_symbol || input.isin || fallback.symbol;
    return [
      normalizeSource(
        { provider: 'manual', providerSymbol, pricingMode: 'manual', maxStalenessDays: input.maxStalenessDays ?? 45 },
        fallback,
      ),
    ].filter(Boolean);
  }

  if (provider && provider !== 'yahoo') {
    return [
      normalizeSource(
        {
          provider,
          providerSymbol: input.providerSymbol || input.provider_symbol || fallback.yahooSymbol,
          maxStalenessDays: input.maxStalenessDays ?? 7,
        },
        fallback,
      ),
      normalizeSource({ provider: 'yahoo', providerSymbol: fallback.yahooSymbol, priority: 10 }, fallback),
    ].filter(Boolean);
  }

  return [normalizeSource({ provider: 'yahoo', providerSymbol: fallback.yahooSymbol }, fallback)].filter(Boolean);
}

function normalizeIsin(value) {
  const isin = normalizeProviderSymbol(value);
  return isin || null;
}

module.exports = {
  normalizeInstrumentPriceSources,
  normalizeIsin,
};
