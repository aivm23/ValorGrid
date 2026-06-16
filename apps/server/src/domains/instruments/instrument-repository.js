function countUngroupedActiveInstruments() {
    return db
      .prepare(
        `SELECT COUNT(*) AS count FROM instruments
         WHERE active = 1 AND (group_id IS NULL OR group_id = '') AND type != 'fx'`,
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