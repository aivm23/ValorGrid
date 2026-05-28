const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const XLSX = require('../vendor/xlsx.full.min.js');
const { seedLoadtestDb } = require('../scripts/loadtest-data');
const appInfo = require('../version.json');
const packageInfo = require('../package.json');

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

function mockHistoricalEtfPrices() {
  const prices = {
    'SPPW.DE': {
      '2026-01-03': 40,
      '2026-02-03': 50,
      '2026-03-03': 25,
      '2026-04-03': 20,
      '2026-05-03': 10,
    },
    'ICGA.DE': {
      '2026-01-03': 5,
      '2026-02-03': 4,
      '2026-03-03': 10,
      '2026-04-03': 8,
      '2026-05-03': 6,
    },
  };

  for (const [symbol, byDate] of Object.entries(prices)) {
    for (const [date, price] of Object.entries(byDate)) {
      mockDatedPrices.set(`${symbol}:${date}`, { price, currency: 'EUR' });
    }
  }
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

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  if (server.listening) await stopTestServer();
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('adds a dated stock transaction by shares using cached market price', async () => {
  seedTestInstrument({ symbol: 'NVO', yahooSymbol: 'NOV.DE', name: 'Novo Nordisk', type: 'stock' });
  cachePrice('NOV.DE', '2026-05-14', 39.675);

  const transaction = await createTransaction({
    type: 'add',
    symbol: 'NVO',
    date: '2026-05-14',
    shares: 3,
  });

  assert.equal(transaction.symbol, 'NVO');
  assert.equal(transaction.marketDate, '2026-05-14');
  assert.equal(transaction.shares, 3);
  assert.equal(Number(transaction.valueEur.toFixed(3)), 119.025);
  assert.equal(getPositionShares('NVO', '2026-05-14'), 3);
});

test('transactions support optional commission and signed cash flow', async () => {
  cachePrice('META', '2026-05-14', 600, 'USD');
  cachePrice('USDEUR=X', '2026-05-14', 0.85);

  const buy = await createTransaction({
    type: 'add',
    symbol: 'META',
    date: '2026-05-14',
    shares: 1,
    commissionEur: 2.5,
  });
  const sale = await createTransaction({
    type: 'remove',
    symbol: 'META',
    date: '2026-05-14',
    shares: 1,
    commissionEur: 1.25,
  });

  assert.equal(Number(buy.valueEur.toFixed(2)), 510);
  assert.equal(Number(buy.commissionEur.toFixed(2)), 2.5);
  assert.equal(Number(buy.cashFlowEur.toFixed(2)), -512.5);
  assert.equal(Number(sale.valueEur.toFixed(2)), 510);
  assert.equal(Number(sale.commissionEur.toFixed(2)), 1.25);
  assert.equal(Number(sale.cashFlowEur.toFixed(2)), 508.75);
});

test('rejects transactions with euros and shares at the same time', async () => {
  seedTestInstrument({ symbol: 'NVO', yahooSymbol: 'NOV.DE', name: 'Novo Nordisk', type: 'stock' });
  cachePrice('NOV.DE', '2026-05-14', 39.675);
  const before = getTransactions().length;

  await assert.rejects(
    createTransaction({
      type: 'add',
      symbol: 'NVO',
      date: '2026-05-14',
      euros: 100,
      shares: 3,
    }),
    /euros or shares/,
  );

  assert.equal(getTransactions().length, before);
});

test('adds and removes ETF shares without affecting prior dated positions', async () => {
  seedTestInstrument({ symbol: 'SPPW', yahooSymbol: 'SPPW.DE', name: 'ETF MSCI World', type: 'etf', color: '#a855f7' });
  cachePrice('SPPW.DE', '2026-05-14', 50);

  const add = await createTransaction({
    type: 'add',
    symbol: 'SPPW',
    date: '2026-05-14',
    euros: 100,
  });
  const remove = await createTransaction({
    type: 'remove',
    symbol: 'SPPW',
    date: '2026-05-14',
    shares: 1,
  });

  assert.equal(add.shares, 2);
  assert.equal(remove.valueEur, 50);
  assert.equal(Number(getPositionShares('SPPW', '2026-05-13').toFixed(3)), 0);
  assert.equal(Number(getPositionShares('SPPW', '2026-05-14').toFixed(3)), 1);
});

test('prevents removing more shares than available on the operation date', async () => {
  seedTestInstrument({ symbol: 'NVO', yahooSymbol: 'NOV.DE', name: 'Novo Nordisk', type: 'stock' });
  cachePrice('NOV.DE', '2026-05-13', 40);

  await assert.rejects(
    createTransaction({
      type: 'remove',
      symbol: 'NVO',
      date: '2026-05-13',
      shares: 1,
    }),
    /Not enough shares/,
  );
});

test('returns quotes from SQLite cache for dated prices', async () => {
  seedTestInstrument({ symbol: 'ICGA', yahooSymbol: 'ICGA.DE', name: 'ETF MSCI China', type: 'etf', color: '#dc2626' });
  cachePrice('ICGA.DE', '2026-05-14', 5.12);

  const quote = await getQuoteForSymbol('ICGA', '2026-05-14');

  assert.equal(quote.symbol, 'ICGA');
  assert.equal(quote.yahooSymbol, 'ICGA.DE');
  assert.equal(quote.price, 5.12);
  assert.equal(quote.cached, true);
});

test('deletes transactions atomically', async () => {
  seedTestInstrument({ symbol: 'NVO', yahooSymbol: 'NOV.DE', name: 'Novo Nordisk', type: 'stock' });
  cachePrice('NOV.DE', '2026-05-15', 41);
  const transaction = await createTransaction({
    type: 'add',
    symbol: 'NVO',
    date: '2026-05-15',
    shares: 1,
  });

  assert.equal(deleteTransaction(transaction.id), true);
  assert.equal(getTransactions().some((item) => item.id === transaction.id), false);
  assert.equal(deleteTransaction(transaction.id), false);
});

test('GET /api/version returns the app version', async () => {
  const { response, body } = await jsonRequest('/api/version');

  assert.equal(response.status, 200);
  assert.match(body.version, /^\d+\.\d+\.\d+$/);
});

test('package and API versions stay synchronized with version.json', async () => {
  const { body } = await jsonRequest('/api/version');

  assert.equal(packageInfo.version, appInfo.version);
  assert.equal(body.version, appInfo.version);
});

test('GET /api/health returns local runtime and cache status', async () => {
  const { response, body } = await jsonRequest('/api/health');

  assert.equal(response.status, 200);
  assert.equal(body.version, appInfo.version);
  assert.equal(body.host, '127.0.0.1');
  assert.ok(body.dbPath.endsWith('portfolio.sqlite'));
  assert.ok(Number.isFinite(body.versions.ledgerVersion));
  assert.ok(Number.isFinite(body.counts.transactions));
  assert.ok(['ok', 'degraded'].includes(body.status));
});

test('backup API creates, lists, and downloads SQLite backups', async () => {
  const create = await jsonRequest('/api/backups', { method: 'POST' });
  assert.equal(create.response.status, 201);
  assert.match(create.body.backup.file, /^portfolio-.+\.sqlite$/);

  const list = await jsonRequest('/api/backups');
  assert.equal(list.response.status, 200);
  assert.ok(list.body.backups.some((backup) => backup.file === create.body.backup.file));

  const download = await request(`/api/backups/${encodeURIComponent(create.body.backup.file)}`);
  assert.equal(download.status, 200);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.ok(bytes.length > 1024);

  fs.rmSync(path.join(process.cwd(), '.backups', create.body.backup.file), { force: true });
});

test('GET /api/instruments returns configured instruments', async () => {
  const { response, body } = await jsonRequest('/api/instruments');

  assert.equal(response.status, 200);
  assert.ok(body.instruments.some((item) => item.symbol === 'SPPW'));
  assert.ok(body.instruments.some((item) => item.symbol === 'NVO'));
});

test('GET /api/onboarding/status returns setup state', async () => {
  const { response, body } = await jsonRequest('/api/onboarding/status');

  assert.equal(response.status, 200);
  assert.equal(typeof body.needsSetup, 'boolean');
  assert.equal(typeof body.hasGroups, 'boolean');
  assert.equal(typeof body.hasInstruments, 'boolean');
  assert.equal(typeof body.hasTransactions, 'boolean');
  assert.equal(typeof body.hasAutoPlans, 'boolean');
  assert.ok(Number.isFinite(body.visibleInstrumentCount));
  assert.ok(Number.isFinite(body.groupCount));
  assert.ok(Number.isFinite(body.transactionCount));
  assert.ok(Number.isFinite(body.autoPlanCount));
});

test('PUT /api/instruments/:symbol updates editable metadata and invalidates history', async () => {
  const beforeVersion = Number(db.prepare("SELECT value FROM app_meta WHERE key = 'price_version'").get().value);
  const { response, body } = await jsonRequest('/api/instruments/NVO', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      yahooSymbol: 'NOV.DE',
      name: 'Novo Nordisk Test',
      type: 'stock',
      currency: 'EUR',
      color: '#0d9488',
      fallbackPrice: 39.67,
      active: true,
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.instrument.name, 'Novo Nordisk Test');
  const afterVersion = Number(db.prepare("SELECT value FROM app_meta WHERE key = 'price_version'").get().value);
  assert.ok(afterVersion > beforeVersion);
});

test('DELETE /api/instruments blocks instruments with positive position', async () => {
  db.prepare(
    `INSERT OR IGNORE INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order)
     VALUES ('TESTPOS', 'TESTPOS', 'Test Position', 'stock', 'EUR', '#a855f7', 0, 0, 1, (SELECT id FROM instrument_groups LIMIT 1), 0)`,
  ).run();
  db.prepare(
    `INSERT INTO transactions (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin)
     VALUES ('test-pos-buy', 'add', 'TESTPOS', 'Test Position', '2026-01-15', '2026-01-15', 10, 500, 50, 'EUR', 1, '#a855f7', 'manual')`,
  ).run();

  const { response, body } = await jsonRequest('/api/instruments', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: ['TESTPOS'] }),
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /acciones en cartera/);

  db.prepare("DELETE FROM transactions WHERE symbol = 'TESTPOS'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'TESTPOS'").run();
});

test('POST /api/instruments/preview-delete returns position status', async () => {
  db.prepare(
    `INSERT OR IGNORE INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order)
     VALUES ('TESTPREV', 'TESTPREV', 'Test Preview', 'stock', 'EUR', '#16a34a', 0, 0, 1, (SELECT id FROM instrument_groups LIMIT 1), 0)`,
  ).run();
  db.prepare(
    `INSERT INTO transactions (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin)
     VALUES ('test-prev-buy', 'add', 'TESTPREV', 'Test Preview', '2026-02-01', '2026-02-01', 5, 250, 50, 'EUR', 1, '#16a34a', 'manual')`,
  ).run();

  const { response, body } = await jsonRequest('/api/instruments/preview-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: ['TESTPREV'] }),
  });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.results));
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].symbol, 'TESTPREV');
  assert.equal(body.results[0].blocked, true);
  assert.equal(body.results[0].status, 'has_position');
  assert.ok(body.results[0].dependencies.currentShares > 0);

  db.prepare("DELETE FROM transactions WHERE symbol = 'TESTPREV'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'TESTPREV'").run();
});

