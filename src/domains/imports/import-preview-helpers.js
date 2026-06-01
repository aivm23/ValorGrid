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

function rebuildImportIdentity(normalized, source, sha256) {
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

function canCommitRows(rows, rowDecisions) {
  const selectedRows = rows.filter((row) => {
    const decision = rowDecisions.get(row.rowIndex);
    const action = decision?.action || (row.status === 'valid' ? 'import' : 'skip');
    return action === 'import';
  });
  const fatalRows = rows.filter((row) => ['error', 'blocked', 'needs_mapping'].includes(row.status));
  const selectedCanCommit = fatalRows.length === 0 && selectedRows.length > 0 && selectedRows.every((row) => row.status === 'valid');
  const onlyNonBlockingRows = rows.length > 0 && selectedRows.length === 0 && fatalRows.length === 0;
  return selectedCanCommit || onlyNonBlockingRows;
}

module.exports = {
  normalizeMatchText,
  getRawValue,
  rebuildImportIdentity,
  mappingKeyForIdentifier,
  buildInstrumentMapping,
  canCommitRows,
};
