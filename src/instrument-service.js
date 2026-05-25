module.exports = function attach(ctx) {
  with (ctx) {
function getInstrument(symbol) {
  return db.prepare('SELECT * FROM instruments WHERE symbol = ?').get(normalizeSymbol(symbol));
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
  const clauses = [];
  const params = [];
  if (symbol) {
    clauses.push('instrument_symbol = ?');
    params.push(symbol);
  }
  if (provider) {
    clauses.push('provider = ?');
    params.push(provider);
  }
  if (type) {
    clauses.push('identifier_type = ?');
    params.push(type);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT id, instrument_symbol AS instrumentSymbol, provider, identifier_type AS identifierType,
              identifier_value AS identifierValue, display_name AS displayName, currency, exchange,
              metadata_json AS metadataJson, created_at AS createdAt
       FROM instrument_identifiers
       ${whereClause}
       ORDER BY instrument_symbol ASC, provider ASC, identifier_type ASC, identifier_value ASC`,
    )
    .all(...params)
    .map((item) => ({
      ...item,
      metadata: item.metadataJson ? JSON.parse(item.metadataJson) : null,
      metadataJson: undefined,
    }));
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

  const existing = db
    .prepare(
      `SELECT id FROM instrument_identifiers
       WHERE provider = ? AND identifier_type = ? AND identifier_value = ?`,
    )
    .get(provider, identifierType, identifierValue);

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

  db.prepare(
    `INSERT INTO instrument_identifiers
      (id, instrument_symbol, provider, identifier_type, identifier_value, display_name, currency, exchange, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, identifier_type, identifier_value)
     DO UPDATE SET
      instrument_symbol = excluded.instrument_symbol,
      display_name = COALESCE(excluded.display_name, instrument_identifiers.display_name),
      currency = COALESCE(excluded.currency, instrument_identifiers.currency),
      exchange = COALESCE(excluded.exchange, instrument_identifiers.exchange),
      metadata_json = COALESCE(excluded.metadata_json, instrument_identifiers.metadata_json)`,
  ).run(
    payload.id,
    payload.instrumentSymbol,
    payload.provider,
    payload.identifierType,
    payload.identifierValue,
    payload.displayName,
    payload.currency,
    payload.exchange,
    payload.metadataJson,
  );

  return db
    .prepare(
      `SELECT id, instrument_symbol AS instrumentSymbol, provider, identifier_type AS identifierType,
              identifier_value AS identifierValue, display_name AS displayName, currency, exchange, metadata_json AS metadataJson
       FROM instrument_identifiers WHERE provider = ? AND identifier_type = ? AND identifier_value = ?`,
    )
    .get(provider, identifierType, identifierValue);
}

function deleteInstrumentIdentifier(id) {
  if (!id) return false;
  const result = db.prepare('DELETE FROM instrument_identifiers WHERE id = ?').run(String(id));
  return result.changes > 0;
}

function resolveInstrumentFromIdentifiers(candidates = []) {
  for (const candidate of candidates) {
    const provider = normalizeIdentifierText(candidate.provider || '').toLowerCase();
    const identifierType = normalizeIdentifierText(candidate.identifierType || candidate.type).toLowerCase();
    const identifierValue = normalizeIdentifierLookup(candidate.identifierValue || candidate.value);
    if (!provider || !identifierType || !identifierValue) continue;
    const resolved = db
      .prepare(
        `SELECT i.* FROM instrument_identifiers ii
         JOIN instruments i ON i.symbol = ii.instrument_symbol
         WHERE ii.provider = ? AND ii.identifier_type = ? AND ii.identifier_value = ?
         LIMIT 1`,
      )
      .get(provider, identifierType, identifierValue);
    if (resolved) return resolved;
  }
  return null;
}

function getInstrumentByInput(value) {
  const normalized = normalizeSymbol(value);
  return (
    db.prepare('SELECT * FROM instruments WHERE symbol = ?').get(normalized) ||
    db.prepare('SELECT * FROM instruments WHERE UPPER(yahoo_symbol) = ?').get(normalized)
  );
}

function listInstruments() {
  return db
    .prepare(
      `SELECT symbol, yahoo_symbol AS yahooSymbol, name, type, currency, color,
              base_shares AS baseShares, fallback_price AS fallbackPrice, active,
              group_id AS groupId, display_order AS displayOrder,
              show_in_distribution AS showInDistribution, show_in_monthly AS showInMonthly
       FROM instruments
       WHERE active = 1
       ORDER BY type ASC, display_order ASC, symbol ASC`,
    )
    .all()
    .map((item) => ({
      ...item,
      active: Boolean(item.active),
      showInDistribution: Boolean(item.showInDistribution),
      showInMonthly: Boolean(item.showInMonthly),
    }));
}

function listInstrumentGroups() {
  return db
    .prepare(
      `SELECT id, name, color, display_order AS displayOrder,
              show_in_distribution AS showInDistribution,
              show_in_monthly AS showInMonthly,
              is_expandable AS isExpandable,
              active
       FROM instrument_groups
       WHERE active = 1
       ORDER BY display_order ASC, name ASC`,
    )
    .all()
    .map((item) => ({
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
  if (next.groupId && !db.prepare('SELECT id FROM instrument_groups WHERE id = ?').get(next.groupId)) {
    throw new Error('Instrument group not found');
  }

  db.prepare(
    `UPDATE instruments
     SET yahoo_symbol = ?, name = ?, type = ?, currency = ?, color = ?, fallback_price = ?,
         group_id = ?, display_order = ?, show_in_distribution = ?, show_in_monthly = ?, active = ?
     WHERE symbol = ?`,
  ).run(
    next.yahooSymbol,
    next.name,
    next.type,
    next.currency,
    next.color,
    next.fallbackPrice,
    next.groupId,
    next.displayOrder,
    next.showInDistribution,
    next.showInMonthly,
    next.active,
    existing.symbol,
  );
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
  return {
    transactions: db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE symbol = ?').get(normalized).count,
    autoPlans: db.prepare('SELECT COUNT(*) AS count FROM auto_plans WHERE symbol = ?').get(normalized).count,
    identifiers: db.prepare('SELECT COUNT(*) AS count FROM instrument_identifiers WHERE instrument_symbol = ?').get(normalized).count,
  };
}

function deleteInstrument(symbol) {
  const existing = getInstrument(symbol);
  if (!existing) return { symbol: normalizeSymbol(symbol), status: 'missing' };
  if (existing.type === 'fx') throw new Error('Technical FX instruments cannot be deleted');
  const deps = instrumentDependencyCounts(existing.symbol);
  if (deps.transactions > 0 || deps.autoPlans > 0 || Math.abs(Number(existing.base_shares || 0)) > 0.000001) {
    db.prepare(
      `UPDATE instruments
       SET active = 0, show_in_distribution = 0, show_in_monthly = 0
       WHERE symbol = ?`,
    ).run(existing.symbol);
    invalidateLedger(getToday(), 'instrument-deactivate');
    return { symbol: existing.symbol, status: 'deactivated', dependencies: deps };
  }
  db.prepare('DELETE FROM instrument_identifiers WHERE instrument_symbol = ?').run(existing.symbol);
  db.prepare('DELETE FROM instruments WHERE symbol = ?').run(existing.symbol);
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
  if (!db.prepare('SELECT id FROM instrument_groups WHERE id = ?').get(groupId)) throw new Error('Instrument group not found');
  db.prepare(
    `INSERT INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`,
  ).run(symbol, yahooSymbol, name, type, currency, color, fallbackPrice, groupId, listInstruments().length + 1);
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
  const existing = db.prepare("SELECT id FROM instrument_groups WHERE id = 'general'").get();
  if (!existing) ensureGroup('general', 'General', '#64748b', { displayOrder: 90 });
  return db.prepare("SELECT id FROM instrument_groups WHERE id = 'general'").get();
}

function createInstrumentGroup(input = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Group name is required');
  const id = String(input.id || groupIdFromName(name)).trim();
  if (db.prepare('SELECT id FROM instrument_groups WHERE id = ?').get(id)) throw new Error('Group already exists');
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
  const existing = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get(String(id));
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
  db.prepare(
    `UPDATE instrument_groups
     SET name = ?, color = ?, display_order = ?, show_in_distribution = ?,
         show_in_monthly = ?, is_expandable = ?, active = ?
     WHERE id = ?`,
  ).run(
    next.name,
    next.color,
    next.displayOrder,
    next.showInDistribution,
    next.showInMonthly,
    next.isExpandable,
    next.active,
    existing.id,
  );
  invalidateLedger(getToday(), 'group-update');
  return listInstrumentGroups().find((item) => item.id === existing.id);
}

function deleteInstrumentGroup(id) {
  const groupId = String(id || '').trim();
  const existing = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get(groupId);
  if (!existing) return { id: groupId, status: 'missing' };
  const activeInstruments = db
    .prepare('SELECT COUNT(*) AS count FROM instruments WHERE group_id = ? AND active = 1')
    .get(groupId).count;
  if (activeInstruments > 0) {
    return {
      id: groupId,
      status: 'blocked',
      reason: 'El grupo contiene instrumentos activos. Mueve o elimina esos instrumentos antes de borrar el grupo.',
    };
  }
  db.prepare('UPDATE instruments SET group_id = NULL WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM instrument_groups WHERE id = ?').run(groupId);
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

  const stockCount = db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE type = 'stock'").get().count;
  const color = stockColors[stockCount % stockColors.length];
  const group = ensureGeneralGroup();
  db.prepare(
    `INSERT INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order)
     VALUES (?, ?, ?, 'stock', ?, ?, 0, ?, 1, ?, ?)`,
  ).run(
    normalized,
    normalized,
    normalized,
    quote?.currency || 'EUR',
    color,
    Number(quote?.price || 0),
    group.id,
    listInstruments().length + 1,
  );
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
      createInstrument,
      ensureGeneralGroup,
      createInstrumentGroup,
      updateInstrumentGroup,
      deleteInstrumentGroup,
      deleteInstrumentGroups,
      ensureInstrument,
    });
  }
};
