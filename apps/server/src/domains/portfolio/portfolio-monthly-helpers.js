function createPortfolioMonthlyHelpers({ summarizeTransactions, minimumDisplayValueEur }) {
  function summarizeGroupTransactions(transactions, groupId, instrumentGroups) {
    return summarizeTransactions(
      transactions.filter((transaction) => instrumentGroups.get(transaction.symbol) === groupId),
    );
  }

  function buildMonthlyGroups(cells, configuredColumns, total, monthTransactions, instrumentGroups) {
    return configuredColumns
      .map((column) => {
        const cell = cells[column.id];
        const value = Number(cell?.value || 0);
        if (!cell || cell.empty || value < minimumDisplayValueEur) return null;
        const flows = column.isGroup
          ? summarizeGroupTransactions(monthTransactions, column.id, instrumentGroups)
          : summarizeTransactions(monthTransactions.filter((transaction) => transaction.symbol === column.id));
        return {
          id: column.id,
          label: column.label,
          color: column.color,
          value,
          pct: total > 0 ? (value / total) * 100 : 0,
          contributions: flows.contributions,
          withdrawals: flows.withdrawals,
          dividends: flows.dividends,
          dividendCount: flows.dividendCount,
          commissions: flows.commissions,
          netContribution: flows.netContribution,
          positions: cell.positions || [],
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.value - left.value);
  }

  function topMonthlyGroup(groups, previousGroupValues) {
    if (!groups.length) return null;
    const ranked = groups
      .map((group) => ({
        id: group.id,
        label: group.label,
        color: group.color,
        value: group.value,
        variation: group.value - Number(previousGroupValues.get(group.id) || 0),
      }))
      .sort((left, right) => Math.abs(right.variation) - Math.abs(left.variation));
    return ranked[0] || null;
  }

  return { buildMonthlyGroups, topMonthlyGroup };
}

module.exports = { createPortfolioMonthlyHelpers };