test('DELETE /api/instruments allows deletion when position is zero', async () => {
  db.prepare(
    `INSERT OR IGNORE INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order)
     VALUES ('TESTZERO', 'TESTZERO', 'Test Zero', 'stock', 'EUR', '#f59e0b', 0, 0, 1, (SELECT id FROM instrument_groups LIMIT 1), 0)`,
  ).run();
  db.prepare(
    `INSERT INTO transactions (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin)
     VALUES ('test-zero-buy', 'add', 'TESTZERO', 'Test Zero', '2026-03-01', '2026-03-01', 3, 150, 50, 'EUR', 1, '#f59e0b', 'manual'),
            ('test-zero-sell', 'remove', 'TESTZERO', 'Test Zero', '2026-03-15', '2026-03-15', 3, 180, 60, 'EUR', 1, '#f59e0b', 'manual')`,
  ).run();

  const { response, body } = await jsonRequest('/api/instruments', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: ['TESTZERO'] }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.results[0].status, 'deactivated');

  db.prepare("DELETE FROM transactions WHERE symbol = 'TESTZERO'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'TESTZERO'").run();
});

test('DELETE /api/instruments blocks instruments with active auto-plan', async () => {
  db.prepare(
    `INSERT OR IGNORE INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order)
     VALUES ('TESTAUTO', 'TESTAUTO', 'Test Auto Plan', 'stock', 'EUR', '#ef4444', 0, 0, 1, (SELECT id FROM instrument_groups LIMIT 1), 0)`,
  ).run();
  db.prepare(
    `INSERT INTO auto_plans (symbol, amount_eur, day, enabled, start_date, frequency, weekday)
     VALUES ('TESTAUTO', 50, 1, 1, '2026-06-01', 'monthly', NULL)`,
  ).run();

  const preview = await jsonRequest('/api/instruments/preview-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: ['TESTAUTO'] }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.results[0].blocked, true);
  assert.equal(preview.body.results[0].status, 'has_auto_plan');

  const { response, body } = await jsonRequest('/api/instruments', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: ['TESTAUTO'] }),
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /automatizaci.n activa/);

  db.prepare("DELETE FROM auto_plans WHERE symbol = 'TESTAUTO'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'TESTAUTO'").run();
});

test('GET /api/transactions returns stored transactions', async () => {
  const { response, body } = await jsonRequest('/api/transactions');

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.transactions));
});

test('export endpoints return ledger JSON and CSV', async () => {
  const json = await jsonRequest('/api/export/transactions.json');
  assert.equal(json.response.status, 200);
  assert.ok(Array.isArray(json.body.transactions));

  const csv = await request('/api/export/transactions.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /^id;date;marketDate;symbol;/);
});

test('POST /api/transactions creates and DELETE /api/transactions/:id removes', async () => {
  cachePrice('NOV.DE', '2026-05-14', 39.675);
  const id = 'client-test-transaction';
  const create = await jsonRequest('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, type: 'add', symbol: 'NVO', date: '2026-05-14', shares: 1 }),
  });

  assert.equal(create.response.status, 201);
  assert.equal(create.body.transaction.id, id);
  assert.equal(create.body.transaction.symbol, 'NVO');

  const remove = await jsonRequest(`/api/transactions/${encodeURIComponent(create.body.transaction.id)}`, {
    method: 'DELETE',
  });

  assert.equal(remove.response.status, 200);
  assert.equal(remove.body.ok, true);
});

test('POST /api/transactions rejects ambiguous amount input', async () => {
  cachePrice('NOV.DE', '2026-05-14', 39.675);
  const { response, body } = await jsonRequest('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'add', symbol: 'NVO', date: '2026-05-14', euros: 100, shares: 1 }),
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /euros or shares/);
});

test('POST /api/transactions stores optional commission fields', async () => {
  cachePrice('NOV.DE', '2026-05-14', 40);
  const { response, body } = await jsonRequest('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'client-test-commission',
      type: 'add',
      symbol: 'NVO',
      date: '2026-05-14',
      shares: 1,
      commissionEur: 1.2,
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(body.transaction.commissionEur, 1.2);
  assert.equal(body.transaction.cashFlowEur, -41.2);
});

test('POST /api/transactions/preview calculates movement without storing it', async () => {
  cachePrice('NOV.DE', '2026-05-14', 40);
  const before = getTransactions().length;
  const { response, body } = await jsonRequest('/api/transactions/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'add',
      symbol: 'NVO',
      date: '2026-05-14',
      shares: 2,
      commissionEur: 1,
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.preview.symbol, 'NVO');
  assert.equal(body.preview.valueEur, 80);
  assert.equal(body.preview.cashFlowEur, -81);
  assert.equal(getTransactions().length, before);
});

test('GET and PUT /api/auto-plans round-trip plan settings', async () => {
  const before = await jsonRequest('/api/auto-plans');
  assert.equal(before.response.status, 200);
  assert.ok(Array.isArray(before.body.autoPlans));

  const nextPlans = [{ symbol: 'NVO', amountEur: 12, day: 3, frequency: 'monthly', enabled: true, startDate: '2026-06-01' }];
  const updated = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: nextPlans }),
  });

  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.autoPlans.find((plan) => plan.symbol === 'NVO').amountEur, 12);
  assert.equal(updated.body.autoPlans.find((plan) => plan.symbol === 'NVO').startDate, '2026-06-01');
  assert.equal(updated.body.autoPlans.find((plan) => plan.symbol === 'NVO').frequency, 'monthly');

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: before.body.autoPlans }),
  });
});

test('auto plan schema and API validate configurable start dates', async () => {
  const columns = db.prepare('PRAGMA table_info(auto_plans)').all().map((column) => column.name);
  assert.ok(columns.includes('start_date'));
  assert.ok(columns.includes('frequency'));
  assert.ok(columns.includes('weekday'));

  const missingInstrument = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'MISSING', amountEur: 10, day: 3, frequency: 'monthly', enabled: true, startDate: '2026-06-01' }] }),
  });
  assert.equal(missingInstrument.response.status, 400);
  assert.match(missingInstrument.body.error, /Instrument not found/);

  const fxPlan = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'USDEUR', amountEur: 10, day: 3, frequency: 'monthly', enabled: true, startDate: '2026-06-01' }] }),
  });
  assert.equal(fxPlan.response.status, 400);
  assert.match(fxPlan.body.error, /FX instruments/);

  const badDay = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'NVO', amountEur: 10, day: 31, frequency: 'monthly', enabled: true, startDate: '2026-06-01' }] }),
  });
  assert.equal(badDay.response.status, 400);
  assert.match(badDay.body.error, /between 1 and 28/);

  const badAmount = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'NVO', amountEur: 0, day: 3, frequency: 'monthly', enabled: true, startDate: '2026-06-01' }] }),
  });
  assert.equal(badAmount.response.status, 400);
  assert.match(badAmount.body.error, /greater than 0/);

  const badWeekday = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'NVO', amountEur: 10, frequency: 'weekly', weekday: 8, enabled: true, startDate: '2026-06-01' }] }),
  });
  assert.equal(badWeekday.response.status, 400);
  assert.match(badWeekday.body.error, /weekday/);
});

test('editing existing auto plans never backdates material changes', async () => {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  seedTestInstrument({ symbol: 'EDITP', yahooSymbol: 'EDITP', name: 'Editable Plan', type: 'etf' });
  db.prepare('DELETE FROM auto_plans WHERE symbol = ?').run('EDITP');

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoPlans: [{ symbol: 'EDITP', amountEur: 20, day: 3, frequency: 'monthly', enabled: false, startDate: '2026-01-01' }],
    }),
  });

  const activationPreview = await jsonRequest('/api/auto-plans/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoPlans: [{ symbol: 'EDITP', amountEur: 20, day: 3, frequency: 'monthly', enabled: true, startDate: '2026-01-01' }],
    }),
  });
  assert.equal(activationPreview.response.status, 200);
  assert.equal(activationPreview.body.preview.warnings[0].startDate, todayIso);

  const activated = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoPlans: [{ symbol: 'EDITP', amountEur: 20, day: 3, frequency: 'monthly', enabled: true, startDate: '2026-01-01' }],
    }),
  });
  assert.equal(activated.response.status, 200);
  assert.equal(activated.body.autoPlans.find((plan) => plan.symbol === 'EDITP').startDate, todayIso);
  assert.match(activated.body.warnings[0].message, /no se recalculan aportaciones anteriores/);

  const changedFrequency = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoPlans: [{ symbol: 'EDITP', amountEur: 20, frequency: 'weekly', weekday: 3, enabled: true, startDate: '2026-01-01' }],
    }),
  });
  assert.equal(changedFrequency.response.status, 200);
  assert.equal(changedFrequency.body.autoPlans.find((plan) => plan.symbol === 'EDITP').startDate, todayIso);
  assert.equal(changedFrequency.body.autoPlans.find((plan) => plan.symbol === 'EDITP').frequency, 'weekly');

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [] }),
  });
});

test('database includes scalability indexes and persistent history tables', () => {
  const expectedObjects = [
    'idx_transactions_symbol_date_created',
    'idx_transactions_date_created',
    'idx_transactions_origin_auto_key',
    'idx_instruments_type_active',
    'app_meta',
    'market_prices_daily',
    'fx_rates_daily',
    'portfolio_positions_daily',
    'portfolio_value_daily',
    'portfolio_value_weekly',
    'portfolio_events',
    'history_builds',
    'history_invalidations',
    'idx_market_prices_symbol_date',
    'idx_portfolio_value_date',
    'idx_portfolio_value_weekly_date',
    'idx_portfolio_events_plot_date',
    'idx_history_invalidations_from_date',
    'import_batches',
    'import_rows',
    'idx_import_batches_file_hash',
    'idx_import_rows_batch_index',
  ];
  const placeholders = expectedObjects.map(() => '?').join(', ');
  const objects = db
    .prepare(`SELECT name, type FROM sqlite_master WHERE name IN (${placeholders})`)
    .all(...expectedObjects)
    .map((item) => item.name);

  for (const name of expectedObjects) {
    assert.ok(objects.includes(name), `${name} exists`);
  }
});

test('fresh install defaults do not include personal holdings or auto plans', () => {
  const instruments = db.prepare('SELECT symbol, base_shares AS baseShares FROM instruments').all();
  const personalAutoPlans = db.prepare('SELECT COUNT(*) AS count FROM auto_plans').get().count;

  for (const instrument of instruments) {
    assert.equal(instrument.baseShares, 0, `${instrument.symbol} starts without bundled holdings`);
  }
  assert.equal(personalAutoPlans, 0);
});

