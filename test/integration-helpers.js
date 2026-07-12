const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ExcelJS = require('exceljs');
const { seedLoadtestDb } = require('../scripts/loadtest-data');
const appInfo = require('../package.json');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-'));
process.env.PORTFOLIO_DB_PATH = path.join(tempDir, 'portfolio.sqlite');
process.env.PORT = '0';

const nativeFetch = global.fetch;
const mockPrices = {
  'SPPW.DE': { price: 44.58, currency: 'EUR' },
  'ICGA.DE': { price: 5.11, currency: 'EUR' },
  URA: { price: 52.5, currency: 'USD' },
  META: { price: 618.43, currency: 'USD' },
  'NOV.DE': { price: 39.675, currency: 'EUR' },
  'USDEUR=X': { price: 0.8566, currency: 'EUR' },
};
const mockDatedPrices = new Map();
const mockDividendEvents = new Map();
const mockSplitEvents = new Map();

global.fetch = async (url) => {
  const parsed = new URL(String(url));
  const yahooSymbol = decodeURIComponent(parsed.pathname.split('/').pop());
  const period1 = Number(parsed.searchParams.get('period1'));
  const period2 = Number(parsed.searchParams.get('period2'));
  const requestedDate =
    Number.isFinite(period1) && period1 > 0 ? new Date(period1 * 1000).toISOString().slice(0, 10) : null;
  const item = (requestedDate && mockDatedPrices.get(`${yahooSymbol}:${requestedDate}`)) ||
    mockPrices[yahooSymbol] || { price: 10, currency: 'EUR' };
  const marketTime = Number.isFinite(period1) && period1 > 0 ? period1 + 43200 : 1778796000;
  const timestamps = [];
  const closes = [];

  if (Number.isFinite(period1) && Number.isFinite(period2) && period2 > period1 + 86400) {
    for (let timestamp = period1 + 43200; timestamp < period2; timestamp += 86400) {
      const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
      const dailyItem = mockDatedPrices.get(`${yahooSymbol}:${date}`) || item;
      timestamps.push(timestamp);
      closes.push(dailyItem.price);
    }
  } else {
    timestamps.push(marketTime);
    closes.push(item.price);
  }

  return {
    ok: true,
    async json() {
      const events = {};
      const dividends = mockDividendEvents.get(yahooSymbol) || [];
      const splits = mockSplitEvents.get(yahooSymbol) || [];
      if (dividends.length) {
        events.dividends = Object.fromEntries(
          dividends.map((event) => {
            const timestamp = Date.parse(`${event.exDate}T00:00:00Z`) / 1000;
            return [String(timestamp), { amount: event.amount, date: timestamp }];
          }),
        );
      }
      if (splits.length) {
        events.splits = Object.fromEntries(
          splits.map((event) => {
            const timestamp = Date.parse(`${event.date}T00:00:00Z`) / 1000;
            return [
              String(timestamp),
              { date: timestamp, numerator: event.numerator || 1, denominator: event.denominator || 1 },
            ];
          }),
        );
      }
      return {
        chart: {
          result: [
            {
              meta: {
                currency: item.currency,
                regularMarketPrice: item.price,
                previousClose: item.price,
                regularMarketTime: marketTime,
              },
              timestamp: timestamps,
              indicators: {
                quote: [{ close: closes }],
              },
              events,
            },
          ],
        },
      };
    },
  };
};

const {
  db,
  server,
  createTransaction,
  deleteTransaction,
  buildPortfolioPerformance,
  buildMonthly,
  buildPortfolioHistory,
  getPositionShares,
  getTransactions,
  scanCorporateActions,
  listCorporateActions,
  getQuoteForSymbol,
  previewImport,
  commitImport,
  rollbackImportBatch,
} = require('../apps/server/server.js');

function cachePrice(yahooSymbol, requestedDate, price, currency = 'EUR', marketDate = requestedDate) {
  db.prepare(
    `INSERT OR REPLACE INTO price_cache
      (yahoo_symbol, requested_date, market_date, price, currency, source)
     VALUES (?, ?, ?, ?, ?, 'test')`,
  ).run(yahooSymbol, requestedDate, marketDate, price, currency);
}

function seedTestInstrument({
  symbol,
  yahooSymbol,
  name = symbol,
  type = 'stock',
  currency = 'EUR',
  color = '#0d9488',
}) {
  db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1)`,
  ).run(symbol, yahooSymbol, name, type, currency, color);
}

function plainCellValue(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && Array.isArray(value.richText))
    return value.richText.map((part) => part.text || '').join('');
  if (typeof value === 'object' && value.text) return String(value.text);
  if (typeof value === 'object' && value.result !== undefined) return value.result;
  return value;
}

async function createWorkbookBase64(sheetsByName) {
  const workbook = new ExcelJS.Workbook();
  for (const [sheetName, rows] of Object.entries(sheetsByName)) {
    const worksheet = workbook.addWorksheet(sheetName);
    for (const row of rows) worksheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

async function readWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function worksheetRows(worksheet, columnCount = worksheet.actualColumnCount || 0) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    const width = Math.max(columnCount, row.actualCellCount || 0);
    for (let columnIndex = 1; columnIndex <= width; columnIndex += 1) {
      values.push(plainCellValue(row.getCell(columnIndex)));
    }
    rows.push(values);
  });
  return rows;
}

function bumpTestMeta(key) {
  const current = Number(db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value || 0);
  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
  ).run(key, String(current + 1));
}

let baseUrl;

async function startTestServer() {
  baseUrl = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

async function stopTestServer() {
  await new Promise((resolve) => server.close(resolve));
}

function request(pathname, options = {}) {
  return nativeFetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      connection: 'close',
      ...(options.headers || {}),
    },
  });
}

async function jsonRequest(pathname, options = {}) {
  const response = await request(pathname, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function registerLifecycle(testRunner = test) {
  testRunner.before(async () => {
    await startTestServer();
  });

  testRunner.after(async () => {
    if (server.listening) await stopTestServer();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
}

module.exports = {
  assert,
  appInfo,
  seedLoadtestDb,
  db,
  server,
  createTransaction,
  deleteTransaction,
  buildPortfolioPerformance,
  buildMonthly,
  buildPortfolioHistory,
  getPositionShares,
  getTransactions,
  scanCorporateActions,
  listCorporateActions,
  getQuoteForSymbol,
  previewImport,
  commitImport,
  rollbackImportBatch,
  cachePrice,
  mockDividendEvents,
  mockSplitEvents,
  seedTestInstrument,
  createWorkbookBase64,
  readWorkbook,
  worksheetRows,
  bumpTestMeta,
  startTestServer,
  stopTestServer,
  request,
  jsonRequest,
  registerLifecycle,
};
