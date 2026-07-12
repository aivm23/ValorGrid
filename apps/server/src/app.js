const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createConfig } = require('./platform/config');
const { openDatabase } = require('./platform/db');
const backups = require('./platform/backups');
const { bindGroupedCtxNamespaces } = require('./bind-ctx-namespaces');
const runtimeSecrets = require('./platform/runtime-secrets');
const { createExtensionHost } = require('./platform/extensions');

const { appInfo, root, extensionPath, dbPath, backupDir, secretsDir, host, port, auth } = createConfig();
const alphaVantageEnvKey = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY || '';
const savedAlphaVantageKey = alphaVantageEnvKey ? '' : runtimeSecrets.readAlphaVantageKey(secretsDir);
if (savedAlphaVantageKey) {
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = savedAlphaVantageKey;
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = 'local';
} else if (alphaVantageEnvKey) {
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = 'env';
}
const staticRoot = path.resolve(root, 'apps', 'web'),
  db = openDatabase(dbPath);
const memoryCache = new Map();
const memoryCacheTtlMs = 5 * 60 * 1000;

const stockColors = ['#0d9488', '#9333ea', '#ea580c', '#0891b2', '#be123c'];
const currentYear = new Date().getFullYear();
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
  repoRoot: root,
  extensionPath,
  staticRoot,
  dbPath,
  backupDir,
  secretsDir,
  auth,
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
  marketData: {
    alphaVantageApiKey: process.env.VALORGRID_ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY || '',
  },
  runtime: {
    mode: process.env.VALORGRID_RUNTIME_MODE || 'server',
    userDataDir: process.env.VALORGRID_DESKTOP_USER_DATA_DIR || '',
  },
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

const extensions = createExtensionHost({ config, logger });

const repositories = {
  meta: {},
  suggestions: {},
  portfolio: {},
  diagnostics: {},
  instruments: {},
  transactions: {},
  dividends: {},
  corporateActions: {},
  liquidity: {},
  dataIngestion: {},
  history: {},
  marketData: {},
  onboarding: {},
};

const services = {
  admin: {},
  shared: {},
  meta: {},
  instruments: {},
  suggestions: {},
  marketData: {},
  transactions: {},
  dividends: {},
  corporateActions: {},
  liquidity: {},
  dataIngestion: {},
  onboarding: {},
  portfolio: {},
  history: {},
  diagnostics: {},
  uiPreferences: {},
  http: {},
};

const adminServices = {
  listBackups: () => backups.listBackups(root, backupDir),
  createBackup: () => backups.createBackup({ db, dbPath, root, backupDir }),
  resolveBackupPath: (file) => backups.resolveBackupPath(root, file, backupDir),
  createRiskBackup: ({ reason, metadata }) =>
    backups.createRiskBackup({ db, dbPath, root, backupDir, reason, metadata }),
  deleteBackupFile: (file) => backups.deleteBackupFile(root, file, backupDir),
};

const uiPreferencesServices = {};
Object.assign(services.admin, adminServices);
Object.assign(services.uiPreferences, uiPreferencesServices);
const ctx = {
  http,
  fs,
  fsSync,
  path,
  appInfo,
  staticRoot,
  dbPath,
  backupDir,
  secretsDir,
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
  extensions,
};

Object.assign(ctx, {
  readAlphaVantageKey: runtimeSecrets.readAlphaVantageKey,
  saveAlphaVantageKey: runtimeSecrets.saveAlphaVantageKey,
  deleteAlphaVantageKey: runtimeSecrets.deleteAlphaVantageKey,
});

const modules = [
  './schema',
  './platform/db-migrations',
  './schema-seed',
  './domains/meta/meta-repository',
  './domains/meta/meta-state',
  './domains/meta/ui-preferences-service',
  './platform/i18n',
  './platform/utils',
  './domains/instruments/instrument-repository',
  './domains/portfolio/portfolio-repository',
  './domains/ticker-suggestions/ticker-suggestions-repository',
  './domains/instruments/instrument-service',
  './domains/ticker-suggestions/ticker-suggestions',
  './domains/market-data/market-data-repository',
  './domains/market-data/market-data',
  './domains/market-data/route-market-data-alpha-vantage',
  './domains/corporate-actions/corporate-action-repository',
  './domains/transactions/transaction-repository',
  './domains/corporate-actions/corporate-action-service',
  './domains/transactions/transaction-service',
  './domains/transactions/auto-plan-date-service',
  './domains/dividends/dividend-repository',
  './domains/dividends/dividend-service',
  './domains/liquidity/liquidity-repository',
  './domains/liquidity/liquidity-service',
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
  './domains/admin/update-service',
  './platform/extensions-runtime',
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

ctx.runMigrations();
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
  scanCorporateActions: ctx.scanCorporateActions,
  listCorporateActions: ctx.listCorporateActions,
  getQuoteForSymbol: ctx.getQuoteForSymbol,
  listInstruments: ctx.listInstruments,
  updateInstrument: ctx.updateInstrument,
  previewImport: ctx.previewImport,
  commitImport: ctx.commitImport,
  listImportBatches: ctx.listImportBatches,
  rollbackImportBatch: ctx.rollbackImportBatch,
};
