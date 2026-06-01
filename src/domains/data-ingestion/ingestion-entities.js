function normalizeNewGroups(input = {}) {
  if (!Array.isArray(input.newGroups)) return [];
  return input.newGroups
    .map((item) => ({
      id: String(item.id || '').trim() || null,
      name: String(item.name || '').trim(),
      color: String(item.color || '#64748b').trim(),
      showInDistribution: item.showInDistribution !== false,
      showInMonthly: item.showInMonthly !== false,
      isExpandable: Boolean(item.isExpandable),
    }))
    .filter((item) => item.name);
}

function normalizeNewInstruments(input = {}) {
  if (!Array.isArray(input.newInstruments)) return [];
  return input.newInstruments
    .map((item) => ({
      symbol: String(item.symbol || '').trim().toUpperCase(),
      yahooSymbol: String(item.yahooSymbol || item.yahoo_symbol || item.symbol || '').trim().toUpperCase(),
      name: String(item.name || item.symbol || '').trim(),
      type: String(item.type || 'stock').trim().toLowerCase(),
      currency: String(item.currency || 'EUR').trim().toUpperCase(),
      color: String(item.color || '#2563eb').trim(),
      groupId: String(item.groupId || item.group_id || '').trim() || null,
    }))
    .filter((item) => item.symbol);
}

function createImportEntityHelpers(ctx) {
  const { repositories, getInstrument, createInstrumentGroup, createInstrument, upsertInstrumentIdentifier, groupIdFromName, ensureGeneralGroup } = ctx;
  const instrumentsRepository = repositories?.instruments;
  if (!instrumentsRepository) {
    throw new Error('import-entities requires ctx.repositories.instruments');
  }

  function ensureImportEntities(input = {}) {
    const groups = normalizeNewGroups(input);
    const instruments = normalizeNewInstruments(input);

    for (const group of groups) {
      const groupId = group.id || groupIdFromName(group.name);
      if (instrumentsRepository.groupExists(groupId)) continue;
      createInstrumentGroup({ ...group, id: groupId });
    }

    for (const instrumentInput of instruments) {
      if (getInstrument(instrumentInput.symbol)) continue;
      const groupId = instrumentInput.groupId || ensureGeneralGroup().id;
      createInstrument({ ...instrumentInput, groupId });
    }
  }

  function persistRowIdentifiers(row, instrument) {
    for (const identifier of row.normalized.externalIdentifiers || []) {
      const provider = String(identifier.provider || '').trim().toLowerCase();
      const identifierType = String(identifier.identifierType || identifier.type || '').trim().toLowerCase();
      const identifierValue = String(identifier.identifierValue || identifier.value || '').trim().toUpperCase();
      if (!provider || !identifierType || !identifierValue) continue;
      upsertInstrumentIdentifier({
        instrumentSymbol: instrument.symbol,
        provider,
        identifierType,
        identifierValue,
        displayName: identifier.displayName || null,
        currency: identifier.currency || row.normalized.currency || null,
        exchange: identifier.exchange || null,
      });
    }
  }

  return { ensureImportEntities, persistRowIdentifiers };
}

module.exports = {
  createImportEntityHelpers,
};

