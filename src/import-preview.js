const {
  sha256,
  resolveAdapter,
  parseImportPayload,
  normalizeImportRow,
  summarizeImportRows,
  serializeSummary,
} = require('./import-parser');

const DEGIRO_SUBTYPE_LABELS = {
  transactions_export: 'DEGIRO Transacciones CSV',
  portfolio_snapshot: 'DEGIRO Snapshot de cartera',
  unknown: 'DEGIRO CSV',
};

function normalizeMatchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getRawValue(raw = {}, names = []) {
  for (const name of names) {
    if (raw[name] !== undefined && raw[name] !== null && String(raw[name]).trim() !== '') return raw[name];
  }
  return '';
}

function fileSubtypeWarnings(fileSubtype) {
  if (fileSubtype === 'transactions_export') {
    return ['Formato recomendado: export de Transacciones de DEGIRO.'];
  }
  if (fileSubtype === 'portfolio_snapshot') {
    return [
      'Este CSV parece un snapshot de cartera (Portfolio), no un historico de transacciones.',
      'Se usara para conciliacion de posiciones, no para reconstruir historico completo.',
    ];
  }
  return [];
}

function rebuildImportIdentity(normalized, source) {
  delete normalized.rowHash;
  delete normalized.transactionId;
  normalized.rowHash = sha256(JSON.stringify(normalized));
  normalized.transactionId = `import:${source}:${normalized.rowHash.slice(0, 24)}`;
}

function mappingKeyForIdentifier(identifier) {
  const type = String(identifier?.identifierType || identifier?.type || '').trim().toLowerCase();
  const value = String(identifier?.identifierValue || identifier?.value || '').trim().toUpperCase();
  if (!type || !value) return null;
  return `${type}:${value}`;
}

function buildInstrumentMapping(input = {}) {
  const mappingInput = input.instrumentMappings || input.mapping || {};
  if (!mappingInput || typeof mappingInput !== 'object') return new Map();
  const mapping = new Map();
  for (const [rawKey, rawValue] of Object.entries(mappingInput)) {
    const key = String(rawKey || '').trim().toLowerCase();
    if (!key || !rawValue) continue;
    if (typeof rawValue === 'string') mapping.set(key, rawValue.trim().toUpperCase());
    else if (typeof rawValue === 'object' && rawValue.symbol) mapping.set(key, String(rawValue.symbol).trim().toUpperCase());
  }
  return mapping;
}

function resolveByHeuristic(ctx, normalized, raw) {
  if (normalized.symbol) {
    const exactSymbol = ctx.getInstrument(normalized.symbol);
    if (exactSymbol) return exactSymbol;
  }
  const instruments = ctx.listInstruments().filter((item) => item.type !== 'fx');
  const product = getRawValue(raw, ['Producto', 'Product', 'producto', 'product']);
  const productKey = normalizeMatchText(product);
  if (!productKey) return null;
  let best = null;
  for (const instrument of instruments) {
    const symbolKey = normalizeMatchText(instrument.symbol);
    const yahooKey = normalizeMatchText(instrument.yahooSymbol);
    const nameKey = normalizeMatchText(instrument.name);
    let score = 0;
    if (symbolKey && productKey.includes(symbolKey)) score += 6;
    if (yahooKey && productKey.includes(yahooKey)) score += 6;
    if (nameKey && productKey.includes(nameKey)) score += 10;
    const nameTokens = nameKey.split(' ').filter((token) => token.length >= 4);
    if (nameTokens.length && nameTokens.every((token) => productKey.includes(token))) score += 7;
    if (!best || score > best.score) best = { instrument, score };
  }
  return best?.score > 0 ? best.instrument : null;
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
    const mappedSymbol = mapping.get(key);
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

  const resolvedByIdentifier = ctx.resolveInstrumentFromIdentifiers(candidates);
  if (resolvedByIdentifier) return { instrument: resolvedByIdentifier, resolutionStatus: 'resolved', matchedBy: 'identifier' };

  const resolvedByHeuristic = resolveByHeuristic(ctx, row.normalized, row.raw);
  if (resolvedByHeuristic) return { instrument: resolvedByHeuristic, resolutionStatus: 'resolved', matchedBy: 'name_heuristic' };

  const firstKey = candidates.map(mappingKeyForIdentifier).find(Boolean);
  return { instrument: null, resolutionStatus: 'needs_mapping', mappingKey: firstKey || null };
}

