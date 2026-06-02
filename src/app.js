const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createConfig } = require('./platform/config');
const { openDatabase } = require('./platform/db');
const { createBackup, listBackups, resolveBackupPath } = require('./platform/backups');

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
      'sendJson',
      'sendText',
      'readJsonBody',
      'normalizeSymbol',
      'getToday',
      'dateUtc',
      'formatDateUtc',
      'addDays',
      'addYears',
      'toUnixSeconds',
      'toEur',
      'transactionSign',
      'getMemoryCached',
      'setMemoryCached',
    ]),
  );

  Object.assign(
    ctx.services.meta,
    pickCtxFunctions(ctx, [
      'getMetaNumber',
      'bumpMetaVersion',
      'getDataVersions',
      'recordHistoryInvalidation',
      'invalidateLedger',
      'invalidatePrices',
    ]),
  );

  Object.assign(
    ctx.services.instruments,
    pickCtxFunctions(ctx, [
      'getInstrument',
      'getInstrumentByInput',
      'listInstruments',
      'listInstrumentGroups',
      'listInstrumentIdentifiers',
      'upsertInstrumentIdentifier',
      'deleteInstrumentIdentifier',
      'resolveInstrumentFromIdentifiers',
      'updateInstrument',
      'deleteInstrument',
      'deleteInstruments',
      'previewInstrumentDelete',
      'createInstrument',
      'ensureGeneralGroup',
      'createInstrumentGroup',
      'updateInstrumentGroup',
      'deleteInstrumentGroup',
      'deleteInstrumentGroups',
      'ensureInstrument',
    ]),
  );

  Object.assign(
    ctx.services.suggestions,
    pickCtxFunctions(ctx, ['suggestTickersForIdentity', 'searchTickerSuggestions']),
  );

  Object.assign(
    ctx.services.marketData,
    pickCtxFunctions(ctx, [
      'fetchYahooChart',
      'fetchLatestYahooPrice',
      'firstDailyCloseAtOrAfter',
      'fetchDatedYahooPrice',
      'dailyCacheHasRange',
      'getCachedDailyPrices',
      'parseDailyPrices',
      'getDailyPrices',
      'getQuoteForSymbol',
      'getQuoteForYahooSymbol',
      'getUsdToEur',
      'getFxToEur',
    ]),
  );

  Object.assign(
    ctx.services.transactions,
    pickCtxFunctions(ctx, [
      'getTransactions',
      'getAutoPlans',
      'buildLedgerAnalytics',
      'buildPortfolioPerformance',
      'replaceAutoPlans',
      'autoPlanFrequency',
      'normalizeAutoPlans',
      'autoPlanMateriallyChanged',
      'applyAutoPlanEditPolicy',
      'getAutoPlanScheduledDates',
      'autoKeyForPlan',
      'autoPlanExists',
      'previewAutoPlanExecutions',
      'getPositionShares',
      'getStockColorsUsed',
      'createTransaction',
      'previewTransaction',
      'deleteTransaction',
      'isAutoPlanSkipped',
    ]),
  );

  Object.assign(
    ctx.services.dataIngestion,
    pickCtxFunctions(ctx, [
      'previewImport',
      'commitImport',
      'listImportBatches',
      'getImportBatch',
      'getImportRows',
      'rollbackImportBatch',
      'listImportRollbackLog',
      'getImportTemplate',
    ]),
  );

  Object.assign(
    ctx.services.onboarding,
    pickCtxFunctions(ctx, ['previewOnboardingWizard', 'commitOnboardingWizard']),
  );

  Object.assign(
    ctx.services.portfolio,
    pickCtxFunctions(ctx, [
      'getMonthEndDate',
      'getScheduledDate',
      'executeDueAutoPlans',
      'getInstrumentValuation',
      'buildSummary',
      'dbInstrument',
      'withPercentages',
      'buildMonthly',
      'getInstrumentValuationAt',
      'buildOnboardingStatus',
      'isEffectiveValuation',
      'buildPortfolioPerformance',
    ]),
  );

  Object.assign(
    ctx.services.history,
    pickCtxFunctions(ctx, [
      'firstTransactionDate',
      'resolveHistoryWindow',
      'getHistoryInstruments',
      'getTransactionsUntil',
      'getHistoryEvents',
      'weekKey',
      'reduceDatesForGranularity',
      'pointDatesFromPriceRows',
      'getHistoryBuild',
      'getOldestHistoryInvalidation',
      'historyBuildIsFresh',
      'markHistoryBuild',
      'replaceMarketPrices',
      'replaceFxRates',
      'rebuildPortfolioEvents',
      'replaceMaterializedHistory',
      'rebuildDailyPortfolioHistory',
      'ensureHistoryBuilt',
      'queryHistorySeries',
      'queryHistoryEvents',
      'ensureRangeStartPoint',
      'enrichSeriesWithContributed',
      'buildPortfolioHistory',
    ]),
  );

  Object.assign(
    ctx.services.diagnostics,
    pickCtxFunctions(ctx, [
      'tableCount',
      'buildPerformanceDiagnostics',
      'getDatabaseStats',
      'buildHealth',
      'csvCell',
      'buildTransactionsCsv',
    ]),
  );

  Object.assign(
    ctx.services.http,
    pickCtxFunctions(ctx, ['monthLabel', 'resolveRequestPath', 'handleApi', 'server']),
  );

  Object.assign(
    ctx.repositories.instruments,
    pickCtxFunctions(ctx, [
      'findInstrumentBySymbol',
      'findInstrumentBySymbolOrYahoo',
      'listActiveInstruments',
      'listActiveInstrumentGroups',
      'listIdentifiers',
      'findIdentifierByLookup',
      'upsertIdentifier',
      'getIdentifierByLookup',
      'deleteIdentifierById',
      'resolveInstrumentByIdentifier',
      'groupExists',
      'updateInstrumentBySymbol',
      'countTransactionsBySymbol',
      'countAutoPlansBySymbol',
      'countIdentifiersBySymbol',
      'deactivateInstrumentBySymbol',
      'deleteIdentifiersBySymbol',
      'deleteInstrumentBySymbol',
      'insertInstrument',
      'findGroupById',
      'updateGroupById',
      'countActiveInstrumentsByGroup',
      'clearGroupForInstruments',
      'deleteGroupById',
      'countStockInstruments',
      'countActiveInstruments',
      'getInstrument',
      'getInstrumentByInput',
      'listInstruments',
      'listInstrumentGroups',
      'listInstrumentIdentifiers',
      'resolveInstrumentFromIdentifiers',
    ]),
  );

  Object.assign(
    ctx.repositories.transactions,
    pickCtxFunctions(ctx, ['getTransactions', 'getAutoPlans', 'getPositionShares', 'isAutoPlanSkipped']),
  );

  Object.assign(
    ctx.repositories.dataIngestion,
    pickCtxFunctions(ctx, ['listImportBatches', 'getImportBatch', 'getImportRows', 'listImportRollbackLog']),
  );

  Object.assign(
    ctx.repositories.history,
    pickCtxFunctions(ctx, [
      'getHistoryBuild',
      'getOldestHistoryInvalidation',
      'queryHistorySeries',
      'queryHistoryEvents',
      'replaceMaterializedHistory',
      'replaceMarketPrices',
      'replaceFxRates',
    ]),
  );

  Object.assign(
    ctx.repositories.marketData,
    pickCtxFunctions(ctx, [
      'getCachedPriceQuote',
      'upsertPriceQuote',
      'hasDailyPriceRange',
      'getDailyPricesInRange',
      'replaceDailyPricesRange',
      'dailyCacheHasRange',
      'getCachedDailyPrices',
      'getDailyPrices',
      'parseDailyPrices',
      'getQuoteForSymbol',
      'getQuoteForYahooSymbol',
    ]),
  );

  Object.assign(
    ctx.repositories.meta,
    pickCtxFunctions(ctx, ['getMetaNumber', 'bumpMetaVersion', 'getDataVersions', 'recordHistoryInvalidation']),
  );
}

