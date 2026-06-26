const { assertCtxDeps } = require('../../platform/ctx-utils');
const { withTransaction } = require('../../platform/db');

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    yahooSymbol: row.yahooSymbol,
    source: row.source,
    sourceEventId: row.sourceEventId,
    exDate: row.exDate,
    payDate: row.payDate,
    currency: row.currency,
    detectedAmountPerShare: Number(row.detectedAmountPerShare),
    detectedShares: Number(row.detectedShares),
    detectedTotalOriginal: Number(row.detectedTotalOriginal),
    detectedTotalEur: Number(row.detectedTotalEur),
    effectiveAmountPerShare: Number(row.effectiveAmountPerShare),
    effectiveShares: Number(row.effectiveShares),
    effectiveTotalEur: Number(row.effectiveTotalEur),
    fxToEur: Number(row.fxToEur),
    status: row.status,
    confirmedAutomatically: Boolean(row.confirmedAutomatically),
    transactionId: row.transactionId,
    hasSplitNotice: Boolean(row.hasSplitNotice),
    splitNotice: row.splitNotice,
    rawJson: row.rawJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    confirmedAt: row.confirmedAt,
    ignoredAt: row.ignoredAt,
    autoInclude: Boolean(row.autoInclude),
    name: row.name,
  };
}

