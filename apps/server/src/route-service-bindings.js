/**
 * @template T
 * @param {Record<string, unknown>} service
 * @param {string} fnName
 * @param {T} fallback
 * @returns {T}
 */
function pickServiceFn(service, fnName, fallback) {
  const candidate = service?.[fnName];
  return typeof candidate === 'function' ? candidate : fallback;
}

/**
 * Resuelve todos los handlers HTTP desde ctx.services.* con fallback a ctx plano.
 * @param {Record<string, unknown>} ctx
 * @returns {import('./types').RouteHandlers}
 */
function resolveRouteHandlers(ctx) {
  const sharedServices = ctx.services?.shared || {};
  const instrumentServices = ctx.services?.instruments || {};
  const onboardingServices = ctx.services?.onboarding || {};
  const transactionServices = ctx.services?.transactions || {};
  const importServices = ctx.services?.dataIngestion || {};
  const suggestionServices = ctx.services?.suggestions || {};
  const portfolioServices = ctx.services?.portfolio || {};
  const historyServices = ctx.services?.history || {};
  const diagnosticsServices = ctx.services?.diagnostics || {};
  const marketDataServices = ctx.services?.marketData || {};
  const adminServices = ctx.services?.admin || {};

  return {
    sendJson: pickServiceFn(sharedServices, 'sendJson', ctx.sendJson),
    readJsonBody: pickServiceFn(sharedServices, 'readJsonBody', ctx.readJsonBody),
    sendText: pickServiceFn(sharedServices, 'sendText', ctx.sendText),
    getQuoteForSymbol: pickServiceFn(marketDataServices, 'getQuoteForSymbol', ctx.getQuoteForSymbol),
listMarketDataSources: pickServiceFn(marketDataServices, 'listMarketDataSources', ctx.listMarketDataSources),
    buildHealth: pickServiceFn(diagnosticsServices, 'buildHealth', ctx.buildHealth),
    listInstruments: pickServiceFn(instrumentServices, 'listInstruments', ctx.listInstruments),
    listInstrumentIdentifiers: pickServiceFn(
      instrumentServices,
      'listInstrumentIdentifiers',
      ctx.listInstrumentIdentifiers,
    ),
    upsertInstrumentIdentifier: pickServiceFn(
      instrumentServices,
      'upsertInstrumentIdentifier',
      ctx.upsertInstrumentIdentifier,
    ),
    deleteInstrumentIdentifier: pickServiceFn(
      instrumentServices,
      'deleteInstrumentIdentifier',
      ctx.deleteInstrumentIdentifier,
    ),
    createInstrument: pickServiceFn(instrumentServices, 'createInstrument', ctx.createInstrument),
    previewInstrumentDelete: pickServiceFn(
      instrumentServices,
      'previewInstrumentDelete',
      ctx.previewInstrumentDelete,
    ),
    deleteInstruments: pickServiceFn(instrumentServices, 'deleteInstruments', ctx.deleteInstruments),
    updateInstrument: pickServiceFn(instrumentServices, 'updateInstrument', ctx.updateInstrument),
    deleteInstrument: pickServiceFn(instrumentServices, 'deleteInstrument', ctx.deleteInstrument),
    listInstrumentGroups: pickServiceFn(instrumentServices, 'listInstrumentGroups', ctx.listInstrumentGroups),
    createInstrumentGroup: pickServiceFn(instrumentServices, 'createInstrumentGroup', ctx.createInstrumentGroup),
    deleteInstrumentGroups: pickServiceFn(instrumentServices, 'deleteInstrumentGroups', ctx.deleteInstrumentGroups),
    updateInstrumentGroup: pickServiceFn(instrumentServices, 'updateInstrumentGroup', ctx.updateInstrumentGroup),
    deleteInstrumentGroup: pickServiceFn(instrumentServices, 'deleteInstrumentGroup', ctx.deleteInstrumentGroup),
    setInstrumentGroupsEnabled: pickServiceFn(instrumentServices, 'setInstrumentGroupsEnabled', ctx.setInstrumentGroupsEnabled),
    buildOnboardingStatus: pickServiceFn(onboardingServices, 'buildOnboardingStatus', ctx.buildOnboardingStatus),
    previewOnboardingWizard: pickServiceFn(
      onboardingServices,
      'previewOnboardingWizard',
      ctx.previewOnboardingWizard,
    ),
    commitOnboardingWizard: pickServiceFn(onboardingServices, 'commitOnboardingWizard', ctx.commitOnboardingWizard),
    getTransactions: pickServiceFn(transactionServices, 'getTransactions', ctx.getTransactions),
    createTransaction: pickServiceFn(transactionServices, 'createTransaction', ctx.createTransaction),
    previewTransaction: pickServiceFn(transactionServices, 'previewTransaction', ctx.previewTransaction),
    deleteTransaction: pickServiceFn(transactionServices, 'deleteTransaction', ctx.deleteTransaction),
    bulkDeleteTransactions: pickServiceFn(transactionServices, 'bulkDeleteTransactions', ctx.bulkDeleteTransactions),
    getAutoPlans: pickServiceFn(transactionServices, 'getAutoPlans', ctx.getAutoPlans),
    previewAutoPlanExecutions: pickServiceFn(
      transactionServices,
      'previewAutoPlanExecutions',
      ctx.previewAutoPlanExecutions,
    ),
    replaceAutoPlans: pickServiceFn(transactionServices, 'replaceAutoPlans', ctx.replaceAutoPlans),
    previewImport: pickServiceFn(importServices, 'previewImport', ctx.previewImport),
    searchTickerSuggestions: pickServiceFn(
      suggestionServices,
      'searchTickerSuggestions',
      ctx.searchTickerSuggestions,
    ),
    commitImport: pickServiceFn(importServices, 'commitImport', ctx.commitImport),
    listImportBatches: pickServiceFn(importServices, 'listImportBatches', ctx.listImportBatches),
    getImportBatch: pickServiceFn(importServices, 'getImportBatch', ctx.getImportBatch),
    getImportRows: pickServiceFn(importServices, 'getImportRows', ctx.getImportRows),
    rollbackImportBatch: pickServiceFn(importServices, 'rollbackImportBatch', ctx.rollbackImportBatch),
    listImportRollbackLog: pickServiceFn(importServices, 'listImportRollbackLog', ctx.listImportRollbackLog),
    getImportTemplate: pickServiceFn(importServices, 'getImportTemplate', ctx.getImportTemplate),
    buildSummary: pickServiceFn(portfolioServices, 'buildSummary', ctx.buildSummary),
    buildPortfolioPerformance: pickServiceFn(
      portfolioServices,
      'buildPortfolioPerformance',
      ctx.buildPortfolioPerformance,
    ),
    buildMonthly: pickServiceFn(portfolioServices, 'buildMonthly', ctx.buildMonthly),
    buildPortfolioHistory: pickServiceFn(historyServices, 'buildPortfolioHistory', ctx.buildPortfolioHistory),
    buildPerformanceDiagnostics: pickServiceFn(
      diagnosticsServices,
      'buildPerformanceDiagnostics',
      ctx.buildPerformanceDiagnostics,
    ),
    buildTransactionsXlsx: pickServiceFn(diagnosticsServices, 'buildTransactionsXlsx', ctx.buildTransactionsXlsx),
    listBackups: pickServiceFn(adminServices, 'listBackups', ctx.listBackups),
    createBackup: pickServiceFn(adminServices, 'createBackup', ctx.createBackup),
    resolveBackupPath: pickServiceFn(adminServices, 'resolveBackupPath', ctx.resolveBackupPath),
    createRiskBackup: pickServiceFn(adminServices, 'createRiskBackup', ctx.createRiskBackup),
    deleteBackupFile: pickServiceFn(adminServices, 'deleteBackupFile', ctx.deleteBackupFile),
  };
}

module.exports = {
  resolveRouteHandlers,
};