const { appInfo, root, dbPath, host, port } = createConfig();
const db = openDatabase(dbPath);
const memoryCache = new Map();
const memoryCacheTtlMs = 5 * 60 * 1000;

const stockColors = ['#0d9488', '#9333ea', '#ea580c', '#0891b2', '#be123c'];
const currentYear = 2026;
const minimumDisplayValueEur = 0.01;
const metaKeys = {
  ledgerVersion: 'ledger_version',
  priceVersion: 'price_version',
};
const historyBuildKey = 'portfolio_daily';
const historyRanges = {
  ytd: { years: 0, granularity: 'daily' },
  '1y': { years: 1, granularity: 'daily' },
  '2y': { years: 2, granularity: 'weekly' },
  '5y': { years: 5, granularity: 'weekly' },
  all: { years: null, granularity: 'weekly' },
};

const defaultInstruments = [
  {
    symbol: 'USDEUR',
    yahooSymbol: 'USDEUR=X',
    name: 'USD/EUR',
    type: 'fx',
    currency: 'EUR',
    color: '#64748b',
    baseShares: 0,
    fallbackPrice: 0.92,
  },
];

const defaultAutoPlans = [];

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const config = {
  appInfo,
  root,
  dbPath,
  host,
  port,
  stockColors,
  currentYear,
  minimumDisplayValueEur,
  metaKeys,
  historyBuildKey,
  historyRanges,
  defaultInstruments,
  defaultAutoPlans,
  contentTypes,
};

