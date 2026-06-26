function pickCtxFunctions(ctx, names) {
  return names.reduce((picked, name) => {
    if (typeof ctx[name] === 'function') picked[name] = ctx[name];
    return picked;
  }, {});
}

function bindGroupedCtxNamespaces(ctx) {
  Object.assign(
    ctx.services.shared,
    pickCtxFunctions(ctx, [
      'sendJson', 'sendText', 'readJsonBody', 'normalizeSymbol', 'getToday',
      'dateUtc', 'formatDateUtc', 'addDays', 'addYears', 'toUnixSeconds',
      'toEur', 'transactionSign', 'getMemoryCached', 'setMemoryCached',
      'readAlphaVantageKey', 'saveAlphaVantageKey', 'deleteAlphaVantageKey',
    ]),
  );
  Object.assign(
    ctx.services.meta,
    pickCtxFunctions(ctx, ['getMetaNumber', 'bumpMetaVersion', 'getDataVersions', 'recordHistoryInvalidation', 'invalidateLedger', 'invalidatePrices']),
  );
  Object.assign(
    ctx.services.instruments,
    pickCtxFunctions(ctx, [
      'getInstrument', 'getInstrumentByInput', 'listInstruments', 'listInstrumentGroups',
      'listInstrumentIdentifiers', 'upsertInstrumentIdentifier', 'deleteInstrumentIdentifier',
      'resolveInstrumentFromIdentifiers', 'updateInstrument', 'deleteInstrument',
      'deleteInstruments', 'previewInstrumentDelete', 'createInstrument', 'ensureGeneralGroup',
      'createInstrumentGroup', 'updateInstrumentGroup', 'deleteInstrumentGroup',
      'deleteInstrumentGroups', 'ensureInstrument',
      'isBrandPaletteEnabled', 'setBrandPaletteEnabled', 'applyBrandPalette',
      'applyBrandPaletteToGroups', 'applyBrandPaletteToInstruments',
    ]),
  );
  Object.assign(
    ctx.services.suggestions,
    pickCtxFunctions(ctx, ['suggestTickersForIdentity', 'searchTickerSuggestions']),
  );
  Object.assign(
    ctx.services.marketData,
    pickCtxFunctions(ctx, [
      'fetchYahooChart', 'fetchLatestYahooPrice', 'firstDailyCloseAtOrAfter',
      'getYahooDividendEvents',
      'fetchDatedYahooPrice', 'dailyCacheHasRange', 'getCachedDailyPrices',
      'fetchDatedYahooPriceWithFallback', 'fetchLatestYahooPriceWithFallback',
      'getBestLocalQuote', 'parseDailyPrices', 'getDailyPrices', 'getQuoteForSymbol',
      'getDailyPricesForInstrument', 'getQuoteForYahooSymbol', 'getUsdToEur', 'getFxToEur',
      'resolvePriceSourcesForInstrument', 'listMarketDataSources',
    ]),
  );
  Object.assign(
    ctx.services.transactions,
    pickCtxFunctions(ctx, [
      'getTransactions', 'getAutoPlans', 'buildLedgerAnalytics', 'buildPortfolioPerformance',
      'replaceAutoPlans', 'autoPlanFrequency', 'normalizeAutoPlans',
      'autoPlanMateriallyChanged', 'applyAutoPlanEditPolicy', 'getAutoPlanScheduledDates',
      'autoKeyForPlan', 'autoPlanExists', 'previewAutoPlanExecutions', 'getPositionShares',
      'createTransaction', 'previewTransaction', 'deleteTransaction', 'isAutoPlanSkipped',
    ]),
  );
  Object.assign(
    ctx.services.dividends,
    pickCtxFunctions(ctx, [
      'scanDividendEvents', 'listDividendDrafts', 'getDividendSummary',
      'updateDividendDraft', 'confirmDividendDraft', 'ignoreDividendDraft',
      'setDividendAutoInclude', 'runStartupDividendScan',
    ]),
  );
  Object.assign(
    ctx.services.dataIngestion,
    pickCtxFunctions(ctx, ['previewImport', 'commitImport', 'listImportBatches', 'getImportBatch', 'getImportRows', 'rollbackImportBatch', 'listImportRollbackLog', 'getImportTemplate']),
  );
  Object.assign(
    ctx.services.onboarding,
    pickCtxFunctions(ctx, ['previewOnboardingWizard', 'commitOnboardingWizard']),
  );
  Object.assign(
    ctx.services.portfolio,
    pickCtxFunctions(ctx, ['getMonthEndDate', 'getScheduledDate', 'executeDueAutoPlans', 'getInstrumentValuation', 'buildSummary', 'dbInstrument', 'withPercentages', 'buildMonthly', 'getInstrumentValuationAt', 'buildOnboardingStatus', 'isEffectiveValuation', 'buildPortfolioPerformance']),
  );
  Object.assign(
    ctx.services.history,
    pickCtxFunctions(ctx, [
      'firstTransactionDate', 'resolveHistoryWindow', 'getHistoryInstruments', 'getTransactionsUntil',
      'getHistoryEvents', 'weekKey', 'reduceDatesForGranularity', 'pointDatesFromPriceRows',
      'getHistoryBuild', 'getOldestHistoryInvalidation', 'historyBuildIsFresh', 'markHistoryBuild',
      'replaceMarketPrices', 'replaceFxRates', 'rebuildPortfolioEvents', 'replaceMaterializedHistory',
      'rebuildDailyPortfolioHistory', 'ensureHistoryBuilt', 'queryHistorySeries', 'queryHistoryEvents',
      'ensureRangeStartPoint', 'enrichSeriesWithContributed', 'buildPortfolioHistory',
    ]),
  );
  Object.assign(
    ctx.services.diagnostics,
    pickCtxFunctions(ctx, ['tableCount', 'buildPerformanceDiagnostics', 'getDatabaseStats', 'buildHealth', 'buildTransactionsXlsx']),
  );
  Object.assign(
    ctx.services.uiPreferences,
    pickCtxFunctions(ctx, ['getUiPreferences', 'saveUiPreferences']),
  );
  Object.assign(
    ctx.services.http,
    pickCtxFunctions(ctx, ['monthLabel', 'resolveRequestPath', 'handleApi', 'server']),
  );
  Object.assign(
    ctx.services.marketData,
    pickCtxFunctions(ctx, ['handleAlphaVantageKeyRoutes']),
  );
  Object.assign(
    ctx.repositories.instruments,
    pickCtxFunctions(ctx, [
      'findInstrumentBySymbol', 'findInstrumentBySymbolOrYahoo', 'listActiveInstruments',
      'listActiveInstrumentGroups', 'listIdentifiers', 'findIdentifierByLookup',
      'upsertIdentifier', 'getIdentifierByLookup', 'deleteIdentifierById',
      'resolveInstrumentByIdentifier', 'groupExists', 'updateInstrumentBySymbol',
      'countTransactionsBySymbol', 'countAutoPlansBySymbol', 'countIdentifiersBySymbol',
      'deactivateInstrumentBySymbol', 'deleteIdentifiersBySymbol', 'deleteInstrumentBySymbol',
      'insertInstrument', 'findGroupById', 'updateGroupById', 'countActiveInstrumentsByGroup',
      'clearGroupForInstruments', 'deleteGroupById', 'countStockInstruments', 'countActiveInstruments',
      'getInstrument', 'getInstrumentByInput', 'listInstruments', 'listInstrumentGroups',
      'listInstrumentIdentifiers', 'resolveInstrumentFromIdentifiers',
      'updateInstrumentColor', 'updateGroupColor', 'updateTransactionColorBySymbol', 'getOldestTransactionDateForSymbols',
    ]),
  );
  Object.assign(
    ctx.repositories.transactions,
    pickCtxFunctions(ctx, ['getTransactions', 'getAutoPlans', 'getPositionShares', 'isAutoPlanSkipped']),
  );
  Object.assign(
    ctx.repositories.history,
    pickCtxFunctions(ctx, ['getHistoryBuild', 'getOldestHistoryInvalidation', 'queryHistorySeries', 'queryHistoryEvents', 'replaceMaterializedHistory', 'replaceMarketPrices', 'replaceFxRates']),
  );
  Object.assign(
    ctx.repositories.marketData,
    pickCtxFunctions(ctx, ['getCachedPriceQuote', 'getLatestCachedPriceQuote', 'getLatestDailyPrice', 'getLatestMaterializedPrice', 'upsertPriceQuote', 'hasDailyPriceRange', 'getDailyPricesInRange', 'replaceDailyPricesRange', 'dailyCacheHasRange', 'getCachedDailyPrices', 'getDailyPrices', 'parseDailyPrices', 'getQuoteForSymbol', 'getQuoteForYahooSymbol', 'listPriceSourcesForInstrument', 'replacePriceSourcesForInstrument', 'upsertMarketPricePoint', 'getLatestMarketPricePoint', 'listManualPricePoints', 'listMarketPricePointsInRange', 'upsertProviderState', 'listProviderStates']),
  );
  Object.assign(
    ctx.repositories.meta,
    pickCtxFunctions(ctx, ['getMetaNumber', 'bumpMetaVersion', 'getDataVersions', 'recordHistoryInvalidation']),
  );
}

module.exports = { bindGroupedCtxNamespaces };
