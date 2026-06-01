const { assertCtxDeps, getCtxDep } = require('../../ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'normalizeSymbol',
      'stockColors',
      'ensureGroup',
      'groupIdFromName',
      'invalidatePrices',
      'invalidateLedger',
      'getToday',
    ],
    'instrument-service',
  );

  const {
    repositories,
    normalizeSymbol,
    stockColors,
    ensureGroup,
    groupIdFromName,
    invalidatePrices,
    invalidateLedger,
    getToday,
  } = ctx;

  const instrumentRepository = repositories.instruments;
  if (!instrumentRepository) {
    throw new Error('instrument-service requires ctx.repositories.instruments');
  }

  const {
    findInstrumentBySymbol,
    findInstrumentBySymbolOrYahoo,
    listActiveInstruments,
    listActiveInstrumentGroups,
    listIdentifiers,
    findIdentifierByLookup,
    upsertIdentifier,
    getIdentifierByLookup,
    deleteIdentifierById,
    resolveInstrumentByIdentifier,
    groupExists,
    updateInstrumentBySymbol,
    countTransactionsBySymbol,
    countAutoPlansBySymbol,
    countIdentifiersBySymbol,
    deactivateInstrumentBySymbol,
    deleteIdentifiersBySymbol,
    deleteInstrumentBySymbol,
    insertInstrument,
    findGroupById,
    updateGroupById,
    countActiveInstrumentsByGroup,
    clearGroupForInstruments,
    deleteGroupById,
    countStockInstruments,
    countActiveInstruments,
  } = instrumentRepository;

  function getInstrument(symbol) {
    return findInstrumentBySymbol(normalizeSymbol(symbol));
  }

  function nextIdentifierId() {
    return `ident:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeIdentifierText(value) {
    return String(value || '').trim();
  }

  function normalizeIdentifierLookup(value) {
    return normalizeIdentifierText(value).toUpperCase();
  }

  function listInstrumentIdentifiers(filters = {}) {
    const symbol = normalizeSymbol(filters.symbol || '');
    const provider = normalizeIdentifierText(filters.provider).toLowerCase();
    const type = normalizeIdentifierText(filters.identifierType || filters.type).toLowerCase();
    return listIdentifiers({ symbol, provider, type });
  }

  function upsertInstrumentIdentifier(input = {}) {
    const instrumentSymbol = normalizeSymbol(input.instrumentSymbol || input.symbol);
    if (!instrumentSymbol || !getInstrument(instrumentSymbol)) throw new Error('Instrument not found for identifier');
    const provider = normalizeIdentifierText(input.provider || 'manual').toLowerCase();
    const identifierType = normalizeIdentifierText(input.identifierType || input.type).toLowerCase();
    const identifierValue = normalizeIdentifierLookup(input.identifierValue || input.value);
    if (!provider) throw new Error('Identifier provider is required');
    if (!identifierType) throw new Error('Identifier type is required');
    if (!identifierValue) throw new Error('Identifier value is required');

    const existing = findIdentifierByLookup(provider, identifierType, identifierValue);

    const payload = {
      id: existing?.id || nextIdentifierId(),
      instrumentSymbol,
      provider,
      identifierType,
      identifierValue,
      displayName: normalizeIdentifierText(input.displayName || input.display_name) || null,
      currency: normalizeIdentifierText(input.currency || '').toUpperCase() || null,
      exchange: normalizeIdentifierText(input.exchange || '').toUpperCase() || null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : input.metadataJson || null,
    };

    upsertIdentifier(payload);
    return getIdentifierByLookup(provider, identifierType, identifierValue);
  }

  function deleteInstrumentIdentifier(id) {
    if (!id) return false;
    return deleteIdentifierById(String(id));
  }

  function resolveInstrumentFromIdentifiers(candidates = []) {
    for (const candidate of candidates) {
      const provider = normalizeIdentifierText(candidate.provider || '').toLowerCase();
      const identifierType = normalizeIdentifierText(candidate.identifierType || candidate.type).toLowerCase();
      const identifierValue = normalizeIdentifierLookup(candidate.identifierValue || candidate.value);
      if (!provider || !identifierType || !identifierValue) continue;
      const resolved = resolveInstrumentByIdentifier(provider, identifierType, identifierValue);
      if (resolved) return resolved;
    }
    return null;
  }

  function getInstrumentByInput(value) {
    const normalized = normalizeSymbol(value);
    return findInstrumentBySymbolOrYahoo(normalized);
  }

  function listInstruments() {
    return listActiveInstruments().map((item) => ({
      ...item,
      active: Boolean(item.active),
      showInDistribution: Boolean(item.showInDistribution),
      showInMonthly: Boolean(item.showInMonthly),
    }));
  }

  function listInstrumentGroups() {
    return listActiveInstrumentGroups().map((item) => ({
      ...item,
      active: Boolean(item.active),
      showInDistribution: Boolean(item.showInDistribution),
      showInMonthly: Boolean(item.showInMonthly),
      isExpandable: Boolean(item.isExpandable),
    }));
  }

  function updateInstrument(symbol, input = {}) {
    const existing = getInstrument(symbol);
    if (!existing) throw new Error('Instrument not found');

    const next = {
      yahooSymbol: String(input.yahooSymbol ?? input.yahoo_symbol ?? existing.yahoo_symbol).trim(),
      name: String(input.name ?? existing.name).trim(),
      type: String(input.type ?? existing.type).trim().toLowerCase(),
      currency: String(input.currency ?? existing.currency).trim().toUpperCase(),
      color: String(input.color ?? existing.color).trim(),
      fallbackPrice: Number(input.fallbackPrice ?? input.fallback_price ?? existing.fallback_price),
      groupId: input.groupId === undefined ? existing.group_id : String(input.groupId || '').trim() || null,
      displayOrder: Number(input.displayOrder ?? input.display_order ?? existing.display_order ?? 0),
      showInDistribution:
        input.showInDistribution === undefined ? Number(existing.show_in_distribution) : input.showInDistribution ? 1 : 0,
      showInMonthly: input.showInMonthly === undefined ? Number(existing.show_in_monthly) : input.showInMonthly ? 1 : 0,
      active: input.active === undefined ? Number(existing.active) : input.active ? 1 : 0,
    };

    if (!next.yahooSymbol) throw new Error('Yahoo symbol is required');
    if (!next.name) throw new Error('Name is required');
    if (!['etf', 'stock', 'fx'].includes(next.type)) throw new Error('Invalid instrument type');
    if (!next.currency) throw new Error('Currency is required');
    if (!/^#[0-9a-f]{6}$/i.test(next.color)) throw new Error('Color must be a hex value');
    if (!Number.isFinite(next.fallbackPrice) || next.fallbackPrice < 0) throw new Error('Invalid fallback price');
    if (next.groupId && !groupExists(next.groupId)) {
      throw new Error('Instrument group not found');
    }

    updateInstrumentBySymbol(existing.symbol, next);
    upsertInstrumentIdentifier({
      instrumentSymbol: existing.symbol,
      provider: 'manual',
      identifierType: 'ticker',
      identifierValue: existing.symbol,
      displayName: next.name,
      currency: next.currency,
    });
    upsertInstrumentIdentifier({
      instrumentSymbol: existing.symbol,
      provider: 'yahoo',
      identifierType: 'yahoo_symbol',
      identifierValue: next.yahooSymbol,
      displayName: next.name,
      currency: next.currency,
    });
    invalidatePrices(getToday(), 'instrument-update');
    return listInstruments().find((item) => item.symbol === existing.symbol);
  }

  function instrumentDependencyCounts(symbol) {
    const normalized = normalizeSymbol(symbol);
    const transactions = countTransactionsBySymbol(normalized);
    const autoPlans = countAutoPlansBySymbol(normalized);
    const identifiers = countIdentifiersBySymbol(normalized);
    const currentShares = getCtxDep(ctx, 'getPositionShares', 'instrument-service')(normalized);
    return { transactions, autoPlans, identifiers, currentShares };
  }

  function previewInstrumentDelete(symbols = []) {
    const unique = [...new Set((symbols || []).map((s) => normalizeSymbol(s)).filter(Boolean))];
    return unique.map((symbol) => {
      const existing = getInstrument(symbol);
      if (!existing) return { symbol, status: 'missing', blocked: false };
      if (existing.type === 'fx') {
        return {
          symbol: existing.symbol,
          status: 'fx_protected',
          blocked: true,
          reason: 'Los instrumentos técnicos de divisa no se pueden eliminar',
        };
      }
      const deps = instrumentDependencyCounts(existing.symbol);
      if (deps.currentShares > 0.000001) {
        return {
          symbol: existing.symbol,
          status: 'has_position',
          blocked: true,
          dependencies: deps,
          reason: `Tiene ${deps.currentShares.toFixed(6)} acciones en cartera. Realiza una venta para dejarlo a cero antes de eliminarlo.`,
        };
      }
      if (deps.autoPlans > 0) {
        return {
          symbol: existing.symbol,
          status: 'has_auto_plan',
          blocked: true,
          dependencies: deps,
          reason: 'Tiene una automatización activa. Desactívala primero desde Planes automáticos.',
        };
      }
      if (deps.transactions > 0) {
        return {
          symbol: existing.symbol,
          status: 'has_history',
          blocked: false,
          dependencies: deps,
          reason: 'Tiene movimientos históricos pero posición a cero. Se desactivará en lugar de eliminarse.',
        };
      }
      return { symbol: existing.symbol, status: 'clean', blocked: false, dependencies: deps };
    });
  }

  function deleteInstrument(symbol) {
    const existing = getInstrument(symbol);
    if (!existing) return { symbol: normalizeSymbol(symbol), status: 'missing' };
    if (existing.type === 'fx') throw new Error('Los instrumentos técnicos de divisa no se pueden eliminar');
    const deps = instrumentDependencyCounts(existing.symbol);
    if (deps.currentShares > 0.000001) {
      throw new Error(`No se puede eliminar ${existing.symbol}: tiene ${deps.currentShares.toFixed(6)} acciones en cartera. Realiza una venta para dejarlo a cero antes de eliminarlo.`);
    }
    if (deps.autoPlans > 0) {
      throw new Error(`No se puede eliminar ${existing.symbol}: tiene una automatización activa. Desactívala primero desde Planes automáticos.`);
    }
    if (deps.transactions > 0 || Math.abs(Number(existing.base_shares || 0)) > 0.000001) {
      deactivateInstrumentBySymbol(existing.symbol);
      invalidateLedger(getToday(), 'instrument-deactivate');
      return { symbol: existing.symbol, status: 'deactivated', dependencies: deps };
    }
    deleteIdentifiersBySymbol(existing.symbol);
    deleteInstrumentBySymbol(existing.symbol);
    invalidateLedger(getToday(), 'instrument-delete');
    return { symbol: existing.symbol, status: 'deleted', dependencies: deps };
  }

  function deleteInstruments(symbols = []) {
    const unique = [...new Set((symbols || []).map((symbol) => normalizeSymbol(symbol)).filter(Boolean))];
    return unique.map((symbol) => deleteInstrument(symbol));
  }

  function createInstrument(input = {}) {
    const symbol = normalizeSymbol(input.symbol || input.ticker);
    if (!symbol) throw new Error('Symbol is required');
    if (getInstrument(symbol)) throw new Error('Instrument already exists');
    const yahooSymbol = String(input.yahooSymbol || input.yahoo_symbol || symbol).trim();
    const name = String(input.name || symbol).trim();
    const type = String(input.type || 'stock').trim().toLowerCase();
    const currency = String(input.currency || 'EUR').trim().toUpperCase();
    const color = String(input.color || stockColors[listInstruments().length % stockColors.length]).trim();
    const groupId = String(input.groupId || input.group_id || ensureGeneralGroup().id).trim();
    const fallbackPrice = Number(input.fallbackPrice || input.fallback_price || 0);
    if (!['etf', 'stock', 'fx'].includes(type)) throw new Error('Invalid instrument type');
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Color must be a hex value');
    if (!groupExists(groupId)) throw new Error('Instrument group not found');
    insertInstrument({
      symbol,
      yahooSymbol,
      name,
      type,
      currency,
      color,
      baseShares: 0,
      fallbackPrice,
      active: 1,
      groupId,
      displayOrder: countActiveInstruments() + 1,
    });
    upsertInstrumentIdentifier({
      instrumentSymbol: symbol,
      provider: 'manual',
      identifierType: 'ticker',
      identifierValue: symbol,
      displayName: name,
      currency,
    });
    upsertInstrumentIdentifier({
      instrumentSymbol: symbol,
      provider: 'yahoo',
      identifierType: 'yahoo_symbol',
      identifierValue: yahooSymbol,
      displayName: name,
      currency,
    });
    invalidatePrices(getToday(), 'instrument-create');
    return listInstruments().find((item) => item.symbol === symbol);
  }

  function ensureGeneralGroup() {
    const existing = findGroupById('general');
    if (!existing) ensureGroup('general', 'General', '#64748b', { displayOrder: 90 });
    return findGroupById('general');
  }

  function createInstrumentGroup(input = {}) {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Group name is required');
    const id = String(input.id || groupIdFromName(name)).trim();
    if (groupExists(id)) throw new Error('Group already exists');
    const color = String(input.color || stockColors[listInstrumentGroups().length % stockColors.length]).trim();
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Color must be a hex value');
    ensureGroup(id, name, color, {
      displayOrder: Number(input.displayOrder ?? listInstrumentGroups().length + 1),
      showInDistribution: input.showInDistribution !== false,
      showInMonthly: input.showInMonthly !== false,
      isExpandable: Boolean(input.isExpandable),
    });
    invalidateLedger(getToday(), 'group-create');
    return listInstrumentGroups().find((item) => item.id === id);
  }

  function updateInstrumentGroup(id, input = {}) {
    const existing = findGroupById(String(id));
    if (!existing) throw new Error('Instrument group not found');
    const next = {
      name: String(input.name ?? existing.name).trim(),
      color: String(input.color ?? existing.color).trim(),
      displayOrder: Number(input.displayOrder ?? input.display_order ?? existing.display_order),
      showInDistribution:
        input.showInDistribution === undefined ? Number(existing.show_in_distribution) : input.showInDistribution ? 1 : 0,
      showInMonthly: input.showInMonthly === undefined ? Number(existing.show_in_monthly) : input.showInMonthly ? 1 : 0,
      isExpandable: input.isExpandable === undefined ? Number(existing.is_expandable) : input.isExpandable ? 1 : 0,
      active: input.active === undefined ? Number(existing.active) : input.active ? 1 : 0,
    };
    if (!next.name) throw new Error('Group name is required');
    if (!/^#[0-9a-f]{6}$/i.test(next.color)) throw new Error('Color must be a hex value');
    updateGroupById(existing.id, next);
    invalidateLedger(getToday(), 'group-update');
    return listInstrumentGroups().find((item) => item.id === existing.id);
  }

  function deleteInstrumentGroup(id) {
    const groupId = String(id || '').trim();
    const existing = findGroupById(groupId);
    if (!existing) return { id: groupId, status: 'missing' };
    const activeInstruments = countActiveInstrumentsByGroup(groupId);
    if (activeInstruments > 0) {
      return {
        id: groupId,
        status: 'blocked',
        reason: 'El grupo contiene instrumentos activos. Mueve o elimina esos instrumentos antes de borrar el grupo.',
      };
    }
    clearGroupForInstruments(groupId);
    deleteGroupById(groupId);
    invalidateLedger(getToday(), 'group-delete');
    return { id: groupId, status: 'deleted' };
  }

  function deleteInstrumentGroups(ids = []) {
    const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
    return unique.map((id) => deleteInstrumentGroup(id));
  }

  function ensureInstrument(symbol, quote = null) {
    const normalized = normalizeSymbol(symbol);
    const existing = getInstrument(normalized);
    if (existing) return existing;

    const stockCount = countStockInstruments();
    const color = stockColors[stockCount % stockColors.length];
    const group = ensureGeneralGroup();
    insertInstrument({
      symbol: normalized,
      yahooSymbol: normalized,
      name: normalized,
      type: 'stock',
      currency: quote?.currency || 'EUR',
      color,
      baseShares: 0,
      fallbackPrice: Number(quote?.price || 0),
      active: 1,
      groupId: group.id,
      displayOrder: countActiveInstruments() + 1,
    });
    upsertInstrumentIdentifier({
      instrumentSymbol: normalized,
      provider: 'manual',
      identifierType: 'ticker',
      identifierValue: normalized,
      displayName: normalized,
      currency: quote?.currency || 'EUR',
    });
    upsertInstrumentIdentifier({
      instrumentSymbol: normalized,
      provider: 'yahoo',
      identifierType: 'yahoo_symbol',
      identifierValue: normalized,
      displayName: normalized,
      currency: quote?.currency || 'EUR',
    });

    return getInstrument(normalized);
  }

  Object.assign(ctx, {
    getInstrument,
    getInstrumentByInput,
    listInstruments,
    listInstrumentGroups,
    listInstrumentIdentifiers,
    upsertInstrumentIdentifier,
    deleteInstrumentIdentifier,
    resolveInstrumentFromIdentifiers,
    updateInstrument,
    deleteInstrument,
    deleteInstruments,
    previewInstrumentDelete,
    createInstrument,
    ensureGeneralGroup,
    createInstrumentGroup,
    updateInstrumentGroup,
    deleteInstrumentGroup,
    deleteInstrumentGroups,
    ensureInstrument,
  });
};
