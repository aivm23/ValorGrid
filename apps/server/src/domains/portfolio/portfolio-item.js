function toPortfolioItem(instrument, valuation = {}) {
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    groupId: instrument.group_id,
    showInDistribution: Boolean(instrument.show_in_distribution),
    showInMonthly: Boolean(instrument.show_in_monthly),
    ...valuation,
  };
}

module.exports = { toPortfolioItem };
