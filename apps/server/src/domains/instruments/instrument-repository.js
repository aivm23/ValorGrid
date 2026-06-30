const { assertCtxDeps } = require('../../platform/ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'instrument-repository');

  const { db, repositories } = ctx;

  function findInstrumentBySymbol(symbol) {
    return db.prepare('SELECT * FROM instruments WHERE symbol = ?').get(symbol);
  }

  function findInstrumentBySymbolOrYahoo(normalizedSymbol) {
    return (
      db.prepare('SELECT * FROM instruments WHERE symbol = ?').get(normalizedSymbol) ||
      db.prepare('SELECT * FROM instruments WHERE UPPER(yahoo_symbol) = ?').get(normalizedSymbol)
    );
  }

  function listActiveInstruments() {
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
      .all();
  }

  function listActiveInstrumentGroups() {
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
      .all();
  }

  function listIdentifiers({ symbol = '', provider = '', type = '' } = {}) {
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

  function findIdentifierByLookup(provider, identifierType, identifierValue) {
    return db
      .prepare(
        `SELECT id FROM instrument_identifiers
         WHERE provider = ? AND identifier_type = ? AND identifier_value = ?`,
      )
      .get(provider, identifierType, identifierValue);
  }

  function upsertIdentifier(payload) {
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
  }

  function getIdentifierByLookup(provider, identifierType, identifierValue) {
    return db
      .prepare(
        `SELECT id, instrument_symbol AS instrumentSymbol, provider, identifier_type AS identifierType,
                identifier_value AS identifierValue, display_name AS displayName, currency, exchange, metadata_json AS metadataJson
         FROM instrument_identifiers WHERE provider = ? AND identifier_type = ? AND identifier_value = ?`,
      )
      .get(provider, identifierType, identifierValue);
  }

  function deleteIdentifierById(id) {
    const result = db.prepare('DELETE FROM instrument_identifiers WHERE id = ?').run(id);
    return result.changes > 0;
  }

  function resolveInstrumentByIdentifier(provider, identifierType, identifierValue) {
    return db
      .prepare(
        `SELECT i.* FROM instrument_identifiers ii
         JOIN instruments i ON i.symbol = ii.instrument_symbol
         WHERE ii.provider = ? AND ii.identifier_type = ? AND ii.identifier_value = ?
         LIMIT 1`,
      )
      .get(provider, identifierType, identifierValue);
  }

  function groupExists(groupId) {
    return Boolean(db.prepare('SELECT id FROM instrument_groups WHERE id = ?').get(groupId));
  }

  function updateInstrumentBySymbol(symbol, next) {
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
      symbol,
    );
  }

  function countTransactionsBySymbol(symbol) {
    return db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE symbol = ?').get(symbol).count;
  }

  function countAutoPlansBySymbol(symbol) {
    return db.prepare('SELECT COUNT(*) AS count FROM auto_plans WHERE symbol = ?').get(symbol).count;
  }

  function countIdentifiersBySymbol(symbol) {
    return db.prepare('SELECT COUNT(*) AS count FROM instrument_identifiers WHERE instrument_symbol = ?').get(symbol).count;
  }

  function deactivateInstrumentBySymbol(symbol) {
    db.prepare('UPDATE instruments SET active = 0, show_in_distribution = 0, show_in_monthly = 0 WHERE symbol = ?').run(symbol);
  }

  function deleteIdentifiersBySymbol(symbol) {
    db.prepare('DELETE FROM instrument_identifiers WHERE instrument_symbol = ?').run(symbol);
  }

  function deleteInstrumentBySymbol(symbol) {
    db.prepare('DELETE FROM instruments WHERE symbol = ?').run(symbol);
  }

  function insertInstrument(input) {
    db.prepare(
      `INSERT INTO instruments
        (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.symbol,
      input.yahooSymbol,
      input.name,
      input.type,
      input.currency,
      input.color,
      Number(input.baseShares || 0),
      Number(input.fallbackPrice || 0),
      input.active === undefined ? 1 : input.active ? 1 : 0,
      input.groupId || null,
      Number(input.displayOrder || 0),
    );
  }

  function findGroupById(id) {
    return db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get(id);
  }

  function updateGroupById(id, next) {
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
      id,
    );
  }

  function countActiveInstrumentsByGroup(groupId) {
    return db.prepare('SELECT COUNT(*) AS count FROM instruments WHERE group_id = ? AND active = 1').get(groupId).count;
  }

  function clearGroupForInstruments(groupId) {
    db.prepare('UPDATE instruments SET group_id = NULL WHERE group_id = ?').run(groupId);
  }

  function deleteGroupById(groupId) {
    db.prepare('DELETE FROM instrument_groups WHERE id = ?').run(groupId);
  }

  function countStockInstruments() {
    return db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE type = 'stock'").get().count;
  }

  function countActiveInstruments() {
    return db.prepare('SELECT COUNT(*) AS count FROM instruments WHERE active = 1').get().count;
  }

  function countUngroupedActiveInstruments() {
    return db
      .prepare(
        `SELECT COUNT(*) AS count FROM instruments
         WHERE active = 1 AND (group_id IS NULL OR group_id = '') AND type NOT IN ('fx', 'cash')`,
      )
      .get().count;
  }

  function assignUngroupedActiveInstrumentsToGroup(groupId) {
    const result = db
      .prepare(
        `UPDATE instruments SET group_id = ?
         WHERE active = 1 AND (group_id IS NULL OR group_id = '') AND type != 'fx'`,
      )
      .run(groupId);
    return result.changes;
  }

  function updateInstrumentColor(symbol, color) {
    db.prepare('UPDATE instruments SET color = ? WHERE symbol = ?').run(color, symbol);
  }

  function updateGroupColor(id, color) {
    db.prepare('UPDATE instrument_groups SET color = ? WHERE id = ?').run(color, id);
  }

  function updateTransactionColorBySymbol(symbol, color) {
    db.prepare('UPDATE transactions SET color = ? WHERE symbol = ?').run(color, symbol);
  }

  function getOldestTransactionDateForSymbols(symbols) {
    if (!symbols.length) return null;
    const placeholders = symbols.map(() => '?').join(',');
    const row = db
      .prepare(`SELECT MIN(date) AS minDate FROM transactions WHERE symbol IN (${placeholders})`)
      .get(...symbols);
    return row?.minDate || null;
  }

  repositories.instruments = {
    ...(repositories.instruments || {}),
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
    countUngroupedActiveInstruments,
    assignUngroupedActiveInstrumentsToGroup,
    updateInstrumentColor,
    updateGroupColor,
    updateTransactionColorBySymbol,
    getOldestTransactionDateForSymbols,
  };
};