test('CSV import preview is read-only and commit is atomic and idempotent', async () => {
  seedTestInstrument({ symbol: 'IMPA', yahooSymbol: 'IMPA', name: 'Import A', type: 'stock', currency: 'EUR' });
  const csv = [
    'tipo;ticker;fecha;acciones;precio;divisa;valor EUR;comision',
    'C;IMPA;01/05/2026;2;10;EUR;20;1',
    'V;IMPA;02/05/2026;1;12;EUR;12;0.5',
  ].join('\n');

  const beforeTransactions = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPA'").get().count;
  const preview = previewImport({ source: 'csv', filename: 'import-test.csv', content: csv });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.summary.buys, 1);
  assert.equal(preview.summary.sells, 1);
  assert.equal(preview.summary.errorCount, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPA'").get().count, beforeTransactions);

  const committed = commitImport({ source: 'csv', filename: 'import-test.csv', content: csv });
  assert.equal(committed.batch.status, 'committed');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPA' AND origin = 'import'").get().count, 2);
  const imported = getTransactions().filter((item) => item.symbol === 'IMPA');
  assert.equal(imported[0].commissionEur, 1);
  assert.equal(imported[0].cashFlowEur, -21);
  assert.equal(imported[1].cashFlowEur, 11.5);
  assert.equal(Number(getPositionShares('IMPA', '2026-05-03').toFixed(4)), 1);

  const repeated = commitImport({ source: 'csv', filename: 'import-test.csv', content: csv });
  assert.equal(repeated.batch.id, committed.batch.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPA' AND origin = 'import'").get().count, 2);
});

test('CSV import skips invalid sales by default with a clear existing-empty-position reason', () => {
  seedTestInstrument({ symbol: 'IMPB', yahooSymbol: 'IMPB', name: 'Import B', type: 'stock', currency: 'EUR' });
  const csv = [
    'type,symbol,date,shares,price,currency,valueEur',
    'sell,IMPB,2026-05-01,4,10,EUR,40',
  ].join('\n');
  const preview = previewImport({ source: 'csv', content: csv });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'skipped');
  assert.equal(preview.rows[0].blockReasonCode, 'existing_empty_position');
  assert.match(preview.rows[0].blockReasonMessage, /instrumento existe/i);
  const committed = commitImport({ source: 'csv', content: csv });
  assert.equal(committed.summary.skippedCount, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPB'").get().count, 0);
});

test('CSV import impact and commit use only selected rows', () => {
  seedTestInstrument({ symbol: 'IMPS1', yahooSymbol: 'IMPS1', name: 'Import Selected One', type: 'stock', currency: 'EUR' });
  seedTestInstrument({ symbol: 'IMPS2', yahooSymbol: 'IMPS2', name: 'Import Selected Two', type: 'stock', currency: 'EUR' });
  const csv = [
    'type,symbol,date,shares,price,currency,valueEur',
    'buy,IMPS1,2026-05-01,1,10,EUR,10',
    'buy,IMPS2,2026-05-02,3,20,EUR,60',
  ].join('\n');

  const selected = previewImport({
    source: 'csv',
    filename: 'selected-rows.csv',
    content: csv,
    rowActions: { 2: 'import', 3: 'skip' },
  });
  assert.equal(selected.canCommit, true);
  assert.equal(selected.summary.buys, 1);
  assert.equal(selected.summary.skippedCount, 1);
  assert.equal(selected.impactPreview.buyCount, 1);
  assert.equal(selected.impactPreview.totalValueEur, 10);

  const committed = commitImport({
    source: 'csv',
    filename: 'selected-rows.csv',
    content: csv,
    rowActions: { 2: 'import', 3: 'skip' },
  });
  assert.equal(committed.summary.buys, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPS1' AND origin = 'import'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPS2' AND origin = 'import'").get().count, 0);
});

test('CSV import rejects historical rows that would break future ledger positions', async () => {
  seedTestInstrument({ symbol: 'IMPD', yahooSymbol: 'IMPD', name: 'Import D', type: 'stock', currency: 'EUR' });
  await createTransaction({ type: 'add', symbol: 'IMPD', date: '2026-05-01', shares: 2 });
  await createTransaction({ type: 'remove', symbol: 'IMPD', date: '2026-05-10', shares: 1 });
  const csv = [
    'type,symbol,date,shares,price,currency,valueEur',
    'sell,IMPD,2026-05-05,2,10,EUR,20',
  ].join('\n');
  const preview = previewImport({ source: 'csv', content: csv });
  assert.equal(preview.canCommit, false);
  assert.match(preview.rows[0].errors.join(' '), /necesita compras anteriores/);
});

test('CSV import API exposes preview, commit, list, detail and rollback', async () => {
  seedTestInstrument({ symbol: 'IMPC', yahooSymbol: 'IMPC', name: 'Import C', type: 'stock', currency: 'EUR' });
  const csv = [
    'type,symbol,date,shares,price,currency,valueEur,commissionEur',
    'buy,IMPC,2026-05-03,3,5,EUR,15,0.25',
  ].join('\n');
  const payload = { source: 'csv', filename: 'api-import.csv', content: csv };
  const preview = await jsonRequest('/api/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.preview.canCommit, true);

  const committed = await jsonRequest('/api/import/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(committed.response.status, 201);
  assert.equal(committed.body.summary.buys, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPC' AND origin = 'import'").get().count, 1);

  const batches = await jsonRequest('/api/import/batches');
  assert.equal(batches.response.status, 200);
  assert.ok(batches.body.batches.some((batch) => batch.id === committed.body.batch.id));

  const detail = await jsonRequest('/api/import/batches/' + encodeURIComponent(committed.body.batch.id));
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.rows.length, 1);

  const rolledBack = await jsonRequest('/api/import/batches/' + encodeURIComponent(committed.body.batch.id) + '/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(rolledBack.response.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMPC'").get().count, 0);
  assert.equal(db.prepare('SELECT status FROM import_batches WHERE id = ?').get(committed.body.batch.id).status, 'rolled_back');
});

test('import rollback allows reimporting the same file hash with a different selected subset', () => {
  seedTestInstrument({ symbol: 'IRB1', yahooSymbol: 'IRB1', name: 'Import Rollback One', type: 'stock', currency: 'EUR' });
  seedTestInstrument({ symbol: 'IRB2', yahooSymbol: 'IRB2', name: 'Import Rollback Two', type: 'stock', currency: 'EUR' });
  const csv = [
    'type,symbol,date,shares,price,currency,valueEur',
    'buy,IRB1,2026-05-01,1,10,EUR,10',
    'buy,IRB2,2026-05-02,2,20,EUR,40',
  ].join('\n');

  const first = commitImport({
    source: 'csv',
    filename: 'rollback-reimport.csv',
    content: csv,
    rowActions: { 2: 'import', 3: 'skip' },
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IRB1' AND origin = 'import'").get().count, 1);
  assert.equal(rollbackImportBatch(first.batch.id), true);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol IN ('IRB1', 'IRB2') AND origin = 'import'").get().count, 0);

  const second = commitImport({
    source: 'csv',
    filename: 'rollback-reimport.csv',
    content: csv,
    rowActions: { 2: 'skip', 3: 'import' },
  });
  assert.equal(second.batch.id, first.batch.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IRB1' AND origin = 'import'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IRB2' AND origin = 'import'").get().count, 1);
});

test('XLSX generic import supports sheet selection and atomic commit', () => {
  seedTestInstrument({ symbol: 'IMXE', yahooSymbol: 'IMXE', name: 'Import XLSX', type: 'stock', currency: 'EUR' });
  const contentBase64 = createWorkbookBase64({
    Sheet1: [
      ['type', 'symbol', 'date', 'shares', 'price', 'currency', 'valueEur'],
      ['buy', 'IMXE', '2026-05-05', 1, 20, 'EUR', 20],
    ],
    Ops: [
      ['tipo', 'ticker', 'fecha', 'acciones', 'precio', 'divisa', 'valor EUR', 'comision'],
      ['C', 'IMXE', '06/05/2026', 2, 10, 'EUR', 20, 0.5],
    ],
  });

  const previewDefault = previewImport({
    source: 'generic-xlsx',
    filename: 'import.xlsx',
    contentBase64,
  });
  assert.equal(previewDefault.selectedSheet, 'Sheet1');
  assert.equal(previewDefault.sheets.length, 2);
  assert.equal(previewDefault.canCommit, true);

  const previewOps = previewImport({
    source: 'generic-xlsx',
    filename: 'import.xlsx',
    contentBase64,
    sheetName: 'Ops',
  });
  assert.equal(previewOps.selectedSheet, 'Ops');
  assert.equal(previewOps.summary.buys, 1);
  assert.equal(previewOps.summary.errorCount, 0);

  const committed = commitImport({
    source: 'generic-xlsx',
    filename: 'import.xlsx',
    contentBase64,
    sheetName: 'Ops',
  });
  assert.equal(committed.batch.status, 'committed');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'IMXE' AND origin = 'import'").get().count, 1);
  assert.equal(Number(getPositionShares('IMXE', '2026-05-07').toFixed(4)), 2);
});

test('XLSX import API accepts sheetName and returns selected sheet metadata', async () => {
  seedTestInstrument({ symbol: 'IMXF', yahooSymbol: 'IMXF', name: 'Import XLSX API', type: 'stock', currency: 'EUR' });
  const contentBase64 = createWorkbookBase64({
    A: [
      ['type', 'symbol', 'date', 'shares', 'price', 'currency', 'valueEur'],
      ['buy', 'IMXF', '2026-05-10', 1, 10, 'EUR', 10],
    ],
    B: [
      ['tipo', 'ticker', 'fecha', 'acciones', 'precio', 'divisa', 'valor EUR'],
      ['C', 'IMXF', '11/05/2026', 2, 10, 'EUR', 20],
    ],
  });

  const preview = await jsonRequest('/api/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'generic-xlsx', filename: 'api.xlsx', contentBase64, sheetName: 'B' }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.preview.selectedSheet, 'B');
  assert.equal(preview.body.preview.canCommit, true);
});

test('DEGIRO and IBKR adapters normalize broker exports to canonical import rows', () => {
  seedTestInstrument({ symbol: 'IMDG', yahooSymbol: 'IMDG', name: 'Import DEGIRO', type: 'stock', currency: 'EUR' });
  seedTestInstrument({ symbol: 'IMIB', yahooSymbol: 'IMIB', name: 'Import IBKR', type: 'stock', currency: 'USD' });

  const degiroCsv = [
    'Date;Ticker;Quantity;Price;Currency;Total in EUR;Broker Fee',
    '2026-05-02;IMDG;2;15;EUR;30;0.5',
    '2026-05-03;IMDG;-1;16;EUR;16;0.2',
  ].join('\n');
  const degiroPreview = previewImport({ source: 'degiro-csv', filename: 'degiro.csv', content: degiroCsv });
  assert.equal(degiroPreview.canCommit, true);
  assert.equal(degiroPreview.fileSubtype, 'unknown');
  assert.equal(degiroPreview.summary.buys, 1);
  assert.equal(degiroPreview.summary.sells, 1);
  const degiroCommit = commitImport({ source: 'degiro-csv', filename: 'degiro.csv', content: degiroCsv });
  assert.equal(degiroCommit.summary.errorCount, 0);
  assert.equal(Number(getPositionShares('IMDG', '2026-05-03').toFixed(4)), 1);

  const ibkrCsv = [
    'Date/Time,Symbol,Quantity,T. Price,Currency,Proceeds,Comm/Fee,FX',
    '2026-05-04,IMIB,3,100,USD,-300,-1.2,0.9',
    '2026-05-08,IMIB,-1,110,USD,110,-0.8,0.9',
  ].join('\n');
  const ibkrPreview = previewImport({ source: 'ibkr-csv', filename: 'ibkr.csv', content: ibkrCsv });
  assert.equal(ibkrPreview.canCommit, true);
  assert.equal(ibkrPreview.summary.buys, 1);
  assert.equal(ibkrPreview.summary.sells, 1);
  const ibkrCommit = commitImport({ source: 'ibkr-csv', filename: 'ibkr.csv', content: ibkrCsv });
  assert.equal(ibkrCommit.summary.errorCount, 0);
  assert.equal(Number(getPositionShares('IMIB', '2026-05-09').toFixed(4)), 2);
});

test('DEGIRO Transactions.csv format maps signed quantity, fees and subtype correctly', () => {
  seedTestInstrument({ symbol: 'META', yahooSymbol: 'META', name: 'Meta Platforms', type: 'stock', currency: 'USD' });
  db.prepare(
    `INSERT OR REPLACE INTO instrument_identifiers
      (instrument_symbol, provider, identifier_type, identifier_value, display_name, currency, exchange)
     VALUES ('META', 'global', 'isin', 'US30303M1027', 'META PLATFORMS INC CLASS A', 'USD', 'NDQ')`,
  ).run();

  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '24-12-2025,16:42,META PLATFORMS INC CLASS A,US30303M1027,NDQ,EDGX,-1,\"666,0000\",USD,\"666,00\",USD,\"565,37\",\"1,1780\",\"-1,41\",\"-2,00\",\"561,96\",,7cb1ac97-9905-4bfa-8bc1-5ba1a643cf7d',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.equal(preview.fileSubtype, 'transactions_export');
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'skipped');
  assert.equal(preview.rows[0].blockReasonCode, 'existing_empty_position');
  assert.equal(preview.rows[0].normalized.symbol, 'META');
  assert.equal(preview.rows[0].normalized.type, 'remove');
  assert.equal(preview.rows[0].normalized.commissionEur.toFixed(2), '3.41');
});

test('public DEGIRO sample dataset is importable', () => {
  for (const instrument of [
    { symbol: 'VGWD', yahooSymbol: 'VGWD.DE', name: 'ValorGrid World Demo', type: 'etf', currency: 'EUR' },
    { symbol: 'VGCH', yahooSymbol: 'VGCH.DE', name: 'ValorGrid China Demo', type: 'etf', currency: 'EUR' },
    { symbol: 'VGUS', yahooSymbol: 'VGUS', name: 'ValorGrid US Tech Demo', type: 'stock', currency: 'USD' },
    { symbol: 'VGSEMI', yahooSymbol: 'VGSEMI', name: 'ValorGrid Semiconductor Demo', type: 'etf', currency: 'USD' },
    { symbol: 'VGURA', yahooSymbol: 'VGURA', name: 'ValorGrid Uranium Demo', type: 'etf', currency: 'USD' },
    { symbol: 'VGTXT', yahooSymbol: 'TXT.WA', name: 'ValorGrid Text Demo', type: 'stock', currency: 'PLN' },
  ]) {
    seedTestInstrument(instrument);
  }

  db.prepare(
    `INSERT OR REPLACE INTO instrument_identifiers
      (instrument_symbol, provider, identifier_type, identifier_value, display_name, currency, exchange)
     VALUES
      ('VGWD', 'global', 'isin', 'IE0000000019', 'MSCI WORLD ETF SYNTH', 'EUR', 'XET'),
      ('VGCH', 'global', 'isin', 'IE0000000027', 'MSCI CHINA ETF SYNTH', 'EUR', 'XET'),
      ('VGUS', 'global', 'isin', 'US30303M1027', 'META PLATFORMS INC CLASS A', 'USD', 'NDQ'),
      ('VGSEMI', 'global', 'isin', 'US8168511090', 'ETF SEMICONDUCTORS SYNTH', 'USD', 'ARCA'),
      ('VGURA', 'global', 'isin', 'US91690V1044', 'ETF URANIUM SYNTH', 'USD', 'ARCA'),
      ('VGTXT', 'global', 'isin', 'PLTEXT000010', 'TEXT SA', 'PLN', 'WSE')`,
  ).run();

  const content = fs.readFileSync(path.join(__dirname, '..', 'samples', 'broker-degiro', 'degiro-transactions-synthetic.csv'), 'utf8');
  const preview = previewImport({ source: 'degiro-csv', filename: 'degiro-transactions-synthetic.csv', content });

  assert.equal(preview.canCommit, true);
  assert.equal(preview.fileSubtype, 'transactions_export');
  assert.equal(preview.summary.rowCount, 13);
  assert.equal(preview.rows.length, 13);
  assert.equal(preview.summary.buys, 6);
  assert.equal(preview.summary.sells, 3);
  assert.equal(preview.summary.ignoredCount, 2);
  assert.equal(preview.summary.skippedCount, 2);
  assert.ok(preview.rows.some((row) => row.blockReasonCode === 'unknown_sell_only'));

  const commit = commitImport({ source: 'degiro-csv', filename: 'degiro-transactions-synthetic.csv', content });
  assert.equal(commit.summary.errorCount, 0);
  const expectedShares = preview.rows
    .filter((row) => row.status === 'valid')
    .reduce((acc, row) => {
      const sign = row.normalized.type === 'remove' ? -1 : 1;
      acc[row.normalized.symbol] = Number(((acc[row.normalized.symbol] || 0) + sign * row.normalized.shares).toFixed(6));
      return acc;
    }, {});
  for (const [symbol, shares] of Object.entries(expectedShares)) {
    assert.equal(Number(getPositionShares(symbol, '2024-12-31').toFixed(6)), Number(shares.toFixed(6)));
  }
});

test('import preview returns detected instruments grouping and impact summary', () => {
  seedTestInstrument({ symbol: 'IGR1', yahooSymbol: 'IGR1', name: 'Import Group 1', type: 'stock', currency: 'EUR' });
  seedTestInstrument({ symbol: 'IGR2', yahooSymbol: 'IGR2', name: 'Import Group 2', type: 'stock', currency: 'EUR' });
  const csv = [
    'type,symbol,date,shares,price,currency,valueEur',
    'buy,IGR1,2026-05-01,1,10,EUR,10',
    'sell,IGR1,2026-05-03,0.5,12,EUR,6',
    'buy,IGR2,2026-05-04,2,8,EUR,16',
  ].join('\n');

  const preview = previewImport({ source: 'csv', filename: 'grouped.csv', content: csv });
  assert.equal(preview.canCommit, true);
  assert.ok(Array.isArray(preview.detectedInstruments));
  assert.ok(preview.detectedInstruments.length >= 2);
  const igr1 = preview.detectedInstruments.find((item) => item.symbol === 'IGR1');
  assert.ok(igr1);
  assert.equal(igr1.rowCount, 2);
  assert.equal(igr1.buys, 1);
  assert.equal(igr1.sells, 1);
  assert.ok(Array.isArray(igr1.rowIndexes));
  assert.equal(preview.impactPreview.instrumentCount, 2);
  assert.equal(preview.impactPreview.buyCount, 2);
  assert.equal(preview.impactPreview.sellCount, 1);
});

test('import preview suggests common Yahoo tickers without resolving automatically', () => {
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '06-05-2026,17:53,ADVANCED MICRO DEVICES INC,US0079031078,NDQ,ARCA,1,"100,0000",USD,"100,00",USD,"85,00","1,1765","0,00","0,00","-85,00","ord-amd-suggest",',
    '07-05-2026,17:53,ALPHABET INC CLASS C,US02079K1079,NDQ,ARCA,1,"100,0000",USD,"100,00",USD,"85,00","1,1765","0,00","0,00","-85,00","ord-goog-suggest",',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  const amd = preview.detectedInstruments.find((item) => item.isin === 'US0079031078');
  const goog = preview.detectedInstruments.find((item) => item.isin === 'US02079K1079');
  assert.ok(amd?.tickerSuggestions.some((item) => item.yahooSymbol === 'AMD'));
  assert.ok(goog?.tickerSuggestions.some((item) => item.yahooSymbol === 'GOOG'));
  assert.ok(['needs_mapping', 'valid'].includes(preview.rows[0].status));
});

test('ticker suggestion API returns best-effort suggestions and tolerates provider fallback', async () => {
  const { response, body } = await jsonRequest('/api/import/ticker-suggestions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ADVANCED MICRO DEVICES INC', isin: 'US0079031078', currency: 'USD', exchange: 'NDQ' }),
  });

  assert.equal(response.status, 200);
  assert.ok(body.suggestions.some((item) => item.yahooSymbol === 'AMD'));
});

test('DEGIRO import suggests tickers from instrument_identifiers DB after first import', () => {
  db.prepare("DELETE FROM instrument_identifiers WHERE identifier_value = 'PLLVTSF00010'").run();
  db.prepare("DELETE FROM instrument_identifiers WHERE identifier_value = 'PLSPRSF00011'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'TXT'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'SPR'").run();
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES ('importados', 'Importados', '#64748b', 1, 1, 1, 0, 1)`,
  ).run();

  const firstContent = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '26-06-2024,11:55,TEXT SA,PLLVTSF00010,WSE,XWAR,5,"78,8000",PLN,"-394,00",PLN,"-91,58","4,3024","-0,23","-4,90","-96,71","ord-wse-first-1",',
    '16-05-2023,16:30,SPYROSOFT SA,PLSPRSF00011,WSE,XWAR,2,"448,0000",PLN,"-896,00",PLN,"-199,70","4,4868","-0,50",,"-200,20","ord-wse-first-2",',
  ].join('\n');

  commitImport({
    source: 'degiro-csv',
    filename: 'Transactions.csv',
    content: firstContent,
    instrumentMappings: { 'isin:PLLVTSF00010': 'TXT', 'isin:PLSPRSF00011': 'SPR' },
    newInstruments: [
      { symbol: 'TXT', yahooSymbol: 'TXT.WA', name: 'TEXT SA', type: 'stock', currency: 'PLN', groupId: 'importados', color: '#ea580c' },
      { symbol: 'SPR', yahooSymbol: 'SPR.WA', name: 'SPYROSOFT SA', type: 'stock', currency: 'PLN', groupId: 'importados', color: '#9333ea' },
    ],
  });

  const secondContent = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '18-05-2026,10:28,TEXT SA,PLLVTSF00010,WSE,XWAR,10,"40,1800",PLN,"401,80",PLN,"94,63","4,2447","-0,43","-4,90","-89,30","ord-wse-second-1",',
    '17-07-2025,14:32,SPYROSOFT SA,PLSPRSF00011,WSE,XWAR,3,"606,0000",PLN,"1818,00",PLN,"427,27","4,2549","-0,36",,"-426,91","ord-wse-second-2",',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content: secondContent });
  const textSa = preview.detectedInstruments.find((item) => item.isin === 'PLLVTSF00010');
  const spyrosoft = preview.detectedInstruments.find((item) => item.isin === 'PLSPRSF00011');
  assert.ok(textSa, 'TEXT SA should be detected');
  assert.ok(spyrosoft, 'SPYROSOFT SA should be detected');
  assert.ok(textSa.tickerSuggestions.some((item) => item.yahooSymbol === 'TXT.WA'), 'TEXT SA should suggest TXT.WA from DB');
  assert.ok(spyrosoft.tickerSuggestions.some((item) => item.yahooSymbol === 'SPR.WA'), 'SPYROSOFT SA should suggest SPR.WA from DB');
  const txtSuggestion = textSa.tickerSuggestions.find((item) => item.yahooSymbol === 'TXT.WA');
  assert.equal(txtSuggestion.currency, 'PLN');
  assert.equal(txtSuggestion.source, 'history');
});

test('DEGIRO import commits WSE instruments with correct color and identifiers persisted', () => {
  db.prepare("DELETE FROM transactions WHERE symbol IN ('TXT', 'SPR') AND origin = 'import'").run();
  db.prepare("DELETE FROM import_rows WHERE batch_id LIKE '%wse%'").run();
  db.prepare("DELETE FROM import_batches WHERE id LIKE '%wse%'").run();
  db.prepare("DELETE FROM instrument_identifiers WHERE identifier_value = 'PLLVTSF00010'").run();
  db.prepare("DELETE FROM instrument_identifiers WHERE identifier_value = 'PLSPRSF00011'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'TXT'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'SPR'").run();
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES ('importados', 'Importados', '#64748b', 1, 1, 1, 0, 1)`,
  ).run();

  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '26-06-2024,11:55,TEXT SA,PLLVTSF00010,WSE,XWAR,5,"78,8000",PLN,"-394,00",PLN,"-91,58","4,3024","-0,23","-4,90","-96,71","ord-wse-commit-1",',
    '16-05-2023,16:30,SPYROSOFT SA,PLSPRSF00011,WSE,XWAR,2,"448,0000",PLN,"-896,00",PLN,"-199,70","4,4868","-0,50",,"-200,20","ord-wse-commit-2",',
  ].join('\n');

  const payload = {
    source: 'degiro-csv',
    filename: 'Transactions.csv',
    content,
    instrumentMappings: { 'isin:PLLVTSF00010': 'TXT', 'isin:PLSPRSF00011': 'SPR' },
    newInstruments: [
      { symbol: 'TXT', yahooSymbol: 'TXT.WA', name: 'TEXT SA', type: 'stock', currency: 'PLN', groupId: 'importados', color: '#ea580c' },
      { symbol: 'SPR', yahooSymbol: 'SPR.WA', name: 'SPYROSOFT SA', type: 'stock', currency: 'PLN', groupId: 'importados', color: '#9333ea' },
    ],
  };

  const preview = previewImport(payload);
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows.every((row) => row.status === 'valid'), true);

  const commit = commitImport(payload);
  assert.equal(commit.summary.errorCount, 0);

  const txtInstrument = db.prepare("SELECT * FROM instruments WHERE symbol = 'TXT'").get();
  assert.ok(txtInstrument, 'TXT instrument should exist');
  assert.equal(txtInstrument.color, '#ea580c');
  assert.equal(txtInstrument.yahoo_symbol, 'TXT.WA');
  assert.equal(txtInstrument.currency, 'PLN');

  const sprInstrument = db.prepare("SELECT * FROM instruments WHERE symbol = 'SPR'").get();
  assert.ok(sprInstrument, 'SPR instrument should exist');
  assert.equal(sprInstrument.color, '#9333ea');
  assert.equal(sprInstrument.yahoo_symbol, 'SPR.WA');

  const txtIsin = db.prepare("SELECT * FROM instrument_identifiers WHERE instrument_symbol = 'TXT' AND identifier_type = 'isin'").get();
  assert.ok(txtIsin, 'TXT ISIN identifier should be persisted');
  assert.equal(txtIsin.identifier_value.toUpperCase(), 'PLLVTSF00010');

  const sprIsin = db.prepare("SELECT * FROM instrument_identifiers WHERE instrument_symbol = 'SPR' AND identifier_type = 'isin'").get();
  assert.ok(sprIsin, 'SPR ISIN identifier should be persisted');
  assert.equal(sprIsin.identifier_value.toUpperCase(), 'PLSPRSF00011');

  assert.equal(Number(getPositionShares('TXT', '2024-06-26').toFixed(2)), 5);
  assert.equal(Number(getPositionShares('SPR', '2023-05-16').toFixed(2)), 2);
});

test('import can create instrument from confirmed instrument mapping and persist identifiers', () => {
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES ('import-test-group', 'Import Test', '#2563eb', 1, 1, 1, 0, 1)`,
  ).run();
  const group = db.prepare("SELECT id FROM instrument_groups WHERE id = 'import-test-group'").get();
  db.prepare("DELETE FROM instrument_identifiers WHERE identifier_value = 'ZZ0079031078'").run();
  db.prepare("DELETE FROM instruments WHERE symbol = 'AMDIMP'").run();
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '06-05-2026,17:53,ADVANCED MICRO DEVICES INC,ZZ0079031078,NDQ,ARCA,1,"100,0000",USD,"100,00",USD,"85,00","1,1765","0,00","0,00","-85,00","ord-amd-create",',
  ].join('\n');
  const mappingKey = 'isin:ZZ0079031078';
  const payload = {
    source: 'degiro-csv',
    filename: 'Transactions.csv',
    content,
    instrumentMappings: { [mappingKey]: 'AMDIMP' },
    newInstruments: [
      {
        symbol: 'AMDIMP',
        yahooSymbol: 'AMD',
        name: 'Advanced Micro Devices Import',
        type: 'stock',
        currency: 'USD',
        groupId: group.id,
        color: '#2563eb',
      },
    ],
  };

  const preview = previewImport(payload);
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].normalized.symbol, 'AMDIMP');

  commitImport(payload);
  assert.equal(Number(getPositionShares('AMDIMP', '2026-05-06').toFixed(2)), 1);
  const identifier = db
    .prepare("SELECT instrument_symbol AS symbol FROM instrument_identifiers WHERE provider = 'global' AND identifier_type = 'isin' AND identifier_value = 'ZZ0079031078'")
    .get();
  assert.equal(identifier.symbol, 'AMDIMP');
});

test('DEGIRO portfolio snapshot CSV imports as opening position', () => {
  seedTestInstrument({
    symbol: 'ACME',
    yahooSymbol: 'ACME',
    name: 'Acme Platforms',
    type: 'stock',
    currency: 'USD',
  });
  db.prepare(
    `INSERT OR REPLACE INTO instrument_identifiers
      (instrument_symbol, provider, identifier_type, identifier_value, display_name, currency, exchange)
     VALUES ('ACME', 'global', 'isin', 'US0000000001', 'ACME PLATFORMS INC CLASS A', 'USD', NULL)`,
  ).run();

  const content = [
    'Producto,Symbol/ISIN,Cantidad,Precio de,Valor local,,Valor en EUR',
    'ACME PLATFORMS INC CLASS A,US0000000001,3,"607,38",USD,"1822,14","1568,32"',
  ].join('\n');
  const preview = previewImport({ source: 'degiro-csv', filename: 'portfolio.csv', content });

  assert.equal(preview.fileSubtype, 'portfolio_snapshot');
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].normalized.symbol, 'ACME');
  assert.equal(preview.rows[0].normalized.type, 'add');
  assert.equal(preview.rows[0].normalized.currency, 'USD');
  assert.ok(preview.rows[0].normalized.fxToEur > 0);
  assert.equal(Number(preview.rows[0].normalized.valueEur.toFixed(2)), 1568.32);

  const commit = commitImport({ source: 'degiro-csv', filename: 'portfolio.csv', content });
  assert.equal(commit.summary.errorCount, 0);
  assert.equal(Number(getPositionShares('ACME').toFixed(4)), 3);
});

test('DEGIRO snapshot matching existing position is flagged as duplicate and does not add shares', async () => {
  seedTestInstrument({
    symbol: 'SMAT1',
    yahooSymbol: 'SMAT1',
    name: 'Snap Match Inc',
    type: 'stock',
    currency: 'USD',
  });
  await createTransaction({ type: 'add', symbol: 'SMAT1', date: '2025-01-10', shares: 3 });

  const content = [
    'Producto,Symbol/ISIN,Cantidad,Precio de,Valor local,,Valor en EUR',
    'SNAP MATCH INC,US1111111111,3,"607,38",USD,"1822,14","1568,32"',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Portfolio.csv', content });
  assert.equal(preview.fileSubtype, 'portfolio_snapshot');
  assert.equal(preview.rows[0].status, 'duplicate');
  assert.equal(preview.rows[0].reconciliationStatus, 'match_exact');
  assert.equal(preview.rows[0].importStrategy, 'skip');

  const commit = commitImport({ source: 'degiro-csv', filename: 'Portfolio.csv', content });
  assert.equal(commit.summary.duplicateCount, 1);
  assert.equal(Number(getPositionShares('SMAT1').toFixed(4)), 3);
});

test('DEGIRO snapshot above ledger imports only delta shares', async () => {
  seedTestInstrument({
    symbol: 'SDEL1',
    yahooSymbol: 'SDEL1',
    name: 'Snap Delta Inc',
    type: 'stock',
    currency: 'USD',
  });
  await createTransaction({ type: 'add', symbol: 'SDEL1', date: '2025-01-10', shares: 2 });

  const content = [
    'Producto,Symbol/ISIN,Cantidad,Precio de,Valor local,,Valor en EUR',
    'SNAP DELTA INC,US2222222222,3,"600,00",USD,"1800,00","1530,00"',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Portfolio.csv', content });
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[0].reconciliationStatus, 'delta_positive');
  assert.equal(Number(preview.rows[0].normalized.shares.toFixed(4)), 1);

  commitImport({ source: 'degiro-csv', filename: 'Portfolio.csv', content });
  assert.equal(Number(getPositionShares('SDEL1').toFixed(4)), 3);
});

test('DEGIRO Transactions marks ledger-matching trade as duplicate_ledger_match', async () => {
  seedTestInstrument({ symbol: 'META', yahooSymbol: 'META', name: 'Meta Platforms', type: 'stock', currency: 'USD' });
  db.prepare("DELETE FROM instrument_identifiers WHERE provider = 'global' AND identifier_type = 'isin' AND identifier_value = 'US30303M1027'").run();
  db.prepare(
    `INSERT OR REPLACE INTO instrument_identifiers
      (id, instrument_symbol, provider, identifier_type, identifier_value, display_name, currency, exchange)
     VALUES ('meta-isin-test', 'META', 'global', 'isin', 'US30303M1027', 'META PLATFORMS INC CLASS A', 'USD', 'NDQ')`,
  ).run();
  db.prepare(
    `INSERT OR REPLACE INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, commission_eur, cash_flow_eur, color, origin, raw_hash)
     VALUES
      ('meta-existing-buy', 'add', 'META', 'Meta Platforms', '2025-01-10', '2025-01-10', 1, 340, 400, 'USD', 0.85, 0, -340, '#16a34a', 'manual', 'meta-existing-buy-hash'),
      ('meta-existing-sale', 'remove', 'META', 'Meta Platforms', '2025-12-24', '2025-12-24', 1, 565.37, 666, 'USD', 0.8486036036, 3.41, 561.96, '#16a34a', 'manual', 'meta-existing-sale-hash')`,
  ).run();

  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '24-12-2025,16:42,META PLATFORMS INC CLASS A,US30303M1027,NDQ,EDGX,-1,"666,0000",USD,"666,00",USD,"565,37","1,1780","-1,41","-2,00","561,96","ord-meta-duplicate",',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'duplicate');
  assert.equal(preview.rows[0].rowKind, 'duplicate_ledger_match');
  assert.match(preview.rows[0].ledgerMatch.reason, /Movimiento ya existente/);
});

test('DEGIRO Transactions ignores RTS/NON TRADEABLE corporate actions without flow', () => {
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '18-05-2026,10:28,VIDRALA SA - RTS - NON TRADEABLE,ES0183746314,MAD,,2,"0,0000",EUR,"0,00",EUR,"0,00","1,0000","0,00","0,00","0,00","ord-rts-1",',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.summary.ignoredCount, 1);
  assert.equal(preview.rows[0].status, 'ignored');
  assert.equal(preview.rows[0].rowKind, 'corporate_action_ignored');
  assert.match(preview.rows[0].ignoreReason, /Accion corporativa/);

  const commit = commitImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.equal(commit.summary.ignoredCount, 1);
});

test('DEGIRO unresolved sell-only products are skipped by default instead of blocking import', () => {
  const uniqueIsin = `ZZSELL${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    `18-05-2026,10:28,SELL ONLY UNKNOWN ${uniqueIsin},${uniqueIsin},WSE,XWAR,-3,"40,1800",PLN,"120,54",PLN,"28,39","4,2447","-0,43","-4,90","23,06","ord-sell-only-${uniqueIsin}",`,
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'skipped');
  assert.equal(preview.rows[0].blockReasonCode, 'unknown_sell_only');
  assert.match(preview.rows[0].blockReasonMessage, /No existe este instrumento/);
});

test('DEGIRO existing instrument sales distinguish empty and insufficient positions', async () => {
  seedTestInstrument({ symbol: 'EMPTY1', yahooSymbol: 'EMPTY1', name: 'Empty Position Corp', type: 'stock', currency: 'EUR' });
  seedTestInstrument({ symbol: 'PART1', yahooSymbol: 'PART1', name: 'Partial Position Corp', type: 'stock', currency: 'EUR' });
  await createTransaction({ type: 'add', symbol: 'PART1', date: '2026-01-02', shares: 2 });

  const emptyCsv = [
    'type,symbol,date,shares,price,currency,valueEur',
    'sell,EMPTY1,2026-05-01,1,10,EUR,10',
  ].join('\n');
  const partialCsv = [
    'type,symbol,date,shares,price,currency,valueEur',
    'sell,PART1,2026-05-01,5,10,EUR,50',
  ].join('\n');

  const emptyPreview = previewImport({ source: 'csv', filename: 'empty.csv', content: emptyCsv });
  assert.equal(emptyPreview.rows[0].status, 'skipped');
  assert.equal(emptyPreview.rows[0].blockReasonCode, 'existing_empty_position');
  assert.match(emptyPreview.rows[0].blockReasonMessage, /no hay acciones registradas suficientes/i);

  const partialPreview = previewImport({ source: 'csv', filename: 'partial.csv', content: partialCsv });
  assert.equal(partialPreview.rows[0].status, 'skipped');
  assert.equal(partialPreview.rows[0].blockReasonCode, 'existing_insufficient_position');
  assert.match(partialPreview.rows[0].blockReasonMessage, /disponibles 2/);
});

test('DEGIRO does not auto-map similar product names without confirmed identifiers', () => {
  seedTestInstrument({ symbol: 'VIDRALASA', yahooSymbol: 'VID.MC', name: 'VIDRALA SA', type: 'stock', currency: 'EUR' });
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuciÃ³n,NÃºmero,Precio,,Valor local,,Valor EUR,Tipo de cambio,ComisiÃ³n AutoFX,Costes de transacciÃ³n y/o externos EUR,Total EUR,ID Orden,',
    '11-07-2025,12:00,INDUSTRIA DE DISENO TEXTIL SA,ES0148396007,MAD,MAD,-1,"346,9600",EUR,"346,96",EUR,"346,96","1,0000","0,00","0,00","346,96","ord-inditex-like",',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.notEqual(preview.rows[0].normalized.symbol, 'VIDRALASA');
  assert.equal(preview.rows[0].status, 'skipped');
  assert.equal(preview.rows[0].blockReasonCode, 'unknown_sell_only');
});

test('DEGIRO imports non EUR currencies using generic FX to EUR without assuming USD', () => {
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecución,Número,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisión AutoFX,Costes de transacción y/o externos EUR,Total EUR,ID Orden,',
    '18-05-2026,10:28,TEXT SA,PLLVTsf00010,WSE,XWAR,18,"40,1800",PLN,"723,24",PLN,"170,39","4,2447","-0,43","-4,90","-165,06","ord-pln-buy",',
  ].join('\n');

  const preview = previewImport({
    source: 'degiro-csv',
    filename: 'Transactions.csv',
    content,
    instrumentMappings: { 'isin:PLLVTsf00010': 'TPLN' },
    newInstruments: [{ symbol: 'TPLN', yahooSymbol: 'TXT.WA', name: 'TEXT SA', type: 'stock', currency: 'PLN', groupId: 'demo', color: '#16a34a' }],
  });

  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[0].normalized.currency, 'PLN');
  assert.notEqual(preview.rows[0].normalized.fxToEur, 1);
  assert.equal(Number(preview.rows[0].normalized.valueEur.toFixed(2)), 170.39);
});

