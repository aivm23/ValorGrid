const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { MOVIMIENTOS_HEADERS } = require('../src/domains/data-ingestion/template-generator');
const {
  assert,
  appInfo,
  db,
  createTransaction,
  deleteTransaction,
  getPositionShares,
  getTransactions,
  getQuoteForSymbol,
  cachePrice,
  seedTestInstrument,
  readWorkbook,
  worksheetRows,
  request,
  jsonRequest,
  registerLifecycle,
} = require('./integration-helpers');

registerLifecycle(test);
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
  assert.equal(body.edition, 'community');
});

test('API version matches package.json', async () => {
  const { body } = await jsonRequest('/api/version');

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

// Restore endpoint disabled: restore from backups is not available
/*
test('POST /api/backups/:file/restore validates backup, creates pre-restore, and restores DB state', async () => {
  const create = await jsonRequest('/api/backups', { method: 'POST' });
  assert.equal(create.response.status, 201);
  const backupFile = create.body.backup.file;

  const restore = await jsonRequest(`/api/backups/${encodeURIComponent(backupFile)}/restore`, { method: 'POST' });
  assert.equal(restore.response.status, 200);
  assert.equal(restore.body.ok, true);
  assert.ok(restore.body.restoredFile);
  assert.equal(restore.body.restoredFile, backupFile);
  assert.ok(restore.body.preRestoreBackup);
  assert.ok(restore.body.preRestoreBackup.startsWith('pre-restore-'));
  assert.notEqual(restore.body.preRestoreBackup, backupFile);

  const list = await jsonRequest('/api/backups');
  assert.ok(list.body.backups.some((b) => b.file === restore.body.preRestoreBackup));

  const tempBackupDir = path.join(path.dirname(path.dirname(process.env.PORTFOLIO_DB_PATH)), 'backups');
  const preRestorePath = path.join(tempBackupDir, restore.body.preRestoreBackup);
  assert.ok(fs.existsSync(preRestorePath), 'pre-restore backup should exist on disk');
  fs.rmSync(preRestorePath, { force: true });
  fs.rmSync(path.join(tempBackupDir, backupFile), { force: true });
});

test('POST /api/backups/:file/restore rejects invalid file names', async () => {
  const { response, body } = await jsonRequest('/api/backups/..%2F..%2Fetc%2Fpasswd.sqlite/restore', { method: 'POST' });
  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('POST /api/backups/:file/restore rejects non-existent backups', async () => {
  const { response, body } = await jsonRequest('/api/backups/nonexistent-file.sqlite/restore', { method: 'POST' });
  assert.equal(response.status, 404);
  assert.ok(body.error);
});

*/

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

test('export endpoint returns ledger XLSX in ValorGrid template format', async () => {
  seedTestInstrument({ symbol: 'XLSXEXP', yahooSymbol: 'XLSXEXP', name: 'Export XLSX', type: 'stock', currency: 'USD' });
  db.prepare(
    `INSERT OR REPLACE INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur,
       commission_eur, cash_flow_eur, color, origin, external_id)
     VALUES
      ('export-xlsx-buy', 'add', 'XLSXEXP', 'Export XLSX', '2026-06-01', '2026-06-01', 2, 180, 100, 'USD', 0.9,
       1.5, -181.5, '#0d9488', 'manual', 'broker-ref-001'),
      ('export-xlsx-sell', 'remove', 'XLSXEXP', 'Export XLSX', '2026-06-02', '2026-06-02', 1, 95, 100, 'USD', 0.95,
       0.5, 94.5, '#0d9488', 'manual', NULL)`,
  ).run();

  const response = await request('/api/export/transactions.xlsx');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(response.headers.get('content-disposition').includes('ValorGrid_Movimientos.xlsx'));

  const workbook = await readWorkbook(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Movimientos']);
  const rows = worksheetRows(workbook.getWorksheet('Movimientos'), MOVIMIENTOS_HEADERS.length);
  assert.deepEqual(rows[0], MOVIMIENTOS_HEADERS);

  const buy = rows.find((row) => row[9] === 'broker-ref-001');
  const sell = rows.find((row) => row[9] === 'export-xlsx-sell');
  assert.deepEqual(buy, ['compra', '2026-06-01', 'XLSXEXP', 2, 100, 'USD', 0.9, 180, 1.5, 'broker-ref-001']);
  assert.deepEqual(sell, ['venta', '2026-06-02', 'XLSXEXP', -1, 100, 'USD', 0.95, 95, 0.5, 'export-xlsx-sell']);
});

test('legacy CSV and JSON export endpoints are no longer available', async () => {
  const json = await jsonRequest('/api/export/transactions.json');
  assert.equal(json.response.status, 404);
  assert.equal(json.body.error, 'Not found');

  const csv = await jsonRequest('/api/export/transactions.csv');
  assert.equal(csv.response.status, 404);
  assert.equal(csv.body.error, 'Not found');
});

test('legacy export helpers and toolbar ids are removed from source', () => {
  const legacyCsvHelper = ['buildTransactions', 'Csv'].join('');
  const legacyCsvToolbar = ['toolbar', 'export', 'csv'].join('-');
  const legacyJsonToolbar = ['toolbar', 'export', 'json'].join('-');
  const files = [
    'src/app.js',
    'src/route-service-bindings.js',
    'src/domains/admin/diagnostics-service.js',
    'src/domains/admin/route-admin.js',
    'client/dom.js',
    'index.html',
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.equal(source.includes(legacyCsvHelper), false, `${file} should not reference CSV helper`);
    assert.equal(source.includes(legacyCsvToolbar), false, `${file} should not reference CSV toolbar id`);
    assert.equal(source.includes(legacyJsonToolbar), false, `${file} should not reference JSON toolbar id`);
  }
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

test('manual unit price: buy with shares + unitPrice uses manual price for valueEur', async () => {
  seedTestInstrument({ symbol: 'U3O8', yahooSymbol: 'U3O8', name: 'S&P 500', type: 'stock', currency: 'EUR' });

  const transaction = await createTransaction({
    type: 'add',
    symbol: 'U3O8',
    date: '2026-05-06',
    shares: 3,
    unitPrice: 11.99,
    commissionEur: 0,
  });

  assert.equal(transaction.symbol, 'U3O8');
  assert.equal(transaction.shares, 3);
  assert.equal(Number(transaction.valueEur.toFixed(2)), 35.97);
  assert.equal(transaction.price, 11.99);
  assert.equal(transaction.currency, 'EUR');
  assert.equal(Number(transaction.commissionEur.toFixed(2)), 0);
  assert.equal(Number(transaction.cashFlowEur.toFixed(2)), -35.97);
  assert.equal(getPositionShares('U3O8', '2026-05-06'), 3);
});

test('manual unit price preview: POST /api/transactions/preview with unitPrice', async () => {
  seedTestInstrument({ symbol: 'U3O8P', yahooSymbol: 'U3O8P', name: 'S&P 500 Preview', type: 'stock', currency: 'EUR' });
  const before = getTransactions().length;

  const { response, body } = await jsonRequest('/api/transactions/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'add',
      symbol: 'U3O8P',
      date: '2026-05-06',
      shares: 3,
      unitPrice: 11.99,
      commissionEur: 0,
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.preview.symbol, 'U3O8P');
  assert.equal(Number(body.preview.valueEur.toFixed(2)), 35.97);
  assert.equal(body.preview.manualUnitPrice, true);
  assert.equal(Number(body.preview.cashFlowEur.toFixed(2)), -35.97);
  assert.equal(getTransactions().length, before);
});

test('manual unit price regression: shares without unitPrice uses market price', async () => {
  seedTestInstrument({ symbol: 'MRKT', yahooSymbol: 'MRKT', name: 'Market Test', type: 'stock', currency: 'EUR' });
  cachePrice('MRKT', '2026-05-14', 12.29);

  const transaction = await createTransaction({
    type: 'add',
    symbol: 'MRKT',
    date: '2026-05-14',
    shares: 3,
    commissionEur: 0,
  });

  assert.equal(transaction.symbol, 'MRKT');
  assert.equal(transaction.shares, 3);
  assert.equal(Number(transaction.valueEur.toFixed(2)), 36.87);
  assert.equal(transaction.price, 12.29);
  assert.equal(transaction.currency, 'EUR');
});

test('manual unit price validation: unitPrice without shares returns 400', async () => {
  seedTestInstrument({ symbol: 'VAL1', yahooSymbol: 'VAL1', name: 'Validation 1', type: 'stock', currency: 'EUR' });

  const { response, body } = await jsonRequest('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'add',
      symbol: 'VAL1',
      date: '2026-05-14',
      unitPrice: 11.99,
    }),
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /unitPrice requires shares/i);
});

test('manual unit price validation: unitPrice with euros returns 400', async () => {
  seedTestInstrument({ symbol: 'VAL2', yahooSymbol: 'VAL2', name: 'Validation 2', type: 'stock', currency: 'EUR' });

  const { response, body } = await jsonRequest('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'add',
      symbol: 'VAL2',
      date: '2026-05-14',
      euros: 100,
      unitPrice: 11.99,
    }),
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /unitPrice cannot be combined with euros/i);
});

test('manual unit price validation: negative unitPrice returns 400', async () => {
  seedTestInstrument({ symbol: 'VAL3', yahooSymbol: 'VAL3', name: 'Validation 3', type: 'stock', currency: 'EUR' });

  const { response, body } = await jsonRequest('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'add',
      symbol: 'VAL3',
      date: '2026-05-14',
      shares: 3,
      unitPrice: -1,
    }),
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /unitPrice must be a positive number/i);
});

test('manual unit price non-EUR: USD instrument with FX', async () => {
  seedTestInstrument({ symbol: 'USDTST', yahooSymbol: 'USDTST', name: 'USD Test', type: 'stock', currency: 'USD' });
  cachePrice('USDEUR=X', '2026-05-14', 0.9);

  const transaction = await createTransaction({
    type: 'add',
    symbol: 'USDTST',
    date: '2026-05-14',
    shares: 2,
    unitPrice: 10,
    commissionEur: 0,
  });

  assert.equal(transaction.symbol, 'USDTST');
  assert.equal(transaction.shares, 2);
  assert.equal(transaction.currency, 'USD');
  assert.equal(Number(transaction.fxToEur.toFixed(2)), 0.9);
  assert.equal(Number(transaction.valueEur.toFixed(2)), 18);
  assert.equal(Number(transaction.cashFlowEur.toFixed(2)), -18);
});

