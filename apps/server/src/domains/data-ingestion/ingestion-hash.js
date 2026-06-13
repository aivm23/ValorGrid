const { sha256 } = require('./ingestion-parser');

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildScopedPayloadHash(parsedPayload, input = {}) {
  return sha256(stableStringify({
    base: parsedPayload.payloadHash,
    rowActions: input.rowActions || {},
    rowMappings: input.rowMappings || {},
    rowEdits: input.rowEdits || {},
    instrumentMappings: input.instrumentMappings || input.mapping || {},
    newInstruments: input.newInstruments || [],
    newGroups: input.newGroups || [],
  }));
}

module.exports = { buildScopedPayloadHash };