function eventSelect() {
  return `SELECT e.id, e.symbol, e.yahoo_symbol AS yahooSymbol, e.source,
                 e.source_event_id AS sourceEventId, e.ex_date AS exDate,
                 e.pay_date AS payDate, e.currency,
                 e.detected_amount_per_share AS detectedAmountPerShare,
                 e.detected_shares AS detectedShares,
                 e.detected_total_original AS detectedTotalOriginal,
                 e.detected_total_eur AS detectedTotalEur,
                 e.effective_amount_per_share AS effectiveAmountPerShare,
                 e.effective_shares AS effectiveShares,
                 e.effective_total_eur AS effectiveTotalEur,
                 e.fx_to_eur AS fxToEur, e.status,
                 e.confirmed_automatically AS confirmedAutomatically,
                 e.transaction_id AS transactionId,
                 e.has_split_notice AS hasSplitNotice,
                 e.split_notice AS splitNotice, e.raw_json AS rawJson,
                 e.created_at AS createdAt, e.updated_at AS updatedAt,
                 e.confirmed_at AS confirmedAt, e.ignored_at AS ignoredAt,
                 COALESCE(s.auto_include, 0) AS autoInclude,
                 i.name AS name
          FROM dividend_events e
          LEFT JOIN dividend_instrument_settings s ON s.symbol = e.symbol
          LEFT JOIN instruments i ON i.symbol = e.symbol`;
}

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'dividend-repository');

  const { db, repositories } = ctx;

  function listDividendEvents(filters = {}) {
    const where = [];
    const params = [];
    if (filters.status) {
      where.push('e.status = ?');
      params.push(filters.status);
    }
    if (filters.symbol) {
      where.push('e.symbol = ?');
      params.push(filters.symbol);
    }
    if (filters.fromDate) {
      where.push('e.ex_date >= ?');
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      where.push('e.ex_date <= ?');
      params.push(filters.toDate);
    }
    const sql = `${eventSelect()} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.ex_date DESC, e.symbol ASC`;
    return db.prepare(sql).all(...params).map(mapEvent);
  }

  function getDividendEvent(id) {
    return mapEvent(db.prepare(`${eventSelect()} WHERE e.id = ?`).get(id));
  }

  function findDividendEventBySource(symbol, sourceEventId) {
    return mapEvent(db.prepare(`${eventSelect()} WHERE e.symbol = ? AND e.source_event_id = ?`).get(symbol, sourceEventId));
  }

  function upsertDividendDraft(event) {
    const existing = findDividendEventBySource(event.symbol, event.sourceEventId);
    if (existing?.status === 'ignored' || existing?.status === 'confirmed') {
      return { event: existing, created: false, updated: false, skipped: true };
    }

    if (existing) {
      db.prepare(
        `UPDATE dividend_events
         SET detected_amount_per_share = ?, detected_shares = ?,
             detected_total_original = ?, detected_total_eur = ?,
             effective_amount_per_share = CASE
               WHEN effective_amount_per_share = detected_amount_per_share THEN ?
               ELSE effective_amount_per_share
             END,
             effective_shares = CASE
               WHEN effective_shares = detected_shares THEN ?
               ELSE effective_shares
             END,
             effective_total_eur = CASE
               WHEN effective_total_eur = detected_total_eur THEN ?
               ELSE effective_total_eur
             END,
             fx_to_eur = ?, has_split_notice = ?, split_notice = ?,
             raw_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(
        event.detectedAmountPerShare,
        event.detectedShares,
        event.detectedTotalOriginal,
        event.detectedTotalEur,
        event.detectedAmountPerShare,
        event.detectedShares,
        event.detectedTotalEur,
        event.fxToEur,
        event.hasSplitNotice ? 1 : 0,
        event.splitNotice || null,
        event.rawJson || null,
        existing.id,
      );
      return { event: getDividendEvent(existing.id), created: false, updated: true, skipped: false };
    }

    db.prepare(
      `INSERT INTO dividend_events
        (id, symbol, yahoo_symbol, source, source_event_id, ex_date, pay_date,
         currency, detected_amount_per_share, detected_shares,
         detected_total_original, detected_total_eur, effective_amount_per_share,
         effective_shares, effective_total_eur, fx_to_eur, status,
         has_split_notice, split_notice, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    ).run(
      event.id,
      event.symbol,
      event.yahooSymbol,
      event.source || 'Yahoo Finance',
      event.sourceEventId,
      event.exDate,
      event.payDate || null,
      event.currency,
      event.detectedAmountPerShare,
      event.detectedShares,
      event.detectedTotalOriginal,
      event.detectedTotalEur,
      event.detectedAmountPerShare,
      event.detectedShares,
      event.detectedTotalEur,
      event.fxToEur,
      event.hasSplitNotice ? 1 : 0,
      event.splitNotice || null,
      event.rawJson || null,
    );
    return { event: getDividendEvent(event.id), created: true, updated: false, skipped: false };
  }

  function updateDividendDraft(id, fields) {
    db.prepare(
      `UPDATE dividend_events
       SET effective_amount_per_share = ?,
           effective_shares = ?,
           effective_total_eur = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'draft'`,
    ).run(fields.amountPerShare, fields.shares, fields.totalEur, id);
    return getDividendEvent(id);
  }

  function markDividendIgnored(id) {
    db.prepare(
      `UPDATE dividend_events
       SET status = 'ignored', ignored_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'draft'`,
    ).run(id);
    return getDividendEvent(id);
  }

  function getDividendSetting(symbol) {
    const row = db.prepare('SELECT auto_include AS autoInclude FROM dividend_instrument_settings WHERE symbol = ?').get(symbol);
    return { symbol, autoInclude: Boolean(row?.autoInclude) };
  }

  function setDividendAutoInclude(symbol, autoInclude) {
    db.prepare(
      `INSERT INTO dividend_instrument_settings (symbol, auto_include)
       VALUES (?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         auto_include = excluded.auto_include,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(symbol, autoInclude ? 1 : 0);
    return getDividendSetting(symbol);
  }

  function getDividendSummary() {
    const totals = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS pendingDraftCount,
           SUM(CASE WHEN status = 'draft' THEN effective_total_eur ELSE 0 END) AS pendingDraftTotalEur,
           SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmedCount,
           SUM(CASE WHEN status = 'confirmed' THEN effective_total_eur ELSE 0 END) AS confirmedTotalEur
         FROM dividend_events`,
      )
      .get();
    const settings = db.prepare('SELECT COUNT(*) AS count FROM dividend_instrument_settings WHERE auto_include = 1').get();
    return {
      pendingDraftCount: Number(totals.pendingDraftCount || 0),
      pendingDraftTotalEur: Number(totals.pendingDraftTotalEur || 0),
      confirmedCount: Number(totals.confirmedCount || 0),
      confirmedTotalEur: Number(totals.confirmedTotalEur || 0),
      autoIncludeSymbols: Number(settings.count || 0),
      latestScan: getLatestDividendScanRun(),
    };
  }

  function createDividendScanRun(run) {
    db.prepare(
      `INSERT INTO dividend_scan_runs
        (id, mode, status, from_date, to_date)
       VALUES (?, ?, 'running', ?, ?)`,
    ).run(run.id, run.mode, run.fromDate, run.toDate);
    return getDividendScanRun(run.id);
  }

  function getDividendScanRun(id) {
    return db
      .prepare(
        `SELECT id, mode, status, started_at AS startedAt, completed_at AS completedAt,
                from_date AS fromDate, to_date AS toDate, scanned_symbols AS scannedSymbols,
                detected_events AS detectedEvents, created_drafts AS createdDrafts,
                updated_drafts AS updatedDrafts, auto_confirmed AS autoConfirmed,
                ignored_no_shares AS ignoredNoShares, split_notice_count AS splitNoticeCount,
                failed_symbols_json AS failedSymbolsJson, error
         FROM dividend_scan_runs WHERE id = ?`,
      )
      .get(id);
  }

  function finishDividendScanRun(id, result) {
    db.prepare(
      `UPDATE dividend_scan_runs
       SET status = ?, completed_at = CURRENT_TIMESTAMP, scanned_symbols = ?,
           detected_events = ?, created_drafts = ?, updated_drafts = ?,
           auto_confirmed = ?, ignored_no_shares = ?, split_notice_count = ?,
           failed_symbols_json = ?, error = ?
       WHERE id = ?`,
    ).run(
      result.status,
      result.scannedSymbols,
      result.detectedEvents,
      result.createdDrafts,
      result.updatedDrafts,
      result.autoConfirmed,
      result.ignoredNoShares,
      result.splitNoticeCount,
      JSON.stringify(result.failedSymbols || []),
      result.error || null,
      id,
    );
    return getDividendScanRun(id);
  }

  function getLatestDividendScanRun() {
    const row = db
      .prepare(
        `SELECT id, mode, status, started_at AS startedAt, completed_at AS completedAt,
                from_date AS fromDate, to_date AS toDate, scanned_symbols AS scannedSymbols,
                detected_events AS detectedEvents, created_drafts AS createdDrafts,
                updated_drafts AS updatedDrafts, auto_confirmed AS autoConfirmed,
                ignored_no_shares AS ignoredNoShares, split_notice_count AS splitNoticeCount,
                failed_symbols_json AS failedSymbolsJson, error
         FROM dividend_scan_runs
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get();
    if (!row) return null;
    return { ...row, failedSymbols: JSON.parse(row.failedSymbolsJson || '[]') };
  }

  function findRunningDividendScanRun() {
    return db
      .prepare(
        `SELECT id, started_at AS startedAt
         FROM dividend_scan_runs
         WHERE status = 'running'
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get();
  }

  function getFirstTransactionDate() {
    return db.prepare('SELECT MIN(date) AS date FROM transactions').get().date;
  }

  function insertDividendTransactionAndConfirm(event, row, confirmedAutomatically) {
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO transactions
          (id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
           fx_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key, external_id, raw_hash)
         VALUES (?, 'dividend', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'auto', ?, ?, ?)`,
      ).run(
        row.id,
        row.symbol,
        row.name,
        row.date,
        row.marketDate,
        row.shares,
        row.valueEur,
        row.price,
        row.currency,
        row.fxToEur,
        row.cashFlowEur,
        row.color,
        row.autoKey,
        row.externalId,
        row.rawHash,
      );
      db.prepare(
        `UPDATE dividend_events
         SET status = 'confirmed', confirmed_automatically = ?,
             transaction_id = ?, confirmed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'draft'`,
      ).run(confirmedAutomatically ? 1 : 0, row.id, event.id);
    });
    return getDividendEvent(event.id);
  }

  repositories.dividends = {
    ...(repositories.dividends || {}),
    listDividendEvents,
    getDividendEvent,
    findDividendEventBySource,
    upsertDividendDraft,
    updateDividendDraft,
    markDividendIgnored,
    getDividendSetting,
    setDividendAutoInclude,
    getDividendSummary,
    createDividendScanRun,
    finishDividendScanRun,
    getLatestDividendScanRun,
    findRunningDividendScanRun,
    getFirstTransactionDate,
    insertDividendTransactionAndConfirm,
  };
};
