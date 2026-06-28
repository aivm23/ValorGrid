const ENTRY_MODES = new Set(['market_eur', 'manual_total_eur', 'manual_unit_price']);

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeEntryMode(input = {}) {
  const explicit = String(input.entryMode || input.entry_mode || '').trim();
  if (explicit) {
    if (!ENTRY_MODES.has(explicit)) throw new Error('Invalid entryMode');
    return explicit;
  }
  return positiveNumber(input.unitPrice) ? 'manual_unit_price' : 'market_eur';
}

function validateTransactionAmountInput(input = {}) {
  const entryMode = normalizeEntryMode(input);
  const explicitMode = String(input.entryMode || input.entry_mode || '').trim();
  const hasEuros = positiveNumber(input.euros) !== null;
  const hasShares = positiveNumber(input.shares) !== null;
  const hasUnitPrice = positiveNumber(input.unitPrice) !== null;
  const invalidUnitPrice = Number.isFinite(Number(input.unitPrice)) && Number(input.unitPrice) <= 0;

  if (invalidUnitPrice) throw new Error('unitPrice must be a positive number');
  if (explicitMode && input.type === 'remove' && entryMode === 'market_eur') {
    throw new Error('Sell transactions require shares and gross EUR amount; market_eur is only available for buys');
  }
  if (entryMode === 'manual_total_eur') {
    if (hasUnitPrice) throw new Error('unitPrice cannot be combined with manual_total_eur');
    if (!hasEuros || !hasShares) throw new Error('manual_total_eur requires euros and shares');
    return;
  }
  if (entryMode === 'manual_unit_price') {
    if (hasEuros) throw new Error('unitPrice cannot be combined with euros');
    if (!hasShares) throw new Error('unitPrice requires shares');
    if (!hasUnitPrice) throw new Error('unitPrice must be a positive number');
    return;
  }
  if (explicitMode && entryMode === 'market_eur') {
    if (!hasEuros || hasShares) throw new Error('market_eur requires euros only');
    return;
  }
  if (hasEuros === hasShares) throw new Error('Provide euros or shares, but not both');
}

module.exports = {
  normalizeEntryMode,
  positiveNumber,
  validateTransactionAmountInput,
};
