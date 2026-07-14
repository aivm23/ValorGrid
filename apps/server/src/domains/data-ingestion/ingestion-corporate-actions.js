const { evaluateSplitForPosition, isSupportedSplitRatio } = require('../corporate-actions/corporate-action-policy');

const NUMBER_EPSILON = 0.000001;

function closeEnough(left, right, epsilon = NUMBER_EPSILON) {
  return (
    Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) <= epsilon
  );
}

function sameMoneyAmount(left, right) {
  return (
    Number.isFinite(Number(left)) &&
    Number.isFinite(Number(right)) &&
    Math.round(Number(left) * 100) === Math.round(Number(right) * 100)
  );
}

function stableIdentifierKeys(normalized = {}) {
  return new Set(
    (normalized.externalIdentifiers || [])
      .map((item) => {
        const provider = String(item.provider || '')
          .trim()
          .toLowerCase();
        const type = String(item.identifierType || item.type || '')
          .trim()
          .toLowerCase();
        const value = String(item.identifierValue || item.value || '')
          .trim()
          .toUpperCase();
        if (!value || (provider === 'manual' && type === 'ticker') || type === 'exchange') return null;
        return `${provider}:${type}:${value}`;
      })
      .filter(Boolean),
  );
}

function sharesRatioMatches(addRow, removeRow, event) {
  const expected = Number(event.newShares) / Number(event.oldShares);
  return closeEnough(Number(addRow.normalized.shares) / Number(removeRow.normalized.shares), expected);
}

function isExactTechnicalPair(left, right, event) {
  if (!isSupportedSplitRatio(event)) return false;
  if (left.status !== 'valid' || right.status !== 'valid') return false;
  if (left.rowKind !== 'trade' || right.rowKind !== 'trade') return false;

  const rows = [left, right];
  const addRow = rows.find((row) => row.normalized.type === 'add');
  const removeRow = rows.find((row) => row.normalized.type === 'remove');
  if (!addRow || !removeRow) return false;
  if (Number(right.rowIndex) !== Number(left.rowIndex) + 1) return false;
  if (!addRow.normalized.symbol || addRow.normalized.symbol !== removeRow.normalized.symbol) return false;
  if (!addRow.normalized.date || addRow.normalized.date !== removeRow.normalized.date) return false;
  if (event.effectiveDate !== addRow.normalized.date) return false;
  if (addRow.normalized.currency !== removeRow.normalized.currency) return false;
  if (!closeEnough(addRow.normalized.fxToEur, removeRow.normalized.fxToEur)) return false;
  if (!closeEnough(addRow.normalized.commissionEur, 0) || !closeEnough(removeRow.normalized.commissionEur, 0))
    return false;
  if (addRow.normalized.externalId || removeRow.normalized.externalId) return false;
  if (!sameMoneyAmount(addRow.normalized.valueEur, removeRow.normalized.valueEur)) return false;
  if (!sameMoneyAmount(addRow.normalized.cashFlowEur, -removeRow.normalized.cashFlowEur)) return false;
  if (!sharesRatioMatches(addRow, removeRow, event)) return false;
  if (!closeEnough(Number(removeRow.normalized.price) / Number(addRow.normalized.price), event.ratio)) return false;

  const leftIdentifiers = stableIdentifierKeys(addRow.normalized);
  const rightIdentifiers = stableIdentifierKeys(removeRow.normalized);
  return [...leftIdentifiers].some((key) => rightIdentifiers.has(key));
}

function markCorporateActionIgnored(row, event) {
  const ignoreReason = `Movimiento técnico conciliado con split Yahoo ${event.oldShares}:${event.newShares} (${event.effectiveDate})`;
  return {
    ...row,
    status: 'ignored',
    rowKind: 'corporate_action_ignored',
    errors: [],
    ignoreReason,
    duplicateTransactionId: null,
    ledgerMatch: null,
    blockReasonCode: null,
    blockReasonMessage: null,
    normalized: {
      ...row.normalized,
      rowKind: 'corporate_action_ignored',
      ignoreReason,
      transactionId: null,
    },
  };
}

async function reconcileTechnicalCorporateActionPairs(ctx, rows) {
  const output = rows.slice();
  const eventCache = new Map();
  const getYahooSplitEvents = ctx.services?.corporateActions?.getYahooSplitEvents || ctx.getYahooSplitEvents;
  if (typeof getYahooSplitEvents !== 'function') return output;

  for (let index = 0; index < output.length - 1; index += 1) {
    const left = output[index];
    const right = output[index + 1];
    const symbol = left.normalized?.symbol;
    const date = left.normalized?.date;
    if (!symbol || !date || right.normalized?.symbol !== symbol || right.normalized?.date !== date) continue;

    const instrument = ctx.getInstrument(symbol);
    const yahooSymbol = instrument?.yahooSymbol || instrument?.yahoo_symbol;
    if (!yahooSymbol) continue;
    const cacheKey = `${yahooSymbol}:${date}`;
    if (!eventCache.has(cacheKey)) {
      eventCache.set(cacheKey, await getYahooSplitEvents(yahooSymbol, date, date));
    }
    const event = eventCache.get(cacheKey).find((candidate) => isExactTechnicalPair(left, right, candidate));
    if (!event) continue;

    const previousDate = ctx.addDays(date, -1);
    const pendingTransactions = output
      .filter((row, rowIndex) => rowIndex !== index && rowIndex !== index + 1)
      .filter((row) => row.status === 'valid' && row.rowKind === 'trade')
      .map((row) => row.normalized)
      .filter((row) => row.symbol === symbol && row.date <= previousDate);
    const sharesBefore = ctx.getPositionShares(symbol, previousDate, pendingTransactions);
    if (!evaluateSplitForPosition(sharesBefore, event).applied) continue;

    output[index] = markCorporateActionIgnored(left, event);
    output[index + 1] = markCorporateActionIgnored(right, event);
    index += 1;
  }
  return output;
}

module.exports = {
  isExactTechnicalPair,
  reconcileTechnicalCorporateActionPairs,
  stableIdentifierKeys,
};
