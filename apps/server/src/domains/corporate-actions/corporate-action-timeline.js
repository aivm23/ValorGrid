function compareDate(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function normalizeSplit(split) {
  return {
    symbol: split.symbol,
    effectiveDate: split.effectiveDate || split.effective_date,
    ratio: Number(split.ratio),
    oldShares: Number(split.oldShares ?? split.old_shares),
    newShares: Number(split.newShares ?? split.new_shares),
  };
}

function normalizeTransaction(transaction) {
  return {
    ...transaction,
    date: transaction.date,
    shares: Number(transaction.shares || 0),
  };
}

function calculateSharesWithSplits({ baseShares = 0, transactions = [], splits = [], transactionSign }) {
  const orderedTransactions = transactions
    .map(normalizeTransaction)
    .filter((transaction) => transaction.date)
    .sort((a, b) => compareDate(a.date, b.date));
  const orderedSplits = splits
    .map(normalizeSplit)
    .filter((split) => split.effectiveDate && Number.isFinite(split.ratio) && split.ratio > 0)
    .sort((a, b) => compareDate(a.effectiveDate, b.effectiveDate));

  let shares = Number(baseShares || 0);
  let transactionIndex = 0;
  let splitIndex = 0;

  while (transactionIndex < orderedTransactions.length || splitIndex < orderedSplits.length) {
    const nextTransaction = orderedTransactions[transactionIndex];
    const nextSplit = orderedSplits[splitIndex];
    const applySplit =
      nextSplit && (!nextTransaction || compareDate(nextSplit.effectiveDate, nextTransaction.date) <= 0);

    if (applySplit) {
      shares = evaluateSplitForPosition(shares, nextSplit).shares;
      splitIndex += 1;
    } else {
      shares += transactionSign(nextTransaction.type) * Number(nextTransaction.shares || 0);
      transactionIndex += 1;
    }
  }

  return shares;
}

module.exports = {
  calculateSharesWithSplits,
  normalizeSplit,
};
const { evaluateSplitForPosition } = require('./corporate-action-policy');
