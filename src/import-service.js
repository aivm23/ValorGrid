const {
  resolveAdapter,
  parseImportPayload,
  normalizeImportRow,
  summarizeImportRows,
  serializeSummary,
} = require('./import-parser');

function positionWithPendingRows(ctx, symbol, date, pendingRows) {
  const { getPositionShares, transactionSign } = ctx;
  let shares = getPositionShares(symbol, date);
  for (const row of pendingRows) {
    if (row.symbol === symbol && row.date <= date) {
      shares += transactionSign(row.type) * row.shares;
    }
  }
  return shares;
}

function validateFuturePositions(ctx, pendingRows) {
  const { getPositionShares, transactionSign, db, addDays } = ctx;
  const bySymbol = new Map();
  for (const row of pendingRows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }

  const errors = [];
  for (const [symbol, rows] of bySymbol) {
    const firstDate = rows.map((row) => row.date).sort()[0];
    let shares = getPositionShares(symbol, addDays(firstDate, -1));
    const events = db
      .prepare('SELECT date, type, shares FROM transactions WHERE symbol = ? AND date >= ? ORDER BY date ASC, created_at ASC')
      .all(symbol, firstDate)
      .map((row) => ({ date: row.date, type: row.type, shares: Number(row.shares || 0) }));
    events.push(...rows.map((row) => ({ date: row.date, type: row.type, shares: row.shares })));
    events.sort((a, b) => a.date.localeCompare(b.date));

    const grouped = new Map();
    for (const event of events) {
      grouped.set(event.date, (grouped.get(event.date) || 0) + transactionSign(event.type) * event.shares);
    }

    for (const [date, delta] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      shares += delta;
      if (shares < -0.0000001) {
        errors.push({ symbol, date });
        break;
      }
    }
  }
  return errors;
}

function applyTimelineValidation(ctx, rows) {
  const validRows = rows.filter((row) => row.status === 'valid').map((row) => row.normalized);
  if (!validRows.length) return rows;

  const errors = validateFuturePositions(ctx, validRows);
  if (!errors.length) return rows;

  return rows.map((row) => {
    const match = errors.find((error) => error.symbol === row.normalized.symbol && error.date >= row.normalized.date);
    if (!match || row.status !== 'valid') return row;
    return {
      ...row,
      status: 'error',
      errors: [...row.errors, `La importación dejaría posición negativa en ${match.symbol} el ${match.date}`],
    };
  });
}

function previewImportFactory(ctx, input = {}) {
  const { getInstrument, db } = ctx;
  const adapter = resolveAdapter(input.source || 'csv');
  const mapping = input.mapping || {};
  const parsedPayload = parseImportPayload(input, adapter);
  const accepted = [];
  const seenHashes = new Set();

  let rows = parsedPayload.parsed.rows.map((row) => {
    const { normalized, errors } = normalizeImportRow(ctx, row, mapping, adapter.source, adapter.profile);
    const instrument = normalized.symbol ? getInstrument(normalized.symbol) : null;

    if (normalized.symbol && !instrument) errors.push(`Instrumento no existe: ${normalized.symbol}`);
    if (instrument?.type === 'fx') errors.push('No se importan movimientos sobre instrumentos FX');
    if (normalized.type === 'remove' && normalized.symbol && normalized.date && Number.isFinite(normalized.shares)) {
      const available = positionWithPendingRows(ctx, normalized.symbol, normalized.date, accepted);
      if (available + 0.0000001 < normalized.shares) errors.push('Venta superior a la posición disponible');
    }

    const duplicate = db.prepare('SELECT id FROM transactions WHERE raw_hash = ? AND origin = ?').get(normalized.rowHash, 'import');
    const repeatedInFile = seenHashes.has(normalized.rowHash);
    const status = errors.length ? 'error' : duplicate || repeatedInFile ? 'duplicate' : 'valid';

    if (!errors.length) seenHashes.add(normalized.rowHash);
    if (status === 'valid') accepted.push(normalized);

    return {
      rowIndex: row.rowIndex,
      raw: row.data,
      normalized,
      status,
      errors,
      duplicateTransactionId: duplicate?.id || null,
    };
  });

  rows = applyTimelineValidation(ctx, rows);
  const summary = serializeSummary(summarizeImportRows(rows));
  return {
    source: adapter.source,
    profile: adapter.profile,
    filename: input.filename || null,
    fileHash: parsedPayload.fileHash,
    payloadHash: parsedPayload.payloadHash,
    headers: parsedPayload.parsed.headers,
    rows,
    summary,
    canCommit: summary.errorCount === 0,
    sheets: parsedPayload.sheets,
    selectedSheet: parsedPayload.selectedSheet,
    sheetName: parsedPayload.selectedSheet,
  };
}

function insertImportBatch(ctx, preview, mapping) {
  const { db } = ctx;
  const batchId = `import-batch:${preview.source}:${preview.payloadHash.slice(0, 24)}`;
  const existing = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId);
  if (existing?.status === 'committed') return { batchId, existing };

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
       committed_at = CURRENT_TIMESTAMP`,
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
    if (preview.summary.errorCount > 0) throw new Error('La importación contiene errores y no se puede guardar');
    const duplicateOnly = preview.rows.every((row) => row.status === 'duplicate');
    const mapping = input.mapping || {};

    db.exec('BEGIN');
    try {
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
        if (row.status === 'duplicate') {
          rowInsert.run(
            rowId,
            batchId,
            row.rowIndex,
            JSON.stringify(row.raw),
            JSON.stringify(row.normalized),
            'duplicate',
            null,
            row.normalized.rowHash,
            row.duplicateTransactionId,
          );
          continue;
        }

        const instrument = getInstrument(row.normalized.symbol);
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
