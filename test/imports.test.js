const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../vendor/xlsx.full.min.js');
const {
  assert,
  db,
  getPositionShares,
  previewImport,
  commitImport,
  seedTestInstrument,
  createWorkbookBase64,
  jsonRequest,
  request,
  registerLifecycle,
} = require('./integration-helpers');

registerLifecycle(test);

function valorGridWorkbook(rows, sheetName = 'Movimientos') {
  return createWorkbookBase64({
    [sheetName]: [
      ['Tipo', 'Fecha', 'Ticker', 'Acciones', 'Precio', 'Divisa', 'FX a EUR', 'Valor EUR', 'Comision EUR', 'Referencia'],
      ...rows,
    ],
  });
}

test('valorgrid-xlsx import preview is read-only and commit is atomic and idempotent', () => {
  seedTestInstrument({ symbol: 'IMPA', yahooSymbol: 'IMPA', name: 'Import A', type: 'stock', currency: 'EUR' });
  const contentBase64 = valorGridWorkbook([['compra', '2026-01-10', 'IMPA', 2, 10, 'EUR', 1, 20, 1, 'imp-a-1']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', filename: 'import-test.xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(getPositionShares('IMPA', '2026-01-10'), 0);

  const committed = commitImport({ source: 'valorgrid-xlsx', filename: 'import-test.xlsx', contentBase64 });
  assert.equal(committed.summary.buys, 1);
  assert.equal(getPositionShares('IMPA', '2026-01-10'), 2);

  const repeated = commitImport({ source: 'valorgrid-xlsx', filename: 'import-test.xlsx', contentBase64 });
  assert.equal(repeated.summary.buys, 1);
  assert.equal(getPositionShares('IMPA', '2026-01-10'), 2);
});

test('valorgrid-xlsx import impact and commit use only selected rows', () => {
  seedTestInstrument({ symbol: 'IMPS1', yahooSymbol: 'IMPS1', name: 'Import Selected One', type: 'stock', currency: 'EUR' });
  seedTestInstrument({ symbol: 'IMPS2', yahooSymbol: 'IMPS2', name: 'Import Selected Two', type: 'stock', currency: 'EUR' });
  const contentBase64 = valorGridWorkbook([
    ['compra', '2026-01-11', 'IMPS1', 1, 10, 'EUR', 1, 10, 0, 'selected-1'],
    ['compra', '2026-01-11', 'IMPS2', 3, 20, 'EUR', 1, 60, 0, 'selected-2'],
  ]);

  const preview = previewImport({
    source: 'valorgrid-xlsx',
    contentBase64,
    rowActions: { 3: 'skip' },
  });
  assert.equal(preview.summary.buys, 1);
  assert.equal(preview.impactPreview.instruments.length, 1);

  commitImport({
    source: 'valorgrid-xlsx',
    contentBase64,
    rowActions: { 3: 'skip' },
  });
  assert.equal(getPositionShares('IMPS1', '2026-01-11'), 1);
  assert.equal(getPositionShares('IMPS2', '2026-01-11'), 0);
});

test('valorgrid-xlsx import skips sells that would break future ledger positions', async () => {
  seedTestInstrument({ symbol: 'IMPD', yahooSymbol: 'IMPD', name: 'Import D', type: 'stock', currency: 'EUR' });
  await db
    .prepare(
      `INSERT INTO transactions
        (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin, auto_key)
       VALUES ('future-import-position', 'add', 'IMPD', 'Import D', '2026-02-10', '2026-02-10', 1, 10, 10, 'EUR', 1, '#0d9488', 'manual', NULL)`,
    )
    .run();
  const contentBase64 = valorGridWorkbook([['venta', '2026-01-10', 'IMPD', 1, 10, 'EUR', 1, 10, 0, 'historic-sell']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'skipped');
  assert.equal(preview.rows[0].blockReasonCode, 'existing_empty_position');
});

test('valorgrid-xlsx import API exposes preview, commit, list, detail and rollback', async () => {
  seedTestInstrument({ symbol: 'IMPC', yahooSymbol: 'IMPC', name: 'Import C', type: 'stock', currency: 'EUR' });
  const contentBase64 = valorGridWorkbook([['compra', '2026-01-12', 'IMPC', 4, 5, 'EUR', 1, 20, 0, 'api-import-1']]);
  const payload = { source: 'valorgrid-xlsx', filename: 'api-import.xlsx', contentBase64 };

  const preview = await jsonRequest('/api/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.preview.canCommit, true);

  const commit = await jsonRequest('/api/import/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(commit.response.status, 201);
  assert.equal(getPositionShares('IMPC', '2026-01-12'), 4);

  const list = await jsonRequest('/api/import/batches');
  assert.equal(list.response.status, 200);
  const batch = list.body.batches.find((item) => item.filename === 'api-import.xlsx');
  assert.ok(batch);

  const detail = await jsonRequest(`/api/import/batches/${encodeURIComponent(batch.id)}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.rows.length, 1);

  const rollback = await jsonRequest(`/api/import/batches/${encodeURIComponent(batch.id)}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(rollback.response.status, 200);
  assert.equal(getPositionShares('IMPC', '2026-01-12'), 0);
});

test('valorgrid-xlsx import supports sheet selection and atomic commit', () => {
  seedTestInstrument({ symbol: 'IMXE', yahooSymbol: 'IMXE', name: 'Import XLSX', type: 'stock', currency: 'EUR' });
  const contentBase64 = createWorkbookBase64({
    Instrucciones: [['No importar'], ['foo']],
    Movimientos: [
      ['Tipo', 'Fecha', 'Ticker', 'Acciones', 'Precio', 'Divisa', 'FX a EUR', 'Valor EUR', 'Comision EUR', 'Referencia'],
      ['compra', '2026-03-01', 'IMXE', 5, 3, 'EUR', 1, 15, 0, 'sheet-import-1'],
    ],
  });

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64, sheetName: 'Movimientos' });
  assert.equal(preview.selectedSheet, 'Movimientos');
  assert.equal(preview.canCommit, true);
  commitImport({ source: 'valorgrid-xlsx', contentBase64, sheetName: 'Movimientos' });
  assert.equal(getPositionShares('IMXE', '2026-03-01'), 5);
});

test('valorgrid-xlsx import with non-EUR currency uses explicit FX to EUR', () => {
  seedTestInstrument({ symbol: 'IMUSD', yahooSymbol: 'IMUSD', name: 'Import USD', type: 'stock', currency: 'USD' });
  const contentBase64 = valorGridWorkbook([['compra', '2026-04-01', 'IMUSD', 2, 10, 'USD', 0.9, 18, 1, 'usd-import-1']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].normalized.fxToEur, 0.9);
  assert.equal(preview.rows[0].normalized.cashFlowEur, -19);
  commitImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(getPositionShares('IMUSD', '2026-04-01'), 2);
});

test('valorgrid-xlsx import rejects non-EUR trades without FX to EUR', () => {
  seedTestInstrument({ symbol: 'IMFXR', yahooSymbol: 'IMFXR', name: 'Import FX Required', type: 'stock', currency: 'USD' });
  const contentBase64 = valorGridWorkbook([['compra', '2026-04-02', 'IMFXR', 2, 10, 'USD', '', '', 0, 'usd-missing-fx']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, false);
  assert.equal(preview.rows[0].status, 'error');
  assert.ok(preview.rows[0].errors.some((item) => /FX a EUR/.test(item)));
});

test('valorgrid-xlsx type inference from share sign works', () => {
  seedTestInstrument({ symbol: 'IMINF', yahooSymbol: 'IMINF', name: 'Import Inference', type: 'stock', currency: 'EUR' });
  const contentBase64 = valorGridWorkbook([
    ['', '2026-04-03', 'IMINF', 3, 10, 'EUR', 1, 30, 0, 'infer-buy'],
    ['', '2026-04-04', 'IMINF', -1, 10, 'EUR', 1, 10, 0, 'infer-sell'],
  ]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].normalized.type, 'add');
  assert.equal(preview.rows[1].normalized.type, 'remove');
});

test('legacy generic sources are rejected with clear message', async () => {
  assert.throws(
    () => previewImport({ source: 'generic-csv', content: 'type,symbol,date,shares,price\nadd,IMPA,2026-01-01,1,1' }),
    /plantilla Excel de ValorGrid/,
  );
  const contentBase64 = valorGridWorkbook([['compra', '2026-01-01', 'IMPA', 1, 1, 'EUR', 1, 1, 0, 'legacy']]);
  assert.throws(
    () => previewImport({ source: 'generic-xlsx', contentBase64 }),
    /plantilla Excel de ValorGrid/,
  );

  const api = await jsonRequest('/api/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'generic-csv', filename: 'legacy.csv', content: 'a,b\n1,2' }),
  });
  assert.equal(api.response.status, 400);
  assert.match(api.body.error, /plantilla Excel de ValorGrid/);
});

test('GET /api/import/template.xlsx returns ValorGrid workbook template', async () => {
  const response = await request('/api/import/template.xlsx');
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(response.headers.get('content-disposition').includes('ValorGrid_Plantilla_Importacion.xlsx'));
  assert.deepEqual(workbook.SheetNames, ['Movimientos', 'Instrucciones', 'Ejemplos']);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Movimientos, { header: 1 });
  assert.deepEqual(rows[0], ['Tipo', 'Fecha', 'Ticker', 'Acciones', 'Precio', 'Divisa', 'FX a EUR', 'Valor EUR', 'Comision EUR', 'Referencia']);
});

test('synthetic S&P500 sample XLSX has correct structure and Movimientos sheet', () => {
  const filePath = path.join(__dirname, '..', 'samples', 'valorgrid-template', 'valorgrid-template-sp500-synthetic.xlsx');
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  assert.ok(workbook.SheetNames.includes('Movimientos'));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Movimientos, { header: 1 });
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], ['Tipo', 'Fecha', 'Ticker', 'Acciones', 'Precio', 'Divisa', 'FX a EUR', 'Valor EUR', 'Comision EUR', 'Referencia']);

  const tickers = rows.slice(1).map((row) => String(row[2]).trim().toUpperCase());
  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) => assert.ok(tickers.includes(ticker), `should include ${ticker}`));

  const allRefs = rows.slice(1).map((row) => String(row[9]).trim());
  assert.ok(allRefs.every((ref) => ref.startsWith('sample-sp500-')), 'all references should use sample-sp500- prefix');
});

