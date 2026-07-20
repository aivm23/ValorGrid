function normalizeMatchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

function getRawValue(raw = {}, names = []) {
  for (const name of names) {
    if (raw[name] !== undefined && raw[name] !== null && String(raw[name]).trim() !== '') return raw[name];
  }
  return '';
}

function rebuildImportIdentity(normalized, source, sha256) {
  delete normalized.rowHash;
  delete normalized.transactionId;
  normalized.rowHash = sha256(JSON.stringify(normalized));
  normalized.transactionId = `import:${source}:${normalized.rowHash.slice(0, 24)}`;
}

function mappingKeyForIdentifier(identifier) {
  const type = String(identifier?.identifierType || identifier?.type || '')
    .trim()
    .toLowerCase();
  const value = String(identifier?.identifierValue || identifier?.value || '')
    .trim()
    .toUpperCase();
  if (!type || !value) return null;
  return `${type}:${value}`;
}

function buildInstrumentMapping(input = {}) {
  const mappingInput = input.instrumentMappings || input.mapping || {};
  if (!mappingInput || typeof mappingInput !== 'object') return new Map();
  const mapping = new Map();
  for (const [rawKey, rawValue] of Object.entries(mappingInput)) {
    const key = String(rawKey || '')
      .trim()
      .toLowerCase();
    if (!key || !rawValue) continue;
    if (typeof rawValue === 'string') mapping.set(key, rawValue.trim().toUpperCase());
    else if (typeof rawValue === 'object' && rawValue.symbol)
      mapping.set(key, String(rawValue.symbol).trim().toUpperCase());
  }
  return mapping;
}

function canCommitRows(rows, rowDecisions) {
  const selectedRows = rows.filter((row) => {
    const decision = rowDecisions.get(row.rowIndex);
    const action = decision?.action || (row.status === 'valid' ? 'import' : 'skip');
    return action === 'import';
  });
  const fatalRows = rows.filter((row) => ['error', 'blocked', 'needs_mapping'].includes(row.status));
  const selectedCanCommit =
    fatalRows.length === 0 && selectedRows.length > 0 && selectedRows.every((row) => row.status === 'valid');
  const onlyNonBlockingRows = rows.length > 0 && selectedRows.length === 0 && fatalRows.length === 0;
  return selectedCanCommit || onlyNonBlockingRows;
}

function warnOnYahooMismatch(normalized, instrument) {
  const storedYahooSymbol = String(instrument?.yahooSymbol || instrument?.yahoo_symbol || '')
    .trim()
    .toUpperCase();
  if (!storedYahooSymbol || !normalized.yahooSymbol || storedYahooSymbol === normalized.yahooSymbol) return;
  normalized.warnings.push(
    `Yahoo de la plantilla (${normalized.yahooSymbol}) no coincide con el guardado para ${instrument.symbol} (${storedYahooSymbol}); no se modifica el instrumento.`,
  );
}

module.exports = {
  normalizeMatchText,
  resolveByHeuristic,
  getRawValue,
  rebuildImportIdentity,
  mappingKeyForIdentifier,
  buildInstrumentMapping,
  canCommitRows,
  warnOnYahooMismatch,
};
