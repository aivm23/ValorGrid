const { assertCtxDeps } = require('../../platform/ctx-utils');

function mapCorporateAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    symbol: row.symbol,
    yahooSymbol: row.yahooSymbol,
    source: row.source,
    sourceEventId: row.sourceEventId,
    effectiveDate: row.effectiveDate,
    oldShares: Number(row.oldShares),
    newShares: Number(row.newShares),
    ratio: Number(row.ratio),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'corporate-action-repository');

  const { db, repositories } = ctx;

  function getCorporateActionBySource(symbol, sourceEventId) {
    return mapCorporateAction(
      db
        .prepare(
          `SELECT id, type, symbol, yahoo_symbol AS yahooSymbol, source,
                  source_event_id AS sourceEventId, effective_date AS effectiveDate,
                  old_shares AS oldShares, new_shares AS newShares, ratio,
                  created_at AS createdAt, updated_at AS updatedAt
           FROM corporate_actions
           WHERE symbol = ? AND source_event_id = ?`,
        )
        .get(symbol, sourceEventId),
    );
  }

  function upsertSplitAction(action) {
    const existing = getCorporateActionBySource(action.symbol, action.sourceEventId);
    const changed =
      existing &&
      (existing.yahooSymbol !== action.yahooSymbol ||
        existing.effectiveDate !== action.effectiveDate ||
        Number(existing.oldShares) !== Number(action.oldShares) ||
        Number(existing.newShares) !== Number(action.newShares) ||
        Number(existing.ratio) !== Number(action.ratio));

    if (!existing) {
      db.prepare(
        `INSERT INTO corporate_actions
          (id, type, symbol, yahoo_symbol, source, source_event_id,
           effective_date, old_shares, new_shares, ratio)
         VALUES (?, 'split', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        action.id,
        action.symbol,
        action.yahooSymbol,
        action.source || 'Yahoo Finance',
        action.sourceEventId,
        action.effectiveDate,
        action.oldShares,
        action.newShares,
        action.ratio,
      );
      return { action: getCorporateActionBySource(action.symbol, action.sourceEventId), created: true, updated: false };
    }

    if (changed) {
      db.prepare(
        `UPDATE corporate_actions
         SET yahoo_symbol = ?, effective_date = ?, old_shares = ?, new_shares = ?,
             ratio = ?, updated_at = CURRENT_TIMESTAMP
         WHERE symbol = ? AND source_event_id = ?`,
      ).run(
        action.yahooSymbol,
        action.effectiveDate,
        action.oldShares,
        action.newShares,
        action.ratio,
        action.symbol,
        action.sourceEventId,
      );
    }

    return {
      action: getCorporateActionBySource(action.symbol, action.sourceEventId),
      created: false,
      updated: Boolean(changed),
    };
  }

  function listCorporateActions(filters = {}) {
    const params = [];
    const where = [];
    if (filters.symbol) {
      where.push('symbol = ?');
      params.push(filters.symbol);
    }
    if (filters.fromDate) {
      where.push('effective_date >= ?');
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      where.push('effective_date <= ?');
      params.push(filters.toDate);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db
      .prepare(
        `SELECT id, type, symbol, yahoo_symbol AS yahooSymbol, source,
                source_event_id AS sourceEventId, effective_date AS effectiveDate,
                old_shares AS oldShares, new_shares AS newShares, ratio,
                created_at AS createdAt, updated_at AS updatedAt
         FROM corporate_actions
         ${clause}
         ORDER BY effective_date ASC, symbol ASC, created_at ASC`,
      )
      .all(...params)
      .map(mapCorporateAction);
  }

  function listSplitsForSymbolUntil(symbol, toDate = null) {
    const query = toDate
      ? `SELECT id, type, symbol, yahoo_symbol AS yahooSymbol, source,
                source_event_id AS sourceEventId, effective_date AS effectiveDate,
                old_shares AS oldShares, new_shares AS newShares, ratio,
                created_at AS createdAt, updated_at AS updatedAt
         FROM corporate_actions
         WHERE symbol = ? AND type = 'split' AND effective_date <= ?
         ORDER BY effective_date ASC, created_at ASC`
      : `SELECT id, type, symbol, yahoo_symbol AS yahooSymbol, source,
                source_event_id AS sourceEventId, effective_date AS effectiveDate,
                old_shares AS oldShares, new_shares AS newShares, ratio,
                created_at AS createdAt, updated_at AS updatedAt
         FROM corporate_actions
         WHERE symbol = ? AND type = 'split'
         ORDER BY effective_date ASC, created_at ASC`;
    const params = toDate ? [symbol, toDate] : [symbol];
    return db
      .prepare(query)
      .all(...params)
      .map(mapCorporateAction);
  }

  function listSplitsUntil(toDate = null) {
    const query = toDate
      ? `SELECT id, type, symbol, yahoo_symbol AS yahooSymbol, source,
                source_event_id AS sourceEventId, effective_date AS effectiveDate,
                old_shares AS oldShares, new_shares AS newShares, ratio,
                created_at AS createdAt, updated_at AS updatedAt
         FROM corporate_actions
         WHERE type = 'split' AND effective_date <= ?
         ORDER BY effective_date ASC, symbol ASC, created_at ASC`
      : `SELECT id, type, symbol, yahoo_symbol AS yahooSymbol, source,
                source_event_id AS sourceEventId, effective_date AS effectiveDate,
                old_shares AS oldShares, new_shares AS newShares, ratio,
                created_at AS createdAt, updated_at AS updatedAt
         FROM corporate_actions
         WHERE type = 'split'
         ORDER BY effective_date ASC, symbol ASC, created_at ASC`;
    const params = toDate ? [toDate] : [];
    return db
      .prepare(query)
      .all(...params)
      .map(mapCorporateAction);
  }

  repositories.corporateActions = {
    ...(repositories.corporateActions || {}),
    getCorporateActionBySource,
    upsertSplitAction,
    listCorporateActions,
    listSplitsForSymbolUntil,
    listSplitsUntil,
  };
};