test('DEGIRO import can skip non-importable rows and commit the remaining valid rows', () => {
  seedTestInstrument({ symbol: 'DGOOD', yahooSymbol: 'DGOOD', name: 'Degiro Good Corp', type: 'stock', currency: 'EUR' });
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuciÃ³n,NÃºmero,Precio,,Valor local,,Valor EUR,Tipo de cambio,ComisiÃ³n AutoFX,Costes de transacciÃ³n y/o externos EUR,Total EUR,ID Orden,',
    '05-01-2026,10:00,DEGIRO GOOD CORP,US1000000001,XAMS,XAMS,2,"10,0000",EUR,"20,00",EUR,"20,00","1,0000","0,00","0,00","-20,00","ord-good-1",',
    'fecha-no-valida,10:00,UNKNOWN IMPORT CORP,US9999999999,XAMS,XAMS,1,"10,0000",EUR,"10,00",EUR,"10,00","1,0000","0,00","0,00","-10,00","ord-unknown-1",',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.equal(preview.canCommit, false);
  assert.notEqual(preview.rows[1].status, 'valid');

  const skipped = previewImport({
    source: 'degiro-csv',
    filename: 'Transactions.csv',
    content,
    rowActions: { 3: 'skip' },
  });
  assert.equal(skipped.canCommit, true);
  assert.equal(skipped.summary.skippedCount, 1);

  const commit = commitImport({
    source: 'degiro-csv',
    filename: 'Transactions.csv',
    content,
    rowActions: { 3: 'skip' },
  });
  assert.equal(commit.summary.buys, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'DGOOD' AND origin = 'import'").get().count, 1);
});

test('DEGIRO import can map an unresolved row to an existing instrument before commit', () => {
  seedTestInstrument({ symbol: 'DMAP1', yahooSymbol: 'DMAP1', name: 'Mapped Import Corp', type: 'stock', currency: 'EUR' });
  const uniqueIsin = `ZZMAP${Date.now().toString().slice(-8)}`;
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuciÃ³n,NÃºmero,Precio,,Valor local,,Valor EUR,Tipo de cambio,ComisiÃ³n AutoFX,Costes de transacciÃ³n y/o externos EUR,Total EUR,ID Orden,',
    `08-01-2026,10:00,QXZ UNLISTED SECURITY ${uniqueIsin},${uniqueIsin},XAMS,XAMS,3,"12,0000",EUR,"36,00",EUR,"36,00","1,0000","0,00","0,00","-36,00","ord-map-1",`,
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.notEqual(preview.rows[0].normalized.symbol, 'DMAP1');

  const mapped = previewImport({
    source: 'degiro-csv',
    filename: 'Transactions.csv',
    content,
    rowMappings: { 2: { symbol: 'DMAP1' } },
  });
  assert.equal(mapped.canCommit, true);
  assert.equal(mapped.rows[0].status, 'valid');
  assert.equal(mapped.rows[0].normalized.symbol, 'DMAP1');

  commitImport({
    source: 'degiro-csv',
    filename: 'Transactions.csv',
    content,
    rowMappings: { 2: { symbol: 'DMAP1' } },
  });
  assert.equal(Number(getPositionShares('DMAP1', '2026-01-08').toFixed(2)), 3);
});

test('DEGIRO snapshot below ledger is blocked for manual review', async () => {
  seedTestInstrument({
    symbol: 'SLOW1',
    yahooSymbol: 'SLOW1',
    name: 'Snap Low Inc',
    type: 'stock',
    currency: 'USD',
  });
  await createTransaction({ type: 'add', symbol: 'SLOW1', date: '2025-01-10', shares: 3 });

  const content = [
    'Producto,Symbol/ISIN,Cantidad,Precio de,Valor local,,Valor en EUR',
    'SNAP LOW INC,US3333333333,2,"600,00",USD,"1200,00","1020,00"',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Portfolio.csv', content });
  assert.equal(preview.canCommit, false);
  assert.equal(preview.rows[0].status, 'blocked');
  assert.equal(preview.rows[0].reconciliationStatus, 'delta_negative');
  assert.match(preview.rows[0].errors.join(' '), /Snapshot inferior/);
});

test('GET /api/portfolio/performance returns ledger-derived return metrics', async () => {
  const { response, body } = await jsonRequest('/api/portfolio/performance');

  assert.equal(response.status, 200);
  assert.ok(Number.isFinite(body.currentValue));
  assert.ok(Number.isFinite(body.netContributed));
  assert.ok(Number.isFinite(body.commissions));
  assert.ok(Number.isFinite(body.realizedGain));
  assert.ok(Number.isFinite(body.unrealizedGain));
});

test('deleting an automatic transaction prevents same month auto recreation', async () => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const scheduledDate = `${monthKey}-03`;
  const autoKey = `auto:U308:${scheduledDate}`;
  cachePrice('URA', scheduledDate, 52.5, 'USD');

  const transaction =
    getTransactions().find((item) => item.autoKey === autoKey) ||
    (await createTransaction(
      { type: 'add', symbol: 'U308', date: scheduledDate, euros: 10 },
      { origin: 'auto', autoKey },
    ));

  assert.equal(deleteTransaction(transaction.id), true);
  assert.equal(db.prepare('SELECT auto_key FROM auto_plan_skips WHERE auto_key = ?').get(autoKey).auto_key, autoKey);

  const { response } = await jsonRequest('/api/portfolio/summary');
  assert.equal(response.status, 200);
  assert.equal(getTransactions().some((item) => item.autoKey === autoKey), false);
});

test('automatic plans respect startDate before creating monthly transactions', async () => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const scheduledDate = `${monthKey}-03`;
  const autoKey = `auto:NVO:${scheduledDate}`;
  db.prepare('DELETE FROM transactions WHERE auto_key = ?').run(autoKey);
  db.prepare('DELETE FROM auto_plan_skips WHERE auto_key = ?').run(autoKey);
  cachePrice('NOV.DE', scheduledDate, 40);

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'NVO', amountEur: 25, day: 3, frequency: 'monthly', enabled: true, startDate: '2026-06-01' }] }),
  });

  const futureStart = await jsonRequest('/api/portfolio/summary');
  assert.equal(futureStart.response.status, 200);
  assert.equal(getTransactions().some((item) => item.autoKey === autoKey), false);

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [] }),
  });

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'NVO', amountEur: 25, day: 3, frequency: 'monthly', enabled: true, startDate: `${monthKey}-01` }] }),
  });

  const activeStart = await jsonRequest('/api/portfolio/summary');
  assert.equal(activeStart.response.status, 200);
  const created = getTransactions().find((item) => item.autoKey === autoKey);
  assert.ok(created);
  assert.equal(created.origin, 'auto');

  const beforeCount = getTransactions().filter((item) => item.autoKey === autoKey).length;
  await jsonRequest('/api/portfolio/summary');
  const afterCount = getTransactions().filter((item) => item.autoKey === autoKey).length;
  assert.equal(afterCount, beforeCount);
});

