const test = require('node:test');
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
