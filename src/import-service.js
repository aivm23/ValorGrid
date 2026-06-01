const { previewImportFactory } = require('./import-preview');
const { createImportEntityHelpers } = require('./import-entities');
const { assertCtxDeps } = require('./ctx-utils');

function insertImportBatch(importRepository, preview, mapping) {
  const requestedBatchId = `import-batch:${preview.source}:${preview.payloadHash.slice(0, 24)}`;
  const existingByFile = importRepository.findImportBatchBySourceAndFileHash(preview.source, preview.fileHash);
  const batchId = existingByFile?.id || requestedBatchId;
  const existing = existingByFile || importRepository.findImportBatchById(batchId);
  if (existing?.status === 'committed') return { batchId, existing };
  if (existing?.status === 'rolled_back') {
    importRepository.deleteImportRowsByBatchId(batchId);
    importRepository.resetRolledBackImportBatch(batchId);
    return { batchId, existing: null };
  }

  importRepository.upsertImportBatchForCommit({
    batchId,
    preview,
    mapping,
  });
  return { batchId, existing: null };
}

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['repositories', 'getInstrument', 'getToday', 'invalidateLedger'], 'import-service');

  const { repositories, getInstrument, getToday, invalidateLedger } = ctx;

  const importRepository = repositories.imports;
  if (!importRepository) {
    throw new Error('import-service requires ctx.repositories.imports');
  }

  const { ensureImportEntities, persistRowIdentifiers } = createImportEntityHelpers(ctx);

  function previewImport(input = {}) {
    return previewImportFactory(ctx, input);
  }

  function getImportBatch(id) {
    return importRepository.readImportBatch(id);
  }

  function getImportRows(batchId) {
    return importRepository.readImportRowsForBatch(batchId);
  }

  function listImportBatches() {
    return importRepository.listImportBatchIds().map((id) => getImportBatch(id));
  }

  function commitImport(input = {}) {
    const preview = previewImport(input);
    if (!preview.canCommit) {
      throw new Error('La importacion contiene errores y no se puede guardar');
    }

    const duplicateOnly = preview.rows.every((row) => ['duplicate', 'ignored', 'skipped'].includes(row.status));
    const mapping = input.instrumentMappings || input.mapping || {};

    const result = importRepository.runInTransaction(() => {
      ensureImportEntities(input);
      const { batchId, existing } = insertImportBatch(importRepository, preview, mapping);
      if (existing) {
        return {
          batch: getImportBatch(batchId),
          rows: getImportRows(batchId),
          summary: JSON.parse(existing.summary_json || '{}'),
          usedExistingBatch: true,
        };
      }

      for (const row of preview.rows) {
        const rowId = `${batchId}:row:${row.rowIndex}`;
        if (row.status === 'duplicate' || row.status === 'ignored' || row.status === 'skipped') {
          const persistedStatus = row.status === 'ignored' || row.status === 'skipped' ? 'duplicate' : row.status;
          importRepository.upsertImportRow({
            id: rowId,
            batchId,
            rowIndex: row.rowIndex,
            rawJson: JSON.stringify(row.raw),
            normalizedJson: JSON.stringify(row.normalized),
            status: persistedStatus,
            error: row.ignoreReason || row.ledgerMatch?.reason || null,
            rowHash: row.normalized.rowHash,
            transactionId: row.duplicateTransactionId,
          });
          continue;
        }
        if (row.status !== 'valid') {
          throw new Error(`La fila ${row.rowIndex} no es importable (${row.status})`);
        }

        const instrument = getInstrument(row.normalized.symbol);
        if (!instrument) throw new Error(`Instrument not found during commit: ${row.normalized.symbol || 'unknown'}`);

        importRepository.insertImportedTransaction({
          id: row.normalized.transactionId,
          type: row.normalized.type,
          symbol: instrument.symbol,
          name: instrument.name,
          date: row.normalized.date,
          marketDate: row.normalized.marketDate,
          shares: row.normalized.shares,
          valueEur: row.normalized.valueEur,
          price: row.normalized.price,
          currency: row.normalized.currency,
          fxToEur: row.normalized.fxToEur,
          commissionEur: row.normalized.commissionEur,
          cashFlowEur: row.normalized.cashFlowEur,
          color: instrument.color,
          importBatchId: batchId,
          externalId: row.normalized.externalId,
          rawHash: row.normalized.rowHash,
        });

        importRepository.upsertImportRow({
          id: rowId,
          batchId,
          rowIndex: row.rowIndex,
          rawJson: JSON.stringify(row.raw),
          normalizedJson: JSON.stringify(row.normalized),
          status: 'committed',
          error: null,
          rowHash: row.normalized.rowHash,
          transactionId: row.normalized.transactionId,
        });

        persistRowIdentifiers(row, instrument);
      }

      importRepository.markImportBatchCommitted(batchId);
      return { batch: getImportBatch(batchId), rows: getImportRows(batchId), summary: preview.summary, usedExistingBatch: false };
    });

    if (!result.usedExistingBatch && !duplicateOnly) {
      invalidateLedger(preview.summary.firstDate || getToday(), 'import-commit');
    }
    delete result.usedExistingBatch;
    return result;
  }

  function rollbackImportBatch(id) {
    const batch = getImportBatch(id);
    if (!batch) return false;
    if (batch.status === 'rolled_back') return true;
    const firstDate = batch.firstDate || getToday();

    importRepository.runInTransaction(() => {
      importRepository.insertImportRollbackLog({ ...batch, id });
      importRepository.deleteImportedTransactionsByBatchId(id);
      importRepository.markCommittedImportRowsRolledBack(id);
      importRepository.markImportBatchRolledBack(id);
    });
    invalidateLedger(firstDate, 'import-rollback');
    return true;
  }

  function listImportRollbackLog() {
    return importRepository.listImportRollbackEntries();
  }

  Object.assign(ctx, {
    previewImport,
    commitImport,
    listImportBatches,
    getImportBatch,
    getImportRows,
    rollbackImportBatch,
    listImportRollbackLog,
  });
};
