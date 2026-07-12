function createPortfolioOnboardingStatus({
  countVisibleInstruments,
  countActiveInstrumentGroups,
  countTransactions,
  countAutoPlans,
  areInstrumentGroupsEnabled,
}) {
  return function buildOnboardingStatus() {
    const visibleInstrumentCount = countVisibleInstruments();
    const groupCount = countActiveInstrumentGroups();
    const transactionCount = countTransactions();
    const autoPlanCount = countAutoPlans();
    return {
      needsSetup: visibleInstrumentCount === 0,
      hasGroups: groupCount > 0,
      hasInstruments: visibleInstrumentCount > 0,
      hasTransactions: transactionCount > 0,
      hasAutoPlans: autoPlanCount > 0,
      visibleInstrumentCount,
      groupCount,
      transactionCount,
      autoPlanCount,
      groupsEnabled: areInstrumentGroupsEnabled(),
    };
  };
}

module.exports = { createPortfolioOnboardingStatus };