test('synthetic S&P500 sample preview resolves buys, sells, FX, and commissions', () => {
  const filePath = path.join(__dirname, '..', 'samples', 'valorgrid-template', 'valorgrid-template-sp500-synthetic.xlsx');
  const buffer = fs.readFileSync(filePath);
  const contentBase64 = buffer.toString('base64');

  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) => {
    seedTestInstrument({ symbol: ticker, yahooSymbol: ticker, name: `S&P500 ${ticker}`, type: 'stock', currency: 'USD' });
  });

  const preview = previewImport({ source: 'valorgrid-xlsx', filename: 'valorgrid-template-sp500-synthetic.xlsx', contentBase64 });

  assert.equal(preview.canCommit, true);
  assert.equal(preview.summary.buys, 6);
  assert.equal(preview.summary.sells, 3);
  assert.equal(preview.summary.errorCount, 0);
  assert.equal(preview.rows.length, 9);

  const buyRows = preview.rows.filter((row) => row.normalized && row.normalized.type === 'add');
  const sellRows = preview.rows.filter((row) => row.normalized && row.normalized.type === 'remove');
  assert.equal(buyRows.length, 6);
  assert.equal(sellRows.length, 3);

  buyRows.forEach((row) => {
    assert.ok(row.normalized, 'buy row must have normalized data');
    assert.equal(row.normalized.currency, 'USD');
    assert.ok(row.normalized.fxToEur > 0 && row.normalized.fxToEur !== 1, 'USD rows must have explicit FX');
    assert.ok(Number.isFinite(row.normalized.commissionEur));
  });

  const inferredSell = preview.rows.find((row) => row.normalized && row.normalized.externalId && row.normalized.externalId.startsWith('sample-sp500-007'));
  assert.ok(inferredSell, 'should find row with reference sample-sp500-007');
  assert.equal(inferredSell.normalized.type, 'remove');
  assert.equal(inferredSell.normalized.symbol, 'KO');

  assert.ok(Number(preview.summary.valueEur) > 0);
  assert.ok(Number(preview.summary.commissionEur) > 0);
});

