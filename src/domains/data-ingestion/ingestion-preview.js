const {
  sha256,
  resolveAdapter,
  parseImportPayload,
  normalizeImportRow,
  summarizeImportRows,
  serializeSummary,
} = require('./ingestion-parser');
const { buildScopedPayloadHash } = require('./ingestion-hash');
const {
  normalizeRowDecisions,
  applyRowEdit,
  buildDetectedInstrumentOutput,
  buildImpactPreview,
} = require('./ingestion-reconcile');
const { markSkippedSaleDeficit } = require('./ingestion-sale-rules');
const {
  normalizeMatchText,
  getRawValue,
  rebuildImportIdentity,
  mappingKeyForIdentifier,
  buildInstrumentMapping,
  canCommitRows,
} = require('./ingestion-preview-helpers');


function resolveByHeuristic(ctx, normalized, raw) {
  if (normalized.symbol) {
    const exactSymbol = ctx.getInstrument(normalized.symbol);
    if (exactSymbol) return exactSymbol;
  }
  const instruments = ctx.listInstruments().filter((item) => item.type !== 'fx');
  const product = getRawValue(raw, ['Ticker', 'ticker', 'Symbol', 'symbol']) || normalized.symbol;
  const productKey = normalizeMatchText(product);
  if (!productKey) return null;
  for (const instrument of instruments) {
    const symbolKey = normalizeMatchText(instrument.symbol);
    const yahooKey = normalizeMatchText(instrument.yahooSymbol);
    const nameKey = normalizeMatchText(instrument.name);
    if (symbolKey && productKey === symbolKey) return instrument;
    if (yahooKey && productKey === yahooKey) return instrument;
    if (nameKey && productKey === nameKey) return instrument;
  }
  return null;
}

function resolveRowInstrument(ctx, row, mapping, virtualSymbols = new Set()) {
  const candidates = row.normalized.externalIdentifiers || [];
  if (row.normalized.symbol) {
    candidates.unshift({
      provider: 'manual',
      identifierType: 'ticker',
      identifierValue: row.normalized.symbol,
    });
  }

  for (const candidate of candidates) {
    const key = mappingKeyForIdentifier(candidate);
    if (!key) continue;
    const mappedSymbol = mapping.get(key) || mapping.get(key.toLowerCase());
    if (!mappedSymbol) continue;
    const mappedInstrument = ctx.getInstrument(mappedSymbol);
    if (mappedInstrument) return { instrument: mappedInstrument, resolutionStatus: 'resolved', matchedBy: key };
    if (virtualSymbols.has(mappedSymbol)) {
      return {
        instrument: { symbol: mappedSymbol, type: 'stock', name: mappedSymbol, color: '#2563eb' },
        resolutionStatus: 'mapped_new',
        matchedBy: key,
      };
    }
  }

  const identifierCandidates = candidates.filter((candidate) => {
    const provider = String(candidate.provider || '').trim().toLowerCase();
    const type = String(candidate.identifierType || candidate.type || '').trim().toLowerCase();
    if (provider === 'manual' && type === 'ticker') return false;
    if (type === 'exchange') return false;
    return true;
  });
  const resolvedByIdentifier = ctx.resolveInstrumentFromIdentifiers(identifierCandidates);
  if (resolvedByIdentifier) return { instrument: resolvedByIdentifier, resolutionStatus: 'resolved', matchedBy: 'identifier' };

  const resolvedByHeuristic = resolveByHeuristic(ctx, row.normalized, row.raw);
  if (resolvedByHeuristic) return { instrument: resolvedByHeuristic, resolutionStatus: 'resolved', matchedBy: 'name_heuristic' };

  const firstKey = candidates.map(mappingKeyForIdentifier).find(Boolean);
  return { instrument: null, resolutionStatus: 'needs_mapping', mappingKey: firstKey || null };
}

function positionWithPendingRows(ctx, symbol, date, pendingRows, excludeRowIndex) {
  let shares = ctx.getPositionShares(symbol, date);
  for (const row of pendingRows) {
    if (row.rowIndex === excludeRowIndex) continue;
    if (row.symbol === symbol && row.date <= date) {
      shares += ctx.transactionSign(row.type) * row.shares;
    }
  }
  return shares;
}

function almostEqual(a, b, relative = 0.02, absolute = 0.05) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  return diff <= Math.max(absolute, Math.abs(b) * relative);
}

