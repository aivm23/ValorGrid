const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const XLSX = require('../vendor/xlsx.full.min.js');
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

global.fetch = async (url) => {
  const parsed = new URL(String(url));
  const yahooSymbol = decodeURIComponent(parsed.pathname.split('/').pop());
  const period1 = Number(parsed.searchParams.get('period1'));
  const period2 = Number(parsed.searchParams.get('period2'));
  const requestedDate =
    Number.isFinite(period1) && period1 > 0 ? new Date(period1 * 1000).toISOString().slice(0, 10) : null;
  const item =
    (requestedDate && mockDatedPrices.get(`${yahooSymbol}:${requestedDate}`)) ||
    mockPrices[yahooSymbol] ||
    { price: 10, currency: 'EUR' };
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
  buildMonthly,
  buildPortfolioHistory,
  getPositionShares,
  getTransactions,
  getQuoteForSymbol,
  previewImport,
  commitImport,
  rollbackImportBatch,
} = require('../server.js');

function cachePrice(yahooSymbol, requestedDate, price, currency = 'EUR', marketDate = requestedDate) {
  db.prepare(
    `INSERT OR REPLACE INTO price_cache
      (yahoo_symbol, requested_date, market_date, price, currency, source)
     VALUES (?, ?, ?, ?, ?, 'test')`,
  ).run(yahooSymbol, requestedDate, marketDate, price, currency);
}

function seedTestInstrument({ symbol, yahooSymbol, name = symbol, type = 'stock', currency = 'EUR', color = '#0d9488' }) {
  db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1)`,
  ).run(symbol, yahooSymbol, name, type, currency, color);
}

function dateRange(fromDate, toDate) {
  const dates = [];
  for (let date = new Date(`${fromDate}T00:00:00.000Z`); date <= new Date(`${toDate}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function createWorkbookBase64(sheetsByName) {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheetsByName)) {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer).toString('base64');
}

function bumpTestMeta(key) {
  const current = Number(db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value || 0);
  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
  ).run(key, String(current + 1));
}

function seedSyntheticHistory({ symbols = 12, from = '2021-06-01', to = '2026-05-16' } = {}) {
  const instrumentInsert = db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active)
     VALUES (?, ?, ?, 'stock', 'EUR', ?, 0, 10, 1)`,
  );
  const dailyInsert = db.prepare(
    `INSERT OR REPLACE INTO daily_price_cache
      (yahoo_symbol, date, price, currency, source)
     VALUES (?, ?, ?, 'EUR', 'synthetic')`,
  );
  const rangeInsert = db.prepare(
    `INSERT OR REPLACE INTO daily_price_cache_ranges (yahoo_symbol, from_date, to_date)
     VALUES (?, ?, ?)`,
  );
  const transactionInsert = db.prepare(
    `INSERT OR REPLACE INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin, auto_key)
     VALUES (?, 'add', ?, ?, ?, ?, ?, ?, ?, 'EUR', 1, ?, 'manual', NULL)`,
  );
  const colors = ['#a855f7', '#dc2626', '#16a34a', '#f59e0b', '#0d9488', '#ea580c'];
  const dates = dateRange(from, to);

  db.exec('BEGIN');
  try {
    for (let index = 0; index < symbols; index += 1) {
      const symbol = `SIM${String(index).padStart(2, '0')}`;
      const yahooSymbol = `${symbol}.DE`;
      const color = colors[index % colors.length];
      instrumentInsert.run(symbol, yahooSymbol, `Synthetic ${index}`, color);
      rangeInsert.run(yahooSymbol, from, to);

      for (const date of dates) {
        const days = Math.floor((new Date(`${date}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)) / 86400000);
        const price = 8 + index * 0.7 + Math.sin(days / 21 + index) * 1.4 + days * 0.004;
        dailyInsert.run(yahooSymbol, date, Number(price.toFixed(4)));
      }
    }

    for (let monthOffset = 0; monthOffset < 60; monthOffset += 1) {
      const date = new Date(Date.UTC(2021, 5 + monthOffset, 12));
      const operationDate = date.toISOString().slice(0, 10);
      for (let slot = 0; slot < 3; slot += 1) {
        const symbol = `SIM${String((monthOffset + slot) % symbols).padStart(2, '0')}`;
        const price = 10 + ((monthOffset + slot) % symbols);
        const shares = Number((100 / price).toFixed(6));
        transactionInsert.run(
          `synthetic-${monthOffset}-${slot}`,
          symbol,
          `Synthetic ${symbol}`,
          operationDate,
          operationDate,
          shares,
          100,
          price,
          colors[(monthOffset + slot) % colors.length],
        );
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  bumpTestMeta('ledger_version');
  bumpTestMeta('price_version');
  db.exec('DELETE FROM history_builds; DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM portfolio_events; DELETE FROM history_invalidations;');
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
  buildMonthly,
  buildPortfolioHistory,
  getPositionShares,
  getTransactions,
  getQuoteForSymbol,
  previewImport,
  commitImport,
  rollbackImportBatch,
  cachePrice,
  seedTestInstrument,
  dateRange,
  createWorkbookBase64,
  bumpTestMeta,
  seedSyntheticHistory,
  startTestServer,
  stopTestServer,
  request,
  jsonRequest,
  registerLifecycle,
};
