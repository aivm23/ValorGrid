function summarizeTransactions(transactions) {
  return transactions.reduce(
    (summary, transaction) => {
      const valueEur = Number(transaction.valueEur || 0);
      const commissionEur = Number(transaction.commissionEur || 0);
      const cashFlowEur = Number(transaction.cashFlowEur || 0);
      summary.commissions += commissionEur;
      summary.netContribution -= cashFlowEur;
      if (transaction.type === 'remove') summary.withdrawals += valueEur;
      else if (transaction.type === 'dividend') {
        summary.dividends += valueEur;
        summary.dividendCount += 1;
        if (transaction.origin === 'auto') summary.autoDividends += 1;
      } else {
        summary.contributions += valueEur;
        if (transaction.origin === 'auto') summary.autoContributions += 1;
      }
      return summary;
    },
    {
      contributions: 0,
      withdrawals: 0,
      dividends: 0,
      dividendCount: 0,
      commissions: 0,
      netContribution: 0,
      autoContributions: 0,
      autoDividends: 0,
    },
  );
}

module.exports = { summarizeTransactions };