function matchExistingLedgerTransaction(importRepository, normalized) {
  if (!normalized.symbol || !normalized.date || !normalized.type) return null;
  const candidates = importRepository.listLedgerTransactionsForExactMatch({
    symbol: normalized.symbol,
    type: normalized.type,
    date: normalized.date,
  });
  for (const item of candidates) {
    if (Math.abs(Number(item.shares || 0) - Number(normalized.shares || 0)) > 0.000001) continue;
    if (!almostEqual(Number(item.price || 0), Number(normalized.price || 0), 0.03, 0.1)) continue;
    if (!almostEqual(Number(item.valueEur || 0), Number(normalized.valueEur || 0), 0.03, 0.1)) continue;
    if (!almostEqual(Number(item.commissionEur || 0), Number(normalized.commissionEur || 0), 0.03, 0.1)) continue;
    return {
      id: item.id,
      reason: `Movimiento ya existente en ledger (${normalized.type === 'remove' ? 'venta' : 'compra'} ${normalized.date}); se omitira para evitar duplicidad.`,
    };
  }
  return null;
}

function validateFuturePositions(ctx, importRepository, pendingRows) {
  const bySymbol = new Map();
  for (const row of pendingRows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }

  const errors = [];
  for (const [symbol, rows] of bySymbol) {
    const firstDate = rows.map((row) => row.date).sort()[0];
    let shares = ctx.getPositionShares(symbol, ctx.addDays(firstDate, -1));
    const events = importRepository.listLedgerEventsSince({ symbol, fromDate: firstDate });
    events.push(...rows.map((row) => ({ date: row.date, type: row.type, shares: row.shares })));
    events.sort((a, b) => a.date.localeCompare(b.date));

    const grouped = new Map();
    for (const event of events) {
      grouped.set(event.date, (grouped.get(event.date) || 0) + ctx.transactionSign(event.type) * event.shares);
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

function applyTimelineValidation(ctx, importRepository, rows) {
  const allTradeRows = rows
    .filter((row) => row.rowKind === 'trade' && row.normalized.symbol && row.normalized.date)
    .map((row) => row.normalized);
  if (!allTradeRows.length) return rows;

  const errors = validateFuturePositions(ctx, importRepository, allTradeRows);
  if (!errors.length) return rows;

  return rows.map((row) => {
    const match = errors.find((error) => error.symbol === row.normalized.symbol && error.date >= row.normalized.date);
    if (!match || row.status !== 'valid') return row;
    return {
      ...row,
      status: 'blocked',
      rowKind: 'blocked',
      errors: [
        ...row.errors,
        `Esta venta necesita compras anteriores del mismo instrumento (${match.symbol} en ${match.date}). Asignalas/importalas primero u omite esta fila.`,
      ],
    };
  });
}


function previewImportFactory(ctx, input = {}) {
  const importRepository = ctx.repositories?.imports;
  if (!importRepository) {
    throw new Error('import-preview requires ctx.repositories.imports');
  }

  const adapter = resolveAdapter(input.source || 'csv');
  const mapping = buildInstrumentMapping(input);
  const rowDecisions = normalizeRowDecisions(input);
  const virtualSymbols = new Set((input.newInstruments || []).map((item) => String(item.symbol || '').trim().toUpperCase()).filter(Boolean));
  const parsedPayload = parseImportPayload(input, adapter);
  const scopedPayloadHash = buildScopedPayloadHash(parsedPayload, input);
  const fileSubtype = parsedPayload.fileSubtype || 'unknown';
  const accepted = [];
  const allResolvedTrades = [];
  const seenHashes = new Set();
  const detectedInstruments = new Map();
  const mappingsRequired = new Map();

  let rows = parsedPayload.parsed.rows.map((row) => {
    let { normalized, errors } = normalizeImportRow(ctx, row, input.mapping || {}, adapter.source, adapter.profile, { fileSubtype });
    const rowDecision = rowDecisions.get(row.rowIndex) || {};
    const skipRequested = rowDecision.action === 'skip';
    if (rowDecision.symbol) {
      normalized.symbol = rowDecision.symbol;
      rebuildImportIdentity(normalized, adapter.source, sha256);
    }
    if (rowDecision.edit) {
      const edited = applyRowEdit(normalized, rowDecision.edit, adapter.source, (next, source) => rebuildImportIdentity(next, source, sha256));
      normalized = edited.normalized;
      if (edited.errors.length) errors.push(...edited.errors);
    }
    const forcedInstrument = rowDecision.symbol ? ctx.getInstrument(rowDecision.symbol) : null;
    const resolution = forcedInstrument
      ? { instrument: forcedInstrument, resolutionStatus: 'resolved', matchedBy: 'row_mapping' }
      : rowDecision.symbol && virtualSymbols.has(String(rowDecision.symbol).toUpperCase())
        ? { instrument: { symbol: String(rowDecision.symbol).toUpperCase(), type: 'stock', name: String(rowDecision.symbol).toUpperCase(), color: '#2563eb' }, resolutionStatus: 'mapped_new', matchedBy: 'row_mapping' }
        : resolveRowInstrument(ctx, { normalized, raw: row.data }, mapping, virtualSymbols);
    if (resolution.instrument && normalized.symbol !== resolution.instrument.symbol) {
      normalized.symbol = resolution.instrument.symbol;
      rebuildImportIdentity(normalized, adapter.source, sha256);
    }

    const instrument = normalized.symbol ? ctx.getInstrument(normalized.symbol) || resolution.instrument : null;
    const mappingKey =
      normalized.externalIdentifiers?.map(mappingKeyForIdentifier).find(Boolean) || (normalized.symbol ? `ticker:${normalized.symbol}` : null);
    const detectedLabel = String(normalized.symbol || mappingKey || '').trim();

    if (mappingKey && !detectedInstruments.has(mappingKey)) {
      detectedInstruments.set(mappingKey, {
        key: mappingKey,
        label: detectedLabel,
        symbol: normalized.symbol || null,
        isin:
          normalized.externalIdentifiers
            ?.find((item) => String(item.identifierType || '').toLowerCase() === 'isin')
            ?.identifierValue || null,
        currency: normalized.currency || null,
        exchange: null,
        resolutionStatus: resolution.resolutionStatus,
        resolutionSource: resolution.matchedBy || null,
        autoResolutionConfidence:
          resolution.matchedBy === 'identifier' ? 'alta' : resolution.matchedBy === 'row_mapping' ? 'alta' : resolution.matchedBy ? 'media' : 'ninguna',
        rowCount: 0,
        buys: 0,
        sells: 0,
        approxValueEur: 0,
        rowIndexes: new Set(),
        firstDate: null,
        lastDate: null,
      });
    }
    if (mappingKey && detectedInstruments.has(mappingKey)) {
      const instrumentInfo = detectedInstruments.get(mappingKey);
      instrumentInfo.rowCount += 1;
      instrumentInfo.rowIndexes.add(row.rowIndex);
      if (normalized.type === 'add') instrumentInfo.buys += 1;
      if (normalized.type === 'remove') instrumentInfo.sells += 1;
      instrumentInfo.approxValueEur += Number(normalized.valueEur || 0);
      if (normalized.date && (!instrumentInfo.firstDate || normalized.date < instrumentInfo.firstDate)) instrumentInfo.firstDate = normalized.date;
      if (normalized.date && (!instrumentInfo.lastDate || normalized.date > instrumentInfo.lastDate)) instrumentInfo.lastDate = normalized.date;
      if (resolution.resolutionStatus === 'needs_mapping') instrumentInfo.resolutionStatus = 'needs_mapping';
      if (resolution.matchedBy && !instrumentInfo.resolutionSource) instrumentInfo.resolutionSource = resolution.matchedBy;
      if (rowDecision.action === 'skip') instrumentInfo.hasSkippedRows = true;
    }

    let rowKind = normalized.rowKind || 'trade';
    let ledgerMatch = null;
    if (skipRequested) {
      return {
        rowIndex: row.rowIndex,
        raw: row.data,
        normalized,
        status: 'skipped',
        rowKind: 'skipped',
        resolutionStatus: resolution.resolutionStatus,
        mappingKey,
        matchedBy: resolution.matchedBy || null,
        errors: [],
        ignoreReason: 'Fila omitida por el usuario',
        duplicateTransactionId: null,
        ledgerMatch: null,
      };
    }
    if (rowKind === 'trade' && resolution.resolutionStatus !== 'needs_mapping' && normalized.symbol && instrument) {
      ledgerMatch = matchExistingLedgerTransaction(importRepository, normalized);
      if (ledgerMatch) rowKind = 'duplicate_ledger_match';
    }
    if (rowKind === 'trade' && resolution.resolutionStatus === 'needs_mapping' && mappingKey && !mappingsRequired.has(mappingKey)) {
      mappingsRequired.set(mappingKey, { key: mappingKey, label: detectedLabel, symbol: normalized.symbol || null, sampleRow: row.rowIndex });
    }

    if (normalized.symbol && !instrument && resolution.resolutionStatus !== 'needs_mapping' && rowKind === 'trade') {
      errors.push(`Instrumento no existe: ${normalized.symbol}`);
    }
    if (instrument?.type === 'fx' && rowKind === 'trade') errors.push('No se importan movimientos sobre instrumentos FX');

    let saleDeficit = null;
    if (resolution.resolutionStatus !== 'needs_mapping' && rowKind === 'trade' && normalized.type === 'remove' && normalized.symbol && normalized.date) {
      const available = positionWithPendingRows(ctx, normalized.symbol, normalized.date, allResolvedTrades, row.rowIndex);
      if (available + 0.0000001 < normalized.shares) {
        saleDeficit = {
          code: available <= 0.0000001 ? 'existing_empty_position' : 'existing_insufficient_position',
          available,
        };
      }
    }

    const duplicateByHash = importRepository.findImportedTransactionByRawHash(normalized.rowHash);
    const repeatedInFile = seenHashes.has(normalized.rowHash);
    let status = 'valid';
    if (rowKind === 'corporate_action_ignored') status = 'ignored';
    else if (errors.length > 0) status = 'error';
    else if (resolution.resolutionStatus === 'needs_mapping') status = 'needs_mapping';
    else if (duplicateByHash || repeatedInFile || ledgerMatch) status = 'duplicate';
    if (saleDeficit && status === 'valid') {
      status = 'skipped';
      rowKind = 'skipped';
    }

    if (!errors.length && status === 'valid') {
      accepted.push(normalized);
      seenHashes.add(normalized.rowHash);
    } else if (!errors.length && (status === 'duplicate' || status === 'ignored')) {
      seenHashes.add(normalized.rowHash);
    }
    if (rowKind === 'trade' && normalized.symbol && normalized.date && Number.isFinite(normalized.shares)) {
      allResolvedTrades.push({ rowIndex: row.rowIndex, symbol: normalized.symbol, date: normalized.date, type: normalized.type, shares: normalized.shares });
    }

    const outputRow = {
      rowIndex: row.rowIndex,
      raw: row.data,
      normalized,
      status,
      rowKind,
      resolutionStatus: resolution.resolutionStatus,
      mappingKey,
      matchedBy: resolution.matchedBy || null,
      errors,
      ignoreReason: normalized.ignoreReason || null,
      duplicateTransactionId: duplicateByHash?.id || ledgerMatch?.id || null,
      ledgerMatch,
    };
    return saleDeficit ? markSkippedSaleDeficit(outputRow, saleDeficit.code, saleDeficit.available) : outputRow;
  });

  rows = rows.map((row) => {
    if (row.status !== 'skipped' || row.blockReasonCode !== 'existing_empty_position') return row;
    if (row.normalized.type !== 'remove' || !row.normalized.symbol || !row.normalized.date) return row;
    const available = positionWithPendingRows(ctx, row.normalized.symbol, row.normalized.date, allResolvedTrades, row.rowIndex);
    if (available + 0.0000001 < row.normalized.shares) return row;
    return { ...row, status: 'valid', rowKind: 'trade', blockReasonCode: null, blockReasonMessage: null };
  });
  accepted.length = 0;
  for (const row of rows) {
    if (row.status === 'valid' && row.rowKind === 'trade') accepted.push(row.normalized);
  }

  const sellOnlyUnresolvedKeys = new Set(Array.from(detectedInstruments.values())
    .filter((item) => item.resolutionStatus === 'needs_mapping' && Number(item.sells || 0) > 0 && Number(item.buys || 0) === 0)
    .map((item) => item.key));
  if (sellOnlyUnresolvedKeys.size) {
    rows = rows.map((row) => {
      if (row.status !== 'needs_mapping' || !sellOnlyUnresolvedKeys.has(row.mappingKey)) return row;
      return markSkippedSaleDeficit(row, 'unknown_sell_only', 0);
    });
    for (const key of sellOnlyUnresolvedKeys) mappingsRequired.delete(key);
  }
  rows = applyTimelineValidation(ctx, importRepository, rows);
  const summary = serializeSummary(summarizeImportRows(rows));
  const detectedInstrumentOutput = buildDetectedInstrumentOutput(detectedInstruments).map((item) => ({
    ...item,
    tickerSuggestions:
      typeof ctx.suggestTickersForIdentity === 'function'
        ? ctx.suggestTickersForIdentity({
            name: item.label,
            label: item.label,
            isin: item.isin,
            currency: item.currency,
            exchange: item.exchange,
          })
        : [],
  }));

  return {
    source: adapter.source,
    profile: adapter.profile,
    fileSubtype,
    fileSubtypeLabel: null,
    warnings: [],
    reconciliationSummary: { exactMatches: 0, deltaPositive: 0, deltaNegative: 0, newPositions: 0 },
    filename: input.filename || null,
    fileHash: parsedPayload.fileHash,
    payloadHash: scopedPayloadHash,
    headers: parsedPayload.parsed.headers,
    rows,
    summary,
    detectedInstruments: detectedInstrumentOutput,
    instrumentMappingsRequired: Array.from(mappingsRequired.values()),
    impactPreview: buildImpactPreview(ctx, rows),
    canCommit: canCommitRows(rows, rowDecisions),
    sheets: parsedPayload.sheets,
    selectedSheet: parsedPayload.selectedSheet,
    sheetName: parsedPayload.selectedSheet,
  };
}

module.exports = {
  previewImportFactory,
};
