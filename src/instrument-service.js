module.exports = function attach(ctx) {
  with (ctx) {
function getInstrument(symbol) {
  return db.prepare('SELECT * FROM instruments WHERE symbol = ?').get(normalizeSymbol(symbol));
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
  invalidatePrices(getToday(), 'instrument-update');
  return listInstruments().find((item) => item.symbol === existing.symbol);
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

  return getInstrument(normalized);
}

    Object.assign(ctx, { getInstrument, getInstrumentByInput, listInstruments, listInstrumentGroups, updateInstrument, createInstrument, ensureGeneralGroup, createInstrumentGroup, updateInstrumentGroup, ensureInstrument });
  }
};
