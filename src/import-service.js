const { previewImportFactory } = require('./import-preview');
const { createImportEntityHelpers } = require('./import-entities');

function insertImportBatch(ctx, preview, mapping) {
  const { db } = ctx;
  const requestedBatchId = `import-batch:${preview.source}:${preview.payloadHash.slice(0, 24)}`;
  const existingByFile = db.prepare('SELECT * FROM import_batches WHERE source = ? AND file_hash = ?').get(preview.source, preview.fileHash);
  const batchId = existingByFile?.id || requestedBatchId;
  const existing = existingByFile || db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId);
  if (existing?.status === 'committed') return { batchId, existing };
  if (existing?.status === 'rolled_back') {
    db.prepare('DELETE FROM import_rows WHERE batch_id = ?').run(batchId);
  }

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
  return { batchId, existing: null };
}

module.exports = function attach(ctx) {
  const { db, getInstrument, getToday, invalidateLedger } = ctx;
  const { ensureImportEntities, persistRowIdentifiers } = createImportEntityHelpers(ctx);

  function previewImport(input = {}) {
    return previewImportFactory(ctx, input);
  }

  function getImportBatch(id) {
    const batch = db
      .prepare(
        `SELECT id, source, filename, file_hash AS fileHash, status, summary_json AS summaryJson,
                row_count AS rowCount, error_count AS errorCount, first_date AS firstDate,
                last_date AS lastDate, created_at AS createdAt, committed_at AS committedAt,
                rolled_back_at AS rolledBackAt
         FROM import_batches
         WHERE id = ?`,
      )
      .get(id);
    return batch ? { ...batch, summary: JSON.parse(batch.summaryJson || '{}'), summaryJson: undefined } : null;
  }

  function getImportRows(batchId) {
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

  function listImportBatches() {
    return db
      .prepare('SELECT id FROM import_batches ORDER BY COALESCE(committed_at, created_at) DESC')
      .all()
      .map((row) => getImportBatch(row.id));
  }

  function commitImport(input = {}) {
    const preview = previewImport(input);
    if (!preview.canCommit) {
      throw new Error('La importacion contiene errores y no se puede guardar');
    }

    const duplicateOnly = preview.rows.every((row) => ['duplicate', 'ignored', 'skipped'].includes(row.status));
    const mapping = input.instrumentMappings || input.mapping || {};

    db.exec('BEGIN');
    try {
      ensureImportEntities(input);
      const { batchId, existing } = insertImportBatch(ctx, preview, mapping);
      if (existing) {
        db.exec('COMMIT');
        return { batch: getImportBatch(batchId), rows: getImportRows(batchId), summary: JSON.parse(existing.summary_json || '{}') };
      }

      const rowInsert = db.prepare(
        `INSERT OR REPLACE INTO import_rows
          (id, batch_id, row_index, raw_json, normalized_json, status, error, row_hash, transaction_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const transactionInsert = db.prepare(
        `INSERT INTO transactions
          (id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
           usd_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key,
           import_batch_id, external_id, raw_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', NULL, ?, ?, ?)`,
      );

      for (const row of preview.rows) {
        const rowId = `${batchId}:row:${row.rowIndex}`;
        if (row.status === 'duplicate' || row.status === 'ignored' || row.status === 'skipped') {
          const persistedStatus = row.status === 'ignored' || row.status === 'skipped' ? 'duplicate' : row.status;
          rowInsert.run(
            rowId,
            batchId,
            row.rowIndex,
            JSON.stringify(row.raw),
            JSON.stringify(row.normalized),
            persistedStatus,
            row.ignoreReason || row.ledgerMatch?.reason || null,
            row.normalized.rowHash,
            row.duplicateTransactionId,
          );
          continue;
        }
        if (row.status !== 'valid') {
          throw new Error(`La fila ${row.rowIndex} no es importable (${row.status})`);
        }

        const instrument = getInstrument(row.normalized.symbol);
        if (!instrument) throw new Error(`Instrument not found during commit: ${row.normalized.symbol || 'unknown'}`);

        transactionInsert.run(
          row.normalized.transactionId,
          row.normalized.type,
          instrument.symbol,
          instrument.name,
          row.normalized.date,
          row.normalized.marketDate,
          row.normalized.shares,
          row.normalized.valueEur,
          row.normalized.price,
          row.normalized.currency,
          row.normalized.usdToEur,
          row.normalized.commissionEur,
          row.normalized.cashFlowEur,
          instrument.color,
          batchId,
          row.normalized.externalId,
          row.normalized.rowHash,
        );

        rowInsert.run(
          rowId,
          batchId,
          row.rowIndex,
          JSON.stringify(row.raw),
          JSON.stringify(row.normalized),
          'committed',
          null,
          row.normalized.rowHash,
          row.normalized.transactionId,
        );

        persistRowIdentifiers(row, instrument);
      }

      db.prepare('UPDATE import_batches SET committed_at = CURRENT_TIMESTAMP WHERE id = ?').run(batchId);
      db.exec('COMMIT');
      if (!duplicateOnly) invalidateLedger(preview.summary.firstDate || getToday(), 'import-commit');
      return { batch: getImportBatch(batchId), rows: getImportRows(batchId), summary: preview.summary };
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw error;
    }
  }

  function rollbackImportBatch(id) {
    const batch = getImportBatch(id);
    if (!batch) return false;
    if (batch.status === 'rolled_back') return true;
    const firstDate = batch.firstDate || getToday();

    db.exec('BEGIN');
    try {
      db.prepare("DELETE FROM transactions WHERE import_batch_id = ? AND origin = 'import'").run(id);
      db.prepare("UPDATE import_rows SET status = 'rolled_back' WHERE batch_id = ? AND status = 'committed'").run(id);
      db.prepare("UPDATE import_batches SET status = 'rolled_back', rolled_back_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      db.exec('COMMIT');
      invalidateLedger(firstDate, 'import-rollback');
      return true;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw error;
    }
  }

  Object.assign(ctx, {
    previewImport,
    commitImport,
    listImportBatches,
    getImportBatch,
    getImportRows,
    rollbackImportBatch,
  });
};
