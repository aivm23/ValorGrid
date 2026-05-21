const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createConfig } = require('./config');
const { openDatabase } = require('./db');
const { createBackup, listBackups, resolveBackupPath } = require('./backups');

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

const ctx = {
  http, fs, fsSync, path, createBackup, listBackups, resolveBackupPath,
  appInfo, root, dbPath, host, port, db, memoryCache, memoryCacheTtlMs,
  stockColors, currentYear, minimumDisplayValueEur,
  metaKeys, historyBuildKey, historyRanges, defaultInstruments, defaultAutoPlans, contentTypes,
};

[
  './migrations',
  './schema',
  './utils',
  './instrument-service',
  './market-data',
  './transaction-service',
  './import-service',
  './onboarding-service',
  './portfolio-service',
  './history-core',
  './history-service',
  './diagnostics-service',
  './routes',
  './http',
].forEach((modulePath) => require(modulePath)(ctx));

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