test('synthetic S&P500 sample commit produces correct final positions', () => {
  const filePath = path.join(__dirname, '..', 'samples', 'valorgrid-template', 'valorgrid-template-sp500-synthetic.xlsx');
  const buffer = fs.readFileSync(filePath);
  const contentBase64 = buffer.toString('base64');

  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) => {
    seedTestInstrument({ symbol: ticker, yahooSymbol: ticker, name: `S&P500 ${ticker}`, type: 'stock', currency: 'USD' });
  });

  const commit = commitImport({ source: 'valorgrid-xlsx', filename: 'valorgrid-template-sp500-synthetic.xlsx', contentBase64 });
  assert.equal(commit.summary.errorCount, 0);
  assert.equal(commit.summary.buys, 6);
  assert.equal(commit.summary.sells, 3);

  assert.equal(getPositionShares('AAPL', '2025-12-31'), 6);
  assert.equal(getPositionShares('MSFT', '2025-12-31'), 3);
  assert.equal(getPositionShares('NVDA', '2025-12-31'), 8);
  assert.equal(getPositionShares('KO', '2025-12-31'), 20);
  assert.equal(getPositionShares('JNJ', '2025-12-31'), 12);
  assert.equal(getPositionShares('XOM', '2025-12-31'), 15);
});