test('automatic plans do not duplicate legacy monthly auto keys', async () => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const scheduledDate = `${monthKey}-03`;
  const legacyAutoKey = `auto:${monthKey}:NVO`;
  const newAutoKey = `auto:NVO:${scheduledDate}`;
  db.prepare('DELETE FROM transactions WHERE auto_key IN (?, ?)').run(legacyAutoKey, newAutoKey);
  db.prepare('DELETE FROM auto_plan_skips WHERE auto_key IN (?, ?)').run(legacyAutoKey, newAutoKey);
  await createTransaction(
    { type: 'add', symbol: 'NVO', date: scheduledDate, euros: 25 },
    { origin: 'auto', autoKey: legacyAutoKey },
  );

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'NVO', amountEur: 25, day: 3, frequency: 'monthly', enabled: true, startDate: `${monthKey}-01` }] }),
  });
  await jsonRequest('/api/portfolio/summary');

  assert.equal(getTransactions().filter((item) => item.autoKey === legacyAutoKey).length, 1);
  assert.equal(getTransactions().filter((item) => item.autoKey === newAutoKey).length, 0);
});

test('automatic plans support weekly, biweekly, monthly backfill, and stable auto keys', async () => {
  for (const symbol of ['WEEK1', 'WEEK2', 'BIW1', 'MON1']) {
    seedTestInstrument({ symbol, yahooSymbol: symbol, name: symbol, type: 'etf' });
    db.prepare('DELETE FROM transactions WHERE symbol = ?').run(symbol);
  }

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoPlans: [
        { symbol: 'WEEK1', amountEur: 10, frequency: 'weekly', weekday: 3, enabled: true, startDate: '2026-05-07' },
        { symbol: 'WEEK2', amountEur: 10, frequency: 'weekly', weekday: 3, enabled: true, startDate: '2026-05-06' },
        { symbol: 'BIW1', amountEur: 10, frequency: 'biweekly', weekday: 3, enabled: true, startDate: '2026-04-22' },
        { symbol: 'MON1', amountEur: 10, frequency: 'monthly', day: 3, enabled: true, startDate: '2026-01-01' },
      ],
    }),
  });

  const firstRun = await jsonRequest('/api/portfolio/summary');
  assert.equal(firstRun.response.status, 200);

  const autoKeys = getTransactions()
    .filter((transaction) => ['WEEK1', 'WEEK2', 'BIW1', 'MON1'].includes(transaction.symbol))
    .map((transaction) => transaction.autoKey)
    .sort();
  assert.ok(autoKeys.includes('auto:WEEK1:2026-05-13'));
  assert.ok(autoKeys.includes('auto:WEEK2:2026-05-06'));
  assert.ok(autoKeys.includes('auto:WEEK2:2026-05-13'));
  assert.ok(autoKeys.includes('auto:BIW1:2026-04-22'));
  assert.ok(autoKeys.includes('auto:BIW1:2026-05-06'));
  assert.ok(autoKeys.includes('auto:MON1:2026-01-03'));
  assert.ok(autoKeys.includes('auto:MON1:2026-05-03'));
  assert.equal(autoKeys.filter((key) => key.startsWith('auto:MON1:')).length, 5);

  const beforeCount = autoKeys.length;
  await jsonRequest('/api/portfolio/summary');
  const afterCount = getTransactions()
    .filter((transaction) => ['WEEK1', 'WEEK2', 'BIW1', 'MON1'].includes(transaction.symbol))
    .length;
  assert.equal(afterCount, beforeCount);
});