function positionWithPendingRows(ctx, symbol, date, pendingRows) {
  let shares = ctx.getPositionShares(symbol, date);
  for (const row of pendingRows) {
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

function matchExistingLedgerTransaction(ctx, normalized) {
  if (!normalized.symbol || !normalized.date || !normalized.type) return null;
  const candidates = ctx.db
    .prepare(
      `SELECT id, shares, price, value_eur AS valueEur, commission_eur AS commissionEur, date, type
       FROM transactions
       WHERE symbol = ? AND type = ? AND date = ?
       ORDER BY created_at ASC`,
    )
    .all(normalized.symbol, normalized.type, normalized.date);
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

function validateFuturePositions(ctx, pendingRows) {
  const bySymbol = new Map();
  for (const row of pendingRows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }

  const errors = [];
  for (const [symbol, rows] of bySymbol) {
    const firstDate = rows.map((row) => row.date).sort()[0];
    let shares = ctx.getPositionShares(symbol, ctx.addDays(firstDate, -1));
    const events = ctx.db
      .prepare('SELECT date, type, shares FROM transactions WHERE symbol = ? AND date >= ? ORDER BY date ASC, created_at ASC')
      .all(symbol, firstDate)
      .map((row) => ({ date: row.date, type: row.type, shares: Number(row.shares || 0) }));
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

function applyTimelineValidation(ctx, rows) {
  const validRows = rows
    .filter((row) => row.status === 'valid' && row.rowKind === 'trade')
    .map((row) => row.normalized);
  if (!validRows.length) return rows;

  const errors = validateFuturePositions(ctx, validRows);
  if (!errors.length) return rows;

  return rows.map((row) => {
    const match = errors.find((error) => error.symbol === row.normalized.symbol && error.date >= row.normalized.date);
    if (!match || row.status !== 'valid') return row;
    return {
      ...row,
      status: 'blocked',
      rowKind: 'blocked',
      errors: [...row.errors, `La importación dejaría posición negativa en ${match.symbol} el ${match.date}`],
    };
  });
}

function reconcileSnapshotRows(ctx, rows, fileSubtype) {
  if (fileSubtype !== 'portfolio_snapshot') {
    return { rows, summary: { exactMatches: 0, deltaPositive: 0, deltaNegative: 0, newPositions: 0 } };
  }

  const summary = { exactMatches: 0, deltaPositive: 0, deltaNegative: 0, newPositions: 0 };
  const nextRows = rows.map((row) => {
    if (row.status !== 'valid' || row.normalized?.type !== 'add') return row;
    const ledgerShares = Number(ctx.getPositionShares(row.normalized.symbol, row.normalized.date) || 0);
    const snapshotShares = Number(row.normalized.shares || 0);
    const deltaShares = snapshotShares - ledgerShares;
    const absDelta = Math.abs(deltaShares);

    const next = {
      ...row,
      normalized: { ...row.normalized },
      ledgerShares,
      snapshotShares,
      deltaShares,
      reconciliationStatus: 'new_position',
      importStrategy: 'opening_position',
    };

    if (Math.abs(ledgerShares) <= 0.000001 && snapshotShares > 0) {
      summary.newPositions += 1;
      return next;
    }
    if (absDelta <= 0.000001) {
      summary.exactMatches += 1;
      next.reconciliationStatus = 'match_exact';
      next.importStrategy = 'skip';
      next.status = 'duplicate';
      next.rowKind = 'duplicate_ledger_match';
      next.ledgerMatch = { reason: 'Snapshot coincide exactamente con el ledger; no se importara.' };
      return next;
    }
    if (deltaShares > 0) {
      summary.deltaPositive += 1;
      next.reconciliationStatus = 'delta_positive';
      next.importStrategy = 'delta_only';
      next.normalized.shares = Number(deltaShares.toFixed(6));
      const nextValue = next.normalized.shares * Number(next.normalized.price || 0) * Number(next.normalized.usdToEur || 1);
      next.normalized.valueEur = Number(nextValue.toFixed(6));
      next.normalized.cashFlowEur = -(next.normalized.valueEur + Number(next.normalized.commissionEur || 0));
      rebuildImportIdentity(next.normalized, next.normalized.source || 'degiro-csv');
      return next;
    }

    summary.deltaNegative += 1;
    next.reconciliationStatus = 'delta_negative';
    next.importStrategy = 'blocked_review';
    next.status = 'blocked';
    next.rowKind = 'blocked';
    next.errors = [...(next.errors || []), 'Snapshot inferior al ledger actual: revisa antes de importar'];
    return next;
  });

  return { rows: nextRows, summary };
}

function previewImportFactory(ctx, input = {}) {
  const adapter = resolveAdapter(input.source || 'csv');
  const mapping = buildInstrumentMapping(input);
  const virtualSymbols = new Set((input.newInstruments || []).map((item) => String(item.symbol || '').trim().toUpperCase()).filter(Boolean));
  const parsedPayload = parseImportPayload(input, adapter);
  const fileSubtype = parsedPayload.fileSubtype || 'unknown';
  const accepted = [];
  const seenHashes = new Set();
  const detectedInstruments = new Map();
  const mappingsRequired = new Map();

  let rows = parsedPayload.parsed.rows.map((row) => {
    const { normalized, errors } = normalizeImportRow(ctx, row, input.mapping || {}, adapter.source, adapter.profile, { fileSubtype });
    const resolution = resolveRowInstrument(ctx, { normalized, raw: row.data }, mapping, virtualSymbols);
    if (resolution.instrument && normalized.symbol !== resolution.instrument.symbol) {
      normalized.symbol = resolution.instrument.symbol;
      rebuildImportIdentity(normalized, adapter.source);
    }

    const instrument = normalized.symbol ? ctx.getInstrument(normalized.symbol) || resolution.instrument : null;
    const mappingKey =
      normalized.externalIdentifiers?.map(mappingKeyForIdentifier).find(Boolean) || (normalized.symbol ? `ticker:${normalized.symbol}` : null);
    const detectedLabel = String(getRawValue(row.data, ['Producto', 'Product', 'producto', 'product']) || normalized.symbol || mappingKey || '').trim();

    if (mappingKey && !detectedInstruments.has(mappingKey)) {
      detectedInstruments.set(mappingKey, { key: mappingKey, label: detectedLabel, symbol: normalized.symbol || null, resolutionStatus: resolution.resolutionStatus });
    }

    let rowKind = normalized.rowKind || 'trade';
    let ledgerMatch = null;
    if (rowKind === 'trade' && resolution.resolutionStatus !== 'needs_mapping' && normalized.symbol && instrument) {
      ledgerMatch = matchExistingLedgerTransaction(ctx, normalized);
      if (ledgerMatch) rowKind = 'duplicate_ledger_match';
    }
    if (rowKind === 'trade' && resolution.resolutionStatus === 'needs_mapping' && mappingKey && !mappingsRequired.has(mappingKey)) {
      mappingsRequired.set(mappingKey, { key: mappingKey, label: detectedLabel, symbol: normalized.symbol || null, sampleRow: row.rowIndex });
    }

    if (normalized.symbol && !instrument && resolution.resolutionStatus !== 'needs_mapping' && rowKind === 'trade') {
      errors.push(`Instrumento no existe: ${normalized.symbol}`);
    }
    if (instrument?.type === 'fx' && rowKind === 'trade') errors.push('No se importan movimientos sobre instrumentos FX');

    if (resolution.resolutionStatus !== 'needs_mapping' && rowKind === 'trade' && normalized.type === 'remove' && normalized.symbol && normalized.date) {
      const available = positionWithPendingRows(ctx, normalized.symbol, normalized.date, accepted);
      if (available + 0.0000001 < normalized.shares) {
        errors.push(`Venta superior a la posicion disponible (${available.toFixed(6)} acciones)`);
      }
    }

    const duplicateByHash = ctx.db.prepare('SELECT id FROM transactions WHERE raw_hash = ? AND origin = ?').get(normalized.rowHash, 'import');
    const repeatedInFile = seenHashes.has(normalized.rowHash);
    let status = 'valid';
    if (rowKind === 'corporate_action_ignored') status = 'ignored';
    else if (errors.length > 0) status = 'error';
    else if (resolution.resolutionStatus === 'needs_mapping') status = 'needs_mapping';
    else if (duplicateByHash || repeatedInFile || ledgerMatch) status = 'duplicate';

    if (!errors.length && status === 'valid') {
      accepted.push(normalized);
      seenHashes.add(normalized.rowHash);
    } else if (!errors.length && (status === 'duplicate' || status === 'ignored')) {
      seenHashes.add(normalized.rowHash);
    }

    return {
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
  });

  const reconciliation = reconcileSnapshotRows(ctx, rows, fileSubtype);
  rows = reconciliation.rows;
  rows = applyTimelineValidation(ctx, rows);
  const summary = serializeSummary(summarizeImportRows(rows));
  const blockedCount = rows.filter((row) => row.status === 'blocked').length;
  const needsMappingCount = rows.filter((row) => row.status === 'needs_mapping').length;

  return {
    source: adapter.source,
    profile: adapter.profile,
    fileSubtype,
    fileSubtypeLabel: adapter.profile === 'degiro' ? DEGIRO_SUBTYPE_LABELS[fileSubtype] || DEGIRO_SUBTYPE_LABELS.unknown : null,
    warnings: adapter.profile === 'degiro' ? fileSubtypeWarnings(fileSubtype) : [],
    reconciliationSummary: reconciliation.summary,
    filename: input.filename || null,
    fileHash: parsedPayload.fileHash,
    payloadHash: parsedPayload.payloadHash,
    headers: parsedPayload.parsed.headers,
    rows,
    summary,
    detectedInstruments: Array.from(detectedInstruments.values()),
    instrumentMappingsRequired: Array.from(mappingsRequired.values()),
    canCommit: summary.errorCount === 0 && needsMappingCount === 0 && blockedCount === 0,
    sheets: parsedPayload.sheets,
    selectedSheet: parsedPayload.selectedSheet,
    sheetName: parsedPayload.selectedSheet,
  };
}

module.exports = {
  previewImportFactory,
};
