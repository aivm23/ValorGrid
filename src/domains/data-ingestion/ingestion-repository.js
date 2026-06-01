const { assertCtxDeps } = require('../../platform/ctx-utils');
const { withTransaction } = require('../../platform/db');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'import-repository');

  const { db, repositories } = ctx;

  function findImportBatchBySourceAndFileHash(source, fileHash) {
    return db.prepare('SELECT * FROM import_batches WHERE source = ? AND file_hash = ?').get(source, fileHash);
  }

  function findImportBatchById(batchId) {
    return db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId);
  }

  function deleteImportRowsByBatchId(batchId) {
    db.prepare('DELETE FROM import_rows WHERE batch_id = ?').run(batchId);
  }

  function resetRolledBackImportBatch(batchId) {
    db.prepare(
      `UPDATE import_batches
       SET status = 'previewed', rolled_back_at = NULL, committed_at = NULL
       WHERE id = ?`,
    ).run(batchId);
  }

  function upsertImportBatchForCommit({ batchId, preview, mapping }) {
    db.prepare(
      `INSERT INTO import_batches
        (id, source, filename, file_hash, status, mapping_json, summary_json, row_count,
         error_count, first_date, last_date)
       VALUES (?, ?, ?, ?, 'committed', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = 'committed',
         summary_json = excluded.summary_json,
         row_count = excluded.row_count,
         error_count = excluded.error_count,
         first_date = excluded.first_date,
         last_date = excluded.last_date,
         committed_at = CURRENT_TIMESTAMP,
         rolled_back_at = NULL`,
    ).run(
      batchId,
      preview.source,
      preview.filename,
      preview.fileHash,
      JSON.stringify(mapping || {}),
      JSON.stringify(preview.summary),
      preview.summary.rowCount,
      preview.summary.errorCount,
      preview.summary.firstDate,
      preview.summary.lastDate,
    );
  }

  function readImportBatch(batchId) {
    const batch = db
      .prepare(
        `SELECT id, source, filename, file_hash AS fileHash, status, summary_json AS summaryJson,
                row_count AS rowCount, error_count AS errorCount, first_date AS firstDate,
                last_date AS lastDate, created_at AS createdAt, committed_at AS committedAt,
                rolled_back_at AS rolledBackAt
         FROM import_batches
         WHERE id = ?`,
      )
      .get(batchId);
    return batch ? { ...batch, summary: JSON.parse(batch.summaryJson || '{}'), summaryJson: undefined } : null;
  }

  function readImportRowsForBatch(batchId) {
    return db
      .prepare(
        `SELECT id, batch_id AS batchId, row_index AS rowIndex, raw_json AS rawJson,
                normalized_json AS normalizedJson, status, error, row_hash AS rowHash,
                transaction_id AS transactionId, created_at AS createdAt
         FROM import_rows
         WHERE batch_id = ?
         ORDER BY row_index ASC`,
      )
      .all(batchId)
      .map((row) => ({
        ...row,
        raw: JSON.parse(row.rawJson || '{}'),
        normalized: row.normalizedJson ? JSON.parse(row.normalizedJson) : null,
        rawJson: undefined,
        normalizedJson: undefined,
      }));
  }

  function listImportBatchIds() {
    return db
      .prepare('SELECT id FROM import_batches ORDER BY COALESCE(committed_at, created_at) DESC')
      .all()
      .map((row) => row.id);
  }

  function runInTransaction(work) {
    return withTransaction(db, work);
  }

  function upsertImportRow(row) {
    db.prepare(
      `INSERT OR REPLACE INTO import_rows
        (id, batch_id, row_index, raw_json, normalized_json, status, error, row_hash, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      row.batchId,
      row.rowIndex,
      row.rawJson,
      row.normalizedJson,
      row.status,
      row.error,
      row.rowHash,
      row.transactionId,
    );
  }

  function insertImportedTransaction(row) {
    db.prepare(
      `INSERT INTO transactions
         (id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
          fx_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key,
          import_batch_id, external_id, raw_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', NULL, ?, ?, ?)`,
    ).run(
      row.id,
      row.type,
      row.symbol,
      row.name,
      row.date,
      row.marketDate,
      row.shares,
      row.valueEur,
      row.price,
      row.currency,
      row.fxToEur,
      row.commissionEur,
      row.cashFlowEur,
      row.color,
      row.importBatchId,
      row.externalId,
      row.rawHash,
    );
  }

  function markImportBatchCommitted(batchId) {
    db.prepare('UPDATE import_batches SET committed_at = CURRENT_TIMESTAMP WHERE id = ?').run(batchId);
  }

  function insertImportRollbackLog(batch) {
    db.prepare(
      `INSERT INTO import_rollback_log (batch_id, source, filename, row_count, error_count, first_date, last_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(batch.id, batch.source, batch.filename, batch.rowCount, batch.errorCount, batch.firstDate, batch.lastDate);
  }

  function deleteImportedTransactionsByBatchId(batchId) {
    db.prepare("DELETE FROM transactions WHERE import_batch_id = ? AND origin = 'import'").run(batchId);
  }

  function markCommittedImportRowsRolledBack(batchId) {
    db.prepare("UPDATE import_rows SET status = 'rolled_back' WHERE batch_id = ? AND status = 'committed'").run(batchId);
  }

  function markImportBatchRolledBack(batchId) {
    db.prepare("UPDATE import_batches SET status = 'rolled_back', rolled_back_at = CURRENT_TIMESTAMP WHERE id = ?").run(batchId);
  }

  function listImportRollbackEntries() {
    return db
      .prepare(
        `SELECT id, batch_id AS batchId, source, filename, row_count AS rowCount,
                error_count AS errorCount, first_date AS firstDate, last_date AS lastDate,
                rolled_back_at AS rolledBackAt
         FROM import_rollback_log
         ORDER BY rolled_back_at DESC`,
      )
      .all();
  }

  function findImportedTransactionByRawHash(rowHash) {
    return db.prepare('SELECT id FROM transactions WHERE raw_hash = ? AND origin = ?').get(rowHash, 'import');
  }

  function listLedgerTransactionsForExactMatch({ symbol, type, date }) {
    return db
      .prepare(
        `SELECT id, shares, price, value_eur AS valueEur, commission_eur AS commissionEur, date, type
         FROM transactions
         WHERE symbol = ? AND type = ? AND date = ?
         ORDER BY created_at ASC`,
      )
      .all(symbol, type, date);
  }

  function listLedgerEventsSince({ symbol, fromDate }) {
    return db
      .prepare('SELECT date, type, shares FROM transactions WHERE symbol = ? AND date >= ? ORDER BY date ASC, created_at ASC')
      .all(symbol, fromDate)
      .map((row) => ({ date: row.date, type: row.type, shares: Number(row.shares || 0) }));
  }

  repositories.imports = {
    ...(repositories.imports || {}),
    findImportBatchBySourceAndFileHash,
    findImportBatchById,
    deleteImportRowsByBatchId,
    resetRolledBackImportBatch,
    upsertImportBatchForCommit,
    readImportBatch,
    readImportRowsForBatch,
    listImportBatchIds,
    runInTransaction,
    upsertImportRow,
    insertImportedTransaction,
    markImportBatchCommitted,
    insertImportRollbackLog,
    deleteImportedTransactionsByBatchId,
    markCommittedImportRowsRolledBack,
    markImportBatchRolledBack,
    listImportRollbackEntries,
    findImportedTransactionByRawHash,
    listLedgerTransactionsForExactMatch,
    listLedgerEventsSince,
  };
};