test('onboarding wizard preview is read-only and commit is atomic', async () => {
  const payload = {
    group: { name: 'Wizard Atomic', color: '#16a34a', showInDistribution: true, showInMonthly: true, isExpandable: false },
    instrument: { symbol: 'WIZA', yahooSymbol: 'WIZA', name: 'Wizard Asset', type: 'etf', currency: 'EUR', color: '#2563eb' },
    transaction: { enabled: true, date: '2026-05-10', euros: 100, commissionEur: 1 },
    autoPlan: { enabled: true, amountEur: 25, frequency: 'monthly', day: 3, startDate: '2026-05-01' },
  };
  const preview = await jsonRequest('/api/onboarding/wizard/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE symbol = 'WIZA'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM instrument_groups WHERE name = 'Wizard Atomic'").get().count, 0);

  const commit = await jsonRequest('/api/onboarding/wizard/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(commit.response.status, 201);
  assert.equal(getPositionShares('WIZA') > 0, true);
  assert.equal(db.prepare("SELECT frequency FROM auto_plans WHERE symbol = 'WIZA'").get().frequency, 'monthly');

  const badPayload = {
    group: { name: 'Wizard Rollback', color: '#16a34a' },
    instrument: { symbol: 'WIZB', yahooSymbol: 'WIZB', name: 'Wizard Bad', type: 'etf', currency: 'EUR', color: '#2563eb' },
    autoPlan: { enabled: true, amountEur: 25, frequency: 'weekly', weekday: 9, startDate: '2026-05-01' },
  };
  const failed = await jsonRequest('/api/onboarding/wizard/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(badPayload),
  });
  assert.equal(failed.response.status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE symbol = 'WIZB'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM instrument_groups WHERE name = 'Wizard Rollback'").get().count, 0);
});

test('portfolio history applies adaptive granularity and returns events', async () => {
  const ytd = await buildPortfolioHistory('ytd');
  const oneYear = await buildPortfolioHistory('1y');
  const twoYears = await buildPortfolioHistory('2y');
  const fiveYears = await buildPortfolioHistory('5y');
  const all = await buildPortfolioHistory('all');

  assert.equal(ytd.granularity, 'daily');
  assert.equal(oneYear.granularity, 'daily');
  assert.equal(twoYears.granularity, 'weekly');
  assert.equal(fiveYears.granularity, 'weekly');
  assert.equal(all.granularity, 'weekly');
  assert.ok(all.series.length > 0);
  assert.ok(all.series.every((point) => Number.isFinite(point.contributed)));
  assert.ok(all.events.some((event) => event.type === 'add'));
  assert.ok(all.events.some((event) => event.type === 'remove'));
  assert.ok(all.series[0].date >= all.from);
  assert.ok(all.events[0].plotDate >= all.events[0].date);
  assert.equal(all.meta.status, 'ready');
});

test('portfolio history stores persistent materialized values and positions', async () => {
  db.exec('DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM portfolio_events; DELETE FROM history_builds; DELETE FROM history_invalidations;');

  const first = await buildPortfolioHistory('5y');
  const buildRow = db.prepare("SELECT status, points FROM history_builds WHERE build_key = 'portfolio_daily'").get();
  const valueCount = db.prepare('SELECT COUNT(*) AS count FROM portfolio_value_daily').get().count;
  const weeklyCount = db.prepare('SELECT COUNT(*) AS count FROM portfolio_value_weekly').get().count;
  const positionCount = db.prepare('SELECT COUNT(*) AS count FROM portfolio_positions_daily').get().count;
  const second = await buildPortfolioHistory('5y');

  assert.equal(buildRow.status, 'ready');
  assert.ok(buildRow.points > 0);
  assert.deepEqual(second.series, first.series);
  assert.ok(valueCount > 0);
  assert.ok(weeklyCount > 0);
  assert.ok(positionCount > 0);
  assert.equal(second.meta.cached, true);
});

test('ledger writes invalidate materialized portfolio history versions', async () => {
  db.exec('DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM history_builds; DELETE FROM history_invalidations;');
  await buildPortfolioHistory('5y');
  const before = db.prepare("SELECT ledger_version AS version FROM history_builds WHERE build_key = 'portfolio_daily'").get();

  cachePrice('NOV.DE', '2026-05-16', 40);
  const transaction = await createTransaction({ type: 'add', symbol: 'NVO', date: '2026-05-16', shares: 1 });
  assert.ok(db.prepare("SELECT 1 FROM history_invalidations WHERE reason = 'transaction-create'").get());
  await buildPortfolioHistory('5y');
  const after = db.prepare("SELECT ledger_version AS version FROM history_builds WHERE build_key = 'portfolio_daily'").get();

  assert.ok(after.version > before.version);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM history_invalidations').get().count, 0);
  assert.equal(deleteTransaction(transaction.id), true);
});

test('portfolio history materialized cache survives server restart and hard reload style requests', async () => {
  db.exec('DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM portfolio_events; DELETE FROM history_builds; DELETE FROM history_invalidations;');
  const before = await jsonRequest('/api/portfolio/history?range=5y');
  assert.equal(before.response.status, 200);
  assert.ok(db.prepare("SELECT 1 FROM history_builds WHERE build_key = 'portfolio_daily' AND status = 'ready'").get());

  await stopTestServer();
  await startTestServer();

  const started = performance.now();
  const after = await jsonRequest('/api/portfolio/history?range=5y', {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  });
  const elapsed = performance.now() - started;

  assert.equal(after.response.status, 200);
  assert.deepEqual(after.body.series, before.body.series);
  assert.deepEqual(after.body.events, before.body.events);
  assert.ok(elapsed < 300, `cached restart response took ${elapsed}ms`);
});

test('GET /api/diagnostics/performance reports cache and timing data', async () => {
  const { response, body } = await jsonRequest('/api/diagnostics/performance');

  assert.equal(response.status, 200);
  assert.ok(Number.isFinite(body.versions.ledgerVersion));
  assert.ok(Number.isFinite(body.versions.priceVersion));
  assert.ok(body.counts.portfolioValueDaily >= 1);
  assert.ok(body.counts.portfolioValueWeekly >= 1);
  assert.ok(body.counts.portfolioPositionsDaily >= 1);
  assert.ok(body.counts.historyBuilds >= 1);
  assert.ok(Number.isFinite(body.database.bytes));
  assert.ok(Number.isFinite(body.invalidations.pending));
  assert.ok(body.ranges['5y'].ms < 300);
  assert.equal(body.ranges['5y'].granularity, 'weekly');
});

test('portfolio history persists daily prices and FX cache', async () => {
  db.exec('DELETE FROM daily_price_cache; DELETE FROM daily_price_cache_ranges; DELETE FROM market_prices_daily; DELETE FROM fx_rates_daily; DELETE FROM portfolio_value_weekly; DELETE FROM history_builds; DELETE FROM history_invalidations;');
  const priceVersion = Number(db.prepare("SELECT value FROM app_meta WHERE key = 'price_version'").get().value);
  db.prepare("UPDATE app_meta SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'price_version'").run(
    String(priceVersion + 1),
  );
  const beforePrices = db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache').get().count;
  const beforeRanges = db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache_ranges').get().count;

  await buildPortfolioHistory('all');
  await buildPortfolioHistory('all');

  const afterPrices = db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache').get().count;
  const afterRanges = db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache_ranges').get().count;
  const fxRows = db
    .prepare("SELECT COUNT(*) AS count FROM daily_price_cache WHERE yahoo_symbol = 'USDEUR=X'")
    .get().count;
  const marketRows = db.prepare('SELECT COUNT(*) AS count FROM market_prices_daily').get().count;
  const fxMaterializedRows = db.prepare('SELECT COUNT(*) AS count FROM fx_rates_daily').get().count;

  assert.ok(afterPrices > beforePrices);
  assert.ok(afterRanges >= beforeRanges);
  assert.ok(fxRows > 0);
  assert.ok(marketRows > 0);
  assert.ok(fxMaterializedRows > 0);
});

test('GET /api/portfolio/summary returns calculated portfolio data', async () => {
  const { response, body } = await jsonRequest('/api/portfolio/summary');

  assert.equal(response.status, 200);
  assert.ok(Number.isFinite(body.total));
  assert.ok(Array.isArray(body.portfolio));
  assert.ok(Array.isArray(body.stockPositions));
});

test('GET /api/portfolio/monthly returns monthly rows and skips future months', async () => {
  const { response, body } = await jsonRequest('/api/portfolio/monthly?year=2026');
  const currentMonth = new Date().getMonth() + 1;

  assert.equal(response.status, 200);
  assert.equal(body.rows.length, currentMonth);
  assert.equal(body.months.length, currentMonth);
  assert.ok(Array.isArray(body.columns));
  assert.ok(body.summary);
  assert.ok(Number.isFinite(body.summary.currentValue));
  assert.ok(Number.isFinite(body.summary.netContributed));
  assert.ok(Number.isFinite(body.summary.resultYtd));
  assert.equal(body.columns.some((column) => /World valor|China valor|U308/.test(column.label)), false);
  assert.equal(body.months.some((month) => month.month > currentMonth), false);
  assert.equal(body.months.some((month) => month.total === null), false);
  assert.equal(body.rows.some((row) => row.total === null), false);
});

test('monthly tracking ignores zero-value groups and zero-share instruments', async () => {
  db.prepare(
    `INSERT OR REPLACE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES ('zero-monthly-test', 'Zero Monthly Test', '#64748b', 900, 1, 1, 0, 1)`,
  ).run();
  db.prepare(
    `INSERT OR REPLACE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES ('mixed-monthly-test', 'Mixed Monthly Test', '#0d9488', 901, 1, 1, 0, 1)`,
  ).run();
  db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order, show_in_monthly)
     VALUES (?, ?, ?, 'stock', 'EUR', ?, 0, 0, 1, ?, ?, 1)`,
  ).run('ZERO0', 'ZERO0.DE', 'Zero Position', '#64748b', 'zero-monthly-test', 900);
  db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order, show_in_monthly)
     VALUES (?, ?, ?, 'stock', 'EUR', ?, 0, 0, 1, ?, ?, 1)`,
  ).run('MIX1', 'MIX1.DE', 'Mixed Valued', '#0d9488', 'mixed-monthly-test', 901);
  db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order, show_in_monthly)
     VALUES (?, ?, ?, 'stock', 'EUR', ?, 0, 0, 1, ?, ?, 1)`,
  ).run('MIX0', 'MIX0.DE', 'Mixed Zero', '#94a3b8', 'mixed-monthly-test', 902);
  cachePrice('MIX1.DE', '2026-01-02', 20);
  cachePrice('MIX1.DE', '2026-01-03', 22);
  await createTransaction({
    id: 'monthly-effective-position',
    type: 'add',
    symbol: 'MIX1',
    date: '2026-01-02',
    shares: 1,
  });

  const monthly = await buildMonthly(2026);
  const zeroColumn = monthly.columns.find((column) => column.id === 'zero-monthly-test');
  const mixedColumn = monthly.columns.find((column) => column.id === 'mixed-monthly-test');
  const january = monthly.rows.find((row) => row.month === 1);
  const januaryInsight = monthly.months.find((row) => row.month === 1);
  const mixedCell = january.cells['mixed-monthly-test'];

  assert.equal(zeroColumn, undefined);
  assert.ok(mixedColumn);
  assert.equal(mixedCell.positions.length, 1);
  assert.equal(mixedCell.positions[0].symbol, 'MIX1');
  assert.equal(mixedCell.positions.some((position) => position.symbol === 'MIX0'), false);
  assert.equal(januaryInsight.groups.some((group) => group.id === 'zero-monthly-test'), false);
  assert.equal(januaryInsight.groups.some((group) => group.positions.some((position) => position.symbol === 'MIX0')), false);
});

test('GET /api/portfolio/history works for every range', async () => {
  for (const [range, granularity] of [
    ['ytd', 'daily'],
    ['1y', 'daily'],
    ['2y', 'weekly'],
    ['5y', 'weekly'],
    ['all', 'weekly'],
  ]) {
    const { response, body } = await jsonRequest(`/api/portfolio/history?range=${range}`);

    assert.equal(response.status, 200);
    assert.equal(body.range, range);
    assert.equal(body.granularity, granularity);
    assert.ok(Array.isArray(body.series));
    assert.ok(Array.isArray(body.events));
  }
});

test('portfolio history handles five years of synthetic monthly operations from SQLite cache', async () => {
  seedSyntheticHistory({ symbols: 12 });

  const firstStarted = performance.now();
  const first = await buildPortfolioHistory('5y');
  const firstElapsed = performance.now() - firstStarted;
  const secondStarted = performance.now();
  const second = await buildPortfolioHistory('5y');
  const secondElapsed = performance.now() - secondStarted;
  const all = await buildPortfolioHistory('all');
  const ytd = await buildPortfolioHistory('ytd');

  assert.ok(first.series.length > 150, `expected many weekly points, got ${first.series.length}`);
  assert.ok(first.events.length >= 180, `expected synthetic events, got ${first.events.length}`);
  assert.deepEqual(second.series, first.series);
  assert.equal(second.meta.cached, true);
  assert.ok(secondElapsed < 300, `warm synthetic history took ${secondElapsed}ms after ${firstElapsed}ms cold build`);
  assert.equal(all.granularity, 'weekly');
  assert.equal(ytd.granularity, 'daily');
  assert.ok(all.events.some((event) => event.date === '2021-06-12'));
});

test('loadtest dataset covers real stock tickers, range event boundaries, and cached history performance', async () => {
  const result = seedLoadtestDb(db, { from: '2023-01-01', to: '2026-05-16' });
  assert.ok(result.transactions >= 100);
  assert.ok(result.prices > 9000);

  const started = performance.now();
  const first = await buildPortfolioHistory('5y');
  const firstElapsed = performance.now() - started;
  const secondStarted = performance.now();
  const second = await buildPortfolioHistory('5y');
  const secondElapsed = performance.now() - secondStarted;
  const ytd = await buildPortfolioHistory('ytd');
  const all = await buildPortfolioHistory('all');

  for (const history of [first, second, ytd, all]) {
    assert.ok(history.events.every((event) => event.plotDate >= history.from), `${history.range} has no early events`);
    assert.ok(history.events.every((event) => event.plotDate <= history.to), `${history.range} has no late events`);
    if (history.events.length) {
      const expectedFirstEvent = getTransactions()
        .filter((transaction) => (transaction.marketDate || transaction.date) >= history.from)
        .sort((a, b) => (a.marketDate || a.date).localeCompare(b.marketDate || b.date))[0];
      assert.equal(history.events[0].id, expectedFirstEvent.id);
    }
  }

  assert.ok(first.events.some((event) => event.symbol === 'NVO'));
  assert.ok(first.events.some((event) => event.symbol === 'GOOG'));
  assert.ok(first.events.some((event) => event.symbol === 'META'));
  assert.ok(first.events.some((event) => event.symbol === 'SPPW'));
  assert.ok(first.events.some((event) => event.symbol === 'SEMI'));
  assert.ok(first.events.some((event) => event.type === 'remove'));
  assert.equal(db.prepare("SELECT frequency FROM auto_plans WHERE symbol = 'SEMI'").get().frequency, 'monthly');
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'SEMI' AND origin = 'auto'").get().count >= 24);
  assert.deepEqual(second.series, first.series);
  assert.equal(second.meta.cached, true);
  assert.ok(secondElapsed < 300, `warm 5y loadtest history took ${secondElapsed}ms after ${firstElapsed}ms cold build`);
  assert.ok(ytd.series[0].date >= ytd.from);
  assert.equal(all.series[0].date, all.from);
});

test('portfolio history uses SQLite daily cache when Yahoo is unavailable', async () => {
  seedLoadtestDb(db, { from: '2023-01-01', to: '2026-05-16' });
  db.exec('DELETE FROM daily_price_cache_ranges; DELETE FROM history_builds; DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM portfolio_events; DELETE FROM history_invalidations;');
  const previousFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('network down');
  };

  try {
    const history = await buildPortfolioHistory('all');
    const secondStarted = performance.now();
    const cachedHistory = await buildPortfolioHistory('all');
    const secondElapsed = performance.now() - secondStarted;

    assert.ok(history.series.length > 100);
    assert.ok(history.events.length >= 100);
    assert.equal(cachedHistory.meta.cached, true);
    assert.deepEqual(cachedHistory.series, history.series);
    assert.ok(secondElapsed < 300, `warm cache fallback history took ${secondElapsed}ms`);
  } finally {
    global.fetch = previousFetch;
  }
});

test('YTD history starts at the range axis before the first operation', async () => {
  seedLoadtestDb(db, { from: '2026-01-01', to: '2026-05-16' });
  db.exec(`
    DELETE FROM transactions;
    DELETE FROM auto_plans;
    DELETE FROM history_builds;
    DELETE FROM portfolio_value_daily;
    DELETE FROM portfolio_value_weekly;
    DELETE FROM portfolio_positions_daily;
    DELETE FROM portfolio_events;
    DELETE FROM history_invalidations;
  `);
  bumpTestMeta('ledger_version');
  db.prepare(
    `INSERT INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin, auto_key)
     VALUES ('axis-start-buy', 'add', 'NVO', 'Novo Nordisk', '2026-01-03', '2026-01-03', 2, 100, 50, 'EUR', 1, '#0d9488', 'manual', NULL)`,
  ).run();

  const ytd = await buildPortfolioHistory('ytd');

  assert.equal(ytd.from, '2026-01-01');
  assert.equal(ytd.series[0].date, '2026-01-01');
  assert.equal(ytd.series[0].value, 0);
  assert.equal(ytd.events[0].plotDate, '2026-01-03');
  assert.equal(ytd.events[0].id, 'axis-start-buy');
});

test('GET /api/state returns persisted state metadata', async () => {
  const { response, body } = await jsonRequest('/api/state');

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.transactions));
  assert.ok(Array.isArray(body.autoPlans));
  assert.ok(body.dbPath.endsWith('portfolio.sqlite'));
});

test('GET /api/quote returns a quote', async () => {
  cachePrice('ICGA.DE', '2026-05-14', 5.12);
  const { response, body } = await jsonRequest('/api/quote?symbol=ICGA&date=2026-05-14');

  assert.equal(response.status, 200);
  assert.equal(body.quote.symbol, 'ICGA');
  assert.equal(body.quote.price, 5.12);
});

test('unknown API endpoints return 404 JSON', async () => {
  const { response, body } = await jsonRequest('/api/unknown');

  assert.equal(response.status, 404);
  assert.equal(body.error, 'Not found');
});