test('synthetic S&P500 sample reimport is idempotent and supports rollback', () => {
  const filePath = path.join(__dirname, '..', 'samples', 'valorgrid-template', 'valorgrid-template-sp500-synthetic.xlsx');
  const buffer = fs.readFileSync(filePath);
  const contentBase64 = buffer.toString('base64');

  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) => {
    seedTestInstrument({ symbol: ticker, yahooSymbol: ticker, name: `S&P500 ${ticker}`, type: 'stock', currency: 'USD' });
  });

  const first = commitImport({ source: 'valorgrid-xlsx', filename: 'valorgrid-template-sp500-synthetic.xlsx', contentBase64 });
  const txnCount = db.prepare("SELECT COUNT(*) AS cnt FROM transactions WHERE origin = 'import'").get().cnt;

  const repeated = commitImport({ source: 'valorgrid-xlsx', filename: 'valorgrid-template-sp500-synthetic.xlsx', contentBase64 });
  assert.equal(repeated.batch.id, first.batch.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS cnt FROM transactions WHERE origin = 'import'").get().cnt, txnCount);

  const { rollbackImportBatch } = require('./integration-helpers');
  assert.equal(rollbackImportBatch(first.batch.id), true);
  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) => {
    assert.equal(getPositionShares(ticker, '2025-12-31'), 0);
  });
});

test('template download includes Content-Length and Cache-Control headers', async () => {
  const response = await request('/api/import/template.xlsx');
  const buffer = Buffer.from(await response.arrayBuffer());

  assert.equal(response.status, 200);
  const contentLength = Number(response.headers.get('content-length'));
  assert.ok(Number.isFinite(contentLength) && contentLength > 100, 'Content-Length must be a positive number');
  assert.equal(contentLength, buffer.length, 'Content-Length must match buffer size');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('template Movimientos sheet has only headers and no data rows', async () => {
  const response = await request('/api/import/template.xlsx');
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Movimientos, { header: 1, defval: '' });

  assert.equal(rows.length, 1, 'Movimientos must have exactly 1 row (headers only)');
  assert.deepEqual(rows[0], ['Tipo', 'Fecha', 'Ticker', 'Acciones', 'Precio', 'Divisa', 'FX a EUR', 'Valor EUR', 'Comision EUR', 'Referencia']);
});

test('template Instrucciones sheet contains expected instructional content', async () => {
  const response = await request('/api/import/template.xlsx');
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
  assert.ok(workbook.SheetNames.includes('Instrucciones'));

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Instrucciones, { header: 1, defval: '' });
  const allText = rows.flat().map((cell) => String(cell)).join(' ');
  assert.ok(allText.includes('Plantilla de importación'), 'should contain title');
  assert.ok(allText.includes('Cómo usar esta plantilla'), 'should contain usage section');
  assert.ok(allText.includes('FX a EUR'), 'should document FX a EUR field');
  assert.ok(allText.includes('Comision EUR'), 'should document Comision EUR field');
  assert.ok(allText.includes('Movimientos'), 'should reference Movimientos sheet');
});

