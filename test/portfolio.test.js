const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { seedLoadtestDb } = require('../scripts/loadtest-data');
const appInfo = require('../version.json');
const packageInfo = require('../package.json');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-dashboard-'));
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
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, usd_to_eur, color, origin, auto_key)
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

test('database includes scalability indexes and persistent history tables', () => {
  const expectedObjects = [
    'idx_transactions_symbol_date_created',
    'idx_transactions_date_created',
    'idx_transactions_origin_auto_key',
    'idx_instruments_type_active',
    'app_meta',
    'portfolio_history_cache',
    'portfolio_snapshots',
    'idx_portfolio_snapshots_range_date',
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
  assert.ok(Array.isArray(body.columns));
  assert.equal(body.columns.some((column) => /World valor|China valor|U308/.test(column.label)), false);
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
  const mixedCell = january.cells['mixed-monthly-test'];

  assert.equal(zeroColumn, undefined);
  assert.ok(mixedColumn);
  assert.equal(mixedCell.positions.length, 1);
  assert.equal(mixedCell.positions[0].symbol, 'MIX1');
  assert.equal(mixedCell.positions.some((position) => position.symbol === 'MIX0'), false);
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
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, usd_to_eur, color, origin, auto_key)
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