const cache = {
  memory: memoryCache,
  ttlMs: memoryCacheTtlMs,
};

const logger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

const repositories = {
  meta: {},
  suggestions: {},
  portfolio: {},
  diagnostics: {},
  instruments: {},
  transactions: {},
  dataIngestion: {},
  history: {},
  marketData: {},
  onboarding: {},
};

const services = {
  shared: {},
  meta: {},
  instruments: {},
  suggestions: {},
  marketData: {},
  transactions: {},
  dataIngestion: {},
  onboarding: {},
  portfolio: {},
  history: {},
  diagnostics: {},
  http: {},
};

const ctx = {
  http,
  fs,
  fsSync,
  path,
  createBackup,
  listBackups,
  resolveBackupPath,
  appInfo,
  root,
  dbPath,
  host,
  port,
  db,
  memoryCache,
  memoryCacheTtlMs,
  stockColors,
  currentYear,
  minimumDisplayValueEur,
  metaKeys,
  historyBuildKey,
  historyRanges,
  defaultInstruments,
  defaultAutoPlans,
  contentTypes,
  config,
  cache,
  logger,
  repositories,
  services,
};

const modules = [
  './schema',
  './schema-seed',
  './domains/meta/meta-repository',
  './domains/meta/meta-state',
  './platform/utils',
  './domains/instruments/instrument-repository',
  './domains/portfolio/portfolio-repository',
  './domains/ticker-suggestions/ticker-suggestions-repository',
  './domains/instruments/instrument-service',
  './domains/ticker-suggestions/ticker-suggestions',
  './domains/market-data/market-data-repository',
  './domains/market-data/market-data',
  './domains/transactions/transaction-repository',
  './domains/transactions/transaction-service',
  './domains/data-ingestion/ingestion-repository',
  './domains/data-ingestion/ingestion-service',
  './domains/onboarding/onboarding-repository',
  './domains/onboarding/onboarding-service',
  './domains/portfolio/portfolio-service',
  './domains/history/history-repository',
  './domains/history/history-core',
  './domains/history/history-service',
  './domains/admin/diagnostics-repository',
  './domains/admin/diagnostics-service',
  './routes',
  './platform/http',
];

for (const modulePath of modules) {
  try {
    require(modulePath)(ctx);
  } catch (error) {
    error.message = `Error loading ${modulePath}: ${error.message}`;
    throw error;
  }
}

bindGroupedCtxNamespaces(ctx);

ctx.initDatabase();

module.exports = {
  db: ctx.db,
  server: ctx.server,
  port: ctx.port,
  host: ctx.host,
  createTransaction: ctx.createTransaction,
  previewTransaction: ctx.previewTransaction,
  deleteTransaction: ctx.deleteTransaction,
  getTransactions: ctx.getTransactions,
  buildPortfolioPerformance: ctx.buildPortfolioPerformance,
  buildSummary: ctx.buildSummary,
  buildMonthly: ctx.buildMonthly,
  buildPortfolioHistory: ctx.buildPortfolioHistory,
  getPositionShares: ctx.getPositionShares,
  getQuoteForSymbol: ctx.getQuoteForSymbol,
  listInstruments: ctx.listInstruments,
  updateInstrument: ctx.updateInstrument,
  previewImport: ctx.previewImport,
  commitImport: ctx.commitImport,
  listImportBatches: ctx.listImportBatches,
  rollbackImportBatch: ctx.rollbackImportBatch,
};