test('template Ejemplos sheet has valid example data rows', async () => {
  const response = await request('/api/import/template.xlsx');
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
  assert.ok(workbook.SheetNames.includes('Ejemplos'));

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Ejemplos, { header: 1, defval: '' });
  assert.deepEqual(rows[0], ['Tipo', 'Fecha', 'Ticker', 'Acciones', 'Precio', 'Divisa', 'FX a EUR', 'Valor EUR', 'Comision EUR', 'Referencia']);
  assert.equal(rows.length, 5, 'should have 1 header + 4 example rows');

  const dataRows = rows.slice(1);
  const tickers = dataRows.map((row) => String(row[2]).trim().toUpperCase());
  assert.ok(tickers.includes('MSFT'), 'should include MSFT example');
  assert.ok(tickers.includes('VWRL'), 'should include VWRL example');
  assert.ok(tickers.includes('SAN'), 'should include SAN example (negative shares inference)');
  assert.ok(tickers.includes('AAPL'), 'should include AAPL example (empty Valor EUR)');

  const aaplRow = dataRows.find((row) => String(row[2]).trim().toUpperCase() === 'AAPL');
  assert.equal(String(aaplRow[7]).trim(), '', 'AAPL example should have empty Valor EUR to demo auto-compute');
});

test('valorgrid-xlsx auto-computes Valor EUR when empty with valid FX for non-EUR', () => {
  seedTestInstrument({ symbol: 'VAUTO', yahooSymbol: 'VAUTO', name: 'Auto Compute', type: 'stock', currency: 'USD' });
  const contentBase64 = valorGridWorkbook([['compra', '2026-05-01', 'VAUTO', '2', '10', 'USD', '0.9', '', '0.5', 'auto-valor']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[0].normalized.currency, 'USD');
  assert.equal(preview.rows[0].normalized.fxToEur, 0.9);
  assert.equal(Number(preview.rows[0].normalized.valueEur.toFixed(2)), 18);
});

test('valorgrid-xlsx rejects zero shares', () => {
  seedTestInstrument({ symbol: 'VZERO', yahooSymbol: 'VZERO', name: 'Zero Shares', type: 'stock', currency: 'EUR' });
  const contentBase64 = valorGridWorkbook([['compra', '2026-05-02', 'VZERO', '0', '10', 'EUR', '', '', '0', 'zero-shares']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.rows[0].status, 'error');
  assert.ok(preview.rows[0].errors.some((item) => /Acciones debe ser mayor/.test(item)));
});

test('valorgrid-xlsx rejects negative price (abs applied so negative price becomes valid)', () => {
  seedTestInstrument({ symbol: 'VNEGP', yahooSymbol: 'VNEGP', name: 'Negative Price', type: 'stock', currency: 'EUR' });
  const contentBase64 = valorGridWorkbook([['compra', '2026-05-03', 'VNEGP', '5', '-10', 'EUR', '', '', '0', 'neg-price']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[0].normalized.price, 10, 'negative price should be converted to positive via abs');
});

test('valorgrid-xlsx rejects zero or negative FX for non-EUR trades', () => {
  seedTestInstrument({ symbol: 'VFX0', yahooSymbol: 'VFX0', name: 'Zero FX', type: 'stock', currency: 'USD' });
  const contentBase64 = valorGridWorkbook([['compra', '2026-05-04', 'VFX0', '2', '10', 'USD', '0', '', '0', 'zero-fx']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.rows[0].status, 'error');
  assert.ok(preview.rows[0].errors.some((item) => /FX a EUR/.test(item)));
});

test('valorgrid-xlsx requires mapping for instrument that does not exist', () => {
  const contentBase64 = valorGridWorkbook([['compra', '2026-06-01', 'GHOST', '10', '5', 'EUR', '', '', '0', 'ghost-ticker']]);

  const preview = previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.rows[0].status, 'needs_mapping');
  assert.equal(preview.canCommit, false);
  assert.ok(preview.detectedInstruments.some((item) => item.symbol === 'GHOST'), 'GHOST should appear in detected instruments');
});
