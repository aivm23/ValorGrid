function compareLedgerEvents(a, b) {
  const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateCompare !== 0) return dateCompare;
  if (a.kind !== b.kind) return a.kind === 'split' ? -1 : 1;
  return Number(a.index || 0) - Number(b.index || 0);
}

function buildLedgerAnalyticsFromTransactions(transactions, currentValue = 0, splits = []) {
  const lotsBySymbol = new Map();
  let grossInvested = 0;
  let grossWithdrawn = 0;
  let commissions = 0;
  let netCashFlow = 0;
  let realizedGain = 0;
  let dividendIncomeEur = 0;
  let dividendCount = 0;

  const events = [
    ...transactions.map((transaction, index) => ({ kind: 'transaction', date: transaction.date, transaction, index })),
    ...splits.map((split, index) => ({
      kind: 'split',
      date: split.effectiveDate || split.effective_date,
      split,
      index,
    })),
  ].sort(compareLedgerEvents);

  for (const event of events) {
    if (event.kind === 'split') {
      const split = event.split;
      const ratio = Number(split.ratio);
      if (!Number.isFinite(ratio) || ratio <= 0) continue;
      const lots = lotsBySymbol.get(split.symbol) || [];
      for (const lot of lots) {
        lot.shares *= ratio;
      }
      continue;
    }

    const { transaction } = event;
    const shares = Number(transaction.shares || 0);
    const valueEur = Number(transaction.valueEur || 0);
    const commissionEur = Number(transaction.commissionEur || 0);
    const cashFlowEur = Number(transaction.cashFlowEur || 0);
    commissions += commissionEur;
    netCashFlow += cashFlowEur;

    if (!lotsBySymbol.has(transaction.symbol)) lotsBySymbol.set(transaction.symbol, []);
    const lots = lotsBySymbol.get(transaction.symbol);

    if (transaction.type === 'add') {
      grossInvested += valueEur;
      lots.push({ shares, cost: valueEur + commissionEur });
      continue;
    }

    if (transaction.type === 'dividend') {
      dividendIncomeEur += valueEur;
      dividendCount += 1;
      continue;
    }

    grossWithdrawn += valueEur;
    let remaining = shares;
    let costBasis = 0;
    while (remaining > 0.0000001 && lots.length) {
      const lot = lots[0];
      const consumed = Math.min(remaining, lot.shares);
      const ratio = lot.shares > 0 ? consumed / lot.shares : 0;
      costBasis += lot.cost * ratio;
      lot.shares -= consumed;
      lot.cost -= lot.cost * ratio;
      remaining -= consumed;
      if (lot.shares <= 0.0000001) lots.shift();
    }
    realizedGain += valueEur - commissionEur - costBasis;
  }
  const netContributed = -netCashFlow;
  const totalGain = Number(currentValue || 0) - netContributed;
  const unrealizedGain = totalGain - realizedGain - dividendIncomeEur;
  return {
    grossInvested,
    grossWithdrawn,
    dividendIncomeEur,
    dividendCount,
    commissions,
    netCashFlow,
    netContributed,
    realizedGain,
    unrealizedGain,
    totalGain,
    simpleReturnPct: netContributed > 0 ? (totalGain / netContributed) * 100 : null,
    transactionCount: transactions.length,
  };
}

module.exports = { buildLedgerAnalyticsFromTransactions };
