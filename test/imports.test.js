const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  assert,
  db,
  getPositionShares,
  previewImport,
  commitImport,
  seedTestInstrument,
  createWorkbookBase64,
  readWorkbook,
  worksheetRows,
  jsonRequest,
  request,
  registerLifecycle,
} = require('./integration-helpers');
const {
  listImportSources,
  loadProAdapters,
  adapterDefinitions,
} = require('../apps/server/src/domains/data-ingestion/ingestion-profiles');
const { MOVIMIENTOS_HEADERS } = require('../apps/server/src/domains/data-ingestion/template-generator');

registerLifecycle(test);

async function valorGridWorkbook(rows, sheetName = 'Movimientos') {
  // Add Yahoo column value (use Ticker value as default yahoo symbol)
  const enrichedRows = rows.map((row) => {
    // row: [Tipo, Fecha, Ticker, Acciones, Precio, Divisa, FX, Valor, Comision, Referencia]
    // Insert Yahoo after Ticker (index 2)
    return [...row.slice(0, 3), row[2], ...row.slice(3)];
  });
  return await createWorkbookBase64({
    [sheetName]: [
      [
        'Tipo',
        'Fecha',
        'Ticker',
        'Yahoo',
        'Acciones',
        'Precio',
        'Divisa',
        'FX a EUR',
        'Valor EUR',
        'Comision EUR',
        'Referencia',
      ],
      ...enrichedRows,
    ],
  });
}

test('valorgrid-xlsx import preview is read-only and commit is atomic and idempotent', async () => {
  seedTestInstrument({ symbol: 'IMPA', yahooSymbol: 'IMPA', name: 'Import A', type: 'stock', currency: 'EUR' });
  const contentBase64 = await valorGridWorkbook([['compra', '2026-01-10', 'IMPA', 2, 10, 'EUR', 1, 20, 1, 'imp-a-1']]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', filename: 'import-test.xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(getPositionShares('IMPA', '2026-01-10'), 0);

  const committed = await commitImport({ source: 'valorgrid-xlsx', filename: 'import-test.xlsx', contentBase64 });
  assert.equal(committed.summary.buys, 1);
  assert.equal(getPositionShares('IMPA', '2026-01-10'), 2);

  const repeated = await commitImport({ source: 'valorgrid-xlsx', filename: 'import-test.xlsx', contentBase64 });
  assert.equal(repeated.summary.buys, 1);
  assert.equal(getPositionShares('IMPA', '2026-01-10'), 2);
});

test('valorgrid-xlsx import impact and commit use only selected rows', async () => {
  seedTestInstrument({
    symbol: 'IMPS1',
    yahooSymbol: 'IMPS1',
    name: 'Import Selected One',
    type: 'stock',
    currency: 'EUR',
  });
  seedTestInstrument({
    symbol: 'IMPS2',
    yahooSymbol: 'IMPS2',
    name: 'Import Selected Two',
    type: 'stock',
    currency: 'EUR',
  });
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-01-11', 'IMPS1', 1, 10, 'EUR', 1, 10, 0, 'selected-1'],
    ['compra', '2026-01-11', 'IMPS2', 3, 20, 'EUR', 1, 60, 0, 'selected-2'],
  ]);

  const preview = await previewImport({
    source: 'valorgrid-xlsx',
    contentBase64,
    rowActions: { 3: 'skip' },
  });
  assert.equal(preview.summary.buys, 1);
  assert.equal(preview.impactPreview.instruments.length, 1);

  await commitImport({
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
  const contentBase64 = await valorGridWorkbook([
    ['venta', '2026-01-10', 'IMPD', 1, 10, 'EUR', 1, 10, 0, 'historic-sell'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'skipped');
  assert.equal(preview.rows[0].blockReasonCode, 'existing_empty_position');
});

test('valorgrid-xlsx import API exposes preview, commit, list, detail and rollback', async () => {
  seedTestInstrument({ symbol: 'IMPC', yahooSymbol: 'IMPC', name: 'Import C', type: 'stock', currency: 'EUR' });
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-01-12', 'IMPC', 4, 5, 'EUR', 1, 20, 0, 'api-import-1'],
  ]);
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

test('valorgrid-xlsx import supports sheet selection and atomic commit', async () => {
  seedTestInstrument({ symbol: 'IMXE', yahooSymbol: 'IMXE', name: 'Import XLSX', type: 'stock', currency: 'EUR' });
  const contentBase64 = await createWorkbookBase64({
    Instrucciones: [['No importar'], ['foo']],
    Movimientos: [
      [
        'Tipo',
        'Fecha',
        'Ticker',
        'Yahoo',
        'Acciones',
        'Precio',
        'Divisa',
        'FX a EUR',
        'Valor EUR',
        'Comision EUR',
        'Referencia',
      ],
      ['compra', '2026-03-01', 'IMXE', 'IMXE', 5, 3, 'EUR', 1, 15, 0, 'sheet-import-1'],
    ],
  });

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64, sheetName: 'Movimientos' });
  assert.equal(preview.selectedSheet, 'Movimientos');
  assert.equal(preview.canCommit, true);
  await commitImport({ source: 'valorgrid-xlsx', contentBase64, sheetName: 'Movimientos' });
  assert.equal(getPositionShares('IMXE', '2026-03-01'), 5);
});

test('valorgrid-xlsx parser only accepts the Movimientos sheet', async () => {
  const contentBase64 = await createWorkbookBase64({
    Movimientos: [
      [
        'Tipo',
        'Fecha',
        'Ticker',
        'Yahoo',
        'Acciones',
        'Precio',
        'Divisa',
        'FX a EUR',
        'Valor EUR',
        'Comision EUR',
        'Referencia',
      ],
      ['compra', '2026-03-02', 'IMXE', 'IMXE', 1, 3, 'EUR', 1, 3, 0, 'strict-sheet'],
    ],
    Datos: [['No permitido']],
  });

  await assert.rejects(() => previewImport({ source: 'valorgrid-xlsx', contentBase64 }), /Hoja no permitida: "Datos"/);
  await assert.rejects(
    () => previewImport({ source: 'valorgrid-xlsx', contentBase64, sheetName: 'Instrucciones' }),
    /Hoja no permitida: "Datos"/,
  );
});

test('valorgrid-xlsx parser rejects non-Movimientos sheet selection', async () => {
  const contentBase64 = await createWorkbookBase64({
    Instrucciones: [['No importar']],
    Movimientos: [
      [
        'Tipo',
        'Fecha',
        'Ticker',
        'Yahoo',
        'Acciones',
        'Precio',
        'Divisa',
        'FX a EUR',
        'Valor EUR',
        'Comision EUR',
        'Referencia',
      ],
      ['compra', '2026-03-02', 'IMXE', 'IMXE', 1, 3, 'EUR', 1, 3, 0, 'wrong-sheet'],
    ],
  });

  await assert.rejects(
    () => previewImport({ source: 'valorgrid-xlsx', contentBase64, sheetName: 'Instrucciones' }),
    /Solo se permite importar la hoja Movimientos/,
  );
});

test('valorgrid-xlsx parser rejects formulas', async () => {
  const contentBase64 = await createWorkbookBase64({
    Movimientos: [
      [
        'Tipo',
        'Fecha',
        'Ticker',
        'Yahoo',
        'Acciones',
        'Precio',
        'Divisa',
        'FX a EUR',
        'Valor EUR',
        'Comision EUR',
        'Referencia',
      ],
      ['compra', '2026-03-03', 'IMXE', 'IMXE', { formula: '1+1', result: 2 }, 3, 'EUR', 1, 6, 0, 'formula-row'],
    ],
  });

  await assert.rejects(() => previewImport({ source: 'valorgrid-xlsx', contentBase64 }), /formulas/);
});

test('valorgrid-xlsx parser requires exact ValorGrid headers', async () => {
  const contentBase64 = await createWorkbookBase64({
    Movimientos: [
      [
        'Tipo',
        'Fecha',
        'Ticker',
        'Yahoo',
        'Acciones',
        'Precio',
        'Divisa',
        'FX a EUR',
        'Valor EUR',
        'Comision EUR',
        'constructor',
      ],
      ['compra', '2026-03-04', 'IMXE', 'IMXE', 1, 3, 'EUR', 1, 3, 0, 'bad-header'],
    ],
  });

  await assert.rejects(
    () => previewImport({ source: 'valorgrid-xlsx', contentBase64 }),
    /plantilla oficial de ValorGrid/,
  );
});

test('valorgrid-xlsx parser limits community imports to 500 movements', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => [
    'compra',
    '2026-03-05',
    'IMXE',
    1,
    3,
    'EUR',
    1,
    3,
    0,
    `too-many-${index}`,
  ]);
  const contentBase64 = await valorGridWorkbook(rows);

  await assert.rejects(() => previewImport({ source: 'valorgrid-xlsx', contentBase64 }), /500 movimientos/);
});

test('valorgrid-xlsx import with non-EUR currency uses explicit FX to EUR', async () => {
  seedTestInstrument({ symbol: 'IMUSD', yahooSymbol: 'IMUSD', name: 'Import USD', type: 'stock', currency: 'USD' });
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-04-01', 'IMUSD', 2, 10, 'USD', 0.9, 18, 1, 'usd-import-1'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].normalized.fxToEur, 0.9);
  assert.equal(preview.rows[0].normalized.cashFlowEur, -19);
  await commitImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(getPositionShares('IMUSD', '2026-04-01'), 2);
});

test('valorgrid-xlsx import rejects non-EUR trades without FX to EUR', async () => {
  seedTestInstrument({
    symbol: 'IMFXR',
    yahooSymbol: 'IMFXR',
    name: 'Import FX Required',
    type: 'stock',
    currency: 'USD',
  });
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-04-02', 'IMFXR', 2, 10, 'USD', '', '', 0, 'usd-missing-fx'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, false);
  assert.equal(preview.rows[0].status, 'error');
  assert.ok(preview.rows[0].errors.some((item) => /FX a EUR/.test(item)));
});

test('valorgrid-xlsx type inference from share sign works', async () => {
  seedTestInstrument({
    symbol: 'IMINF',
    yahooSymbol: 'IMINF',
    name: 'Import Inference',
    type: 'stock',
    currency: 'EUR',
  });
  const contentBase64 = await valorGridWorkbook([
    ['', '2026-04-03', 'IMINF', 3, 10, 'EUR', 1, 30, 0, 'infer-buy'],
    ['', '2026-04-04', 'IMINF', -1, 10, 'EUR', 1, 10, 0, 'infer-sell'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].normalized.type, 'add');
  assert.equal(preview.rows[1].normalized.type, 'remove');
});

test('adapterDefinitions community only contains valorgrid-xlsx; unknown sources fail with standard error', async () => {
  const communityKeys = Object.entries(adapterDefinitions)
    .filter(([, def]) => def.edition === 'community')
    .map(([key]) => key);
  assert.deepStrictEqual(communityKeys, ['valorgrid-xlsx']);

  await assert.rejects(
    () => previewImport({ source: 'generic-csv', content: 'type,symbol,date,shares,price\nadd,IMPA,2026-01-01,1,1' }),
    /Origen de importación no soportado/,
  );
  const contentBase64 = await valorGridWorkbook([['compra', '2026-01-01', 'IMPA', 1, 1, 'EUR', 1, 1, 0, 'legacy']]);
  await assert.rejects(
    () => previewImport({ source: 'generic-xlsx', contentBase64 }),
    /Origen de importación no soportado/,
  );

  const api = await jsonRequest('/api/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'generic-csv', filename: 'legacy.csv', content: 'a,b\n1,2' }),
  });
  assert.equal(api.response.status, 400);
  assert.match(api.body.error, /Origen de importación no soportado/);
});

test('professional csv adapters load from index.cjs folders and use canonical rows', async () => {
  const adapterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-pro-adapter-'));
  const originalPath = process.env.VALORGRID_PRO_ADAPTERS_PATH;
  const headers = [
    'Tipo',
    'Fecha',
    'Ticker',
    'Acciones',
    'Precio',
    'Divisa',
    'FX a EUR',
    'Valor EUR',
    'Comision EUR',
    'Referencia',
  ];

  fs.writeFileSync(
    path.join(adapterDir, 'index.cjs'),
    `
const headers = ${JSON.stringify(headers)};
module.exports = {
  adapters: [
    {
      source: 'fixture-pro-csv',
      label: 'Fixture Broker',
      parse() {
        return {
          headers,
          rows: [
            {
              rowIndex: 2,
              headers,
              values: ['compra', '2026-05-01', 'PROFX', 2, 10, 'EUR', 1, 20, 1, 'pro-1'],
              data: {
                Tipo: 'compra',
                Fecha: '2026-05-01',
                Ticker: 'PROFX',
                Acciones: 2,
                Precio: 10,
                Divisa: 'EUR',
                'FX a EUR': 1,
                'Valor EUR': 20,
                'Comision EUR': 1,
                Referencia: 'pro-1',
              },
            },
            {
              rowIndex: 3,
              headers,
              values: ['compra', '2026-05-02', '', 0, 0, 'EUR', 1, 0, 0, 'ignored'],
              data: {
                Tipo: 'compra',
                Fecha: '2026-05-02',
                Ticker: '',
                Acciones: 0,
                Precio: 0,
                Divisa: 'EUR',
                'FX a EUR': 1,
                'Valor EUR': 0,
                'Comision EUR': 0,
                Referencia: 'ignored',
              },
              rowKind: 'corporate_action_ignored',
              ignoreReason: 'Ignored fixture row',
              externalIdentifiers: [
                { provider: 'global', identifierType: 'isin', identifierValue: 'ES0183746108' },
                {
                  provider: 'fixture',
                  identifierType: 'broker_product',
                  identifierValue: 'VIDRALA SA - RTS - NON TRADEABLE',
                  displayName: 'VIDRALA SA - RTS - NON TRADEABLE',
                  currency: 'EUR',
                },
              ],
            },
          ],
          fileSubtype: 'fixture',
        };
      },
    },
  ],
};
`,
  );

  try {
    process.env.VALORGRID_PRO_ADAPTERS_PATH = adapterDir;
    loadProAdapters();
    seedTestInstrument({ symbol: 'PROFX', yahooSymbol: 'PROFX', name: 'Pro Fixture', type: 'stock', currency: 'EUR' });

    const preview = await previewImport({ source: 'fixture-pro-csv', filename: 'fixture.csv', content: 'fixture' });

    assert.equal(adapterDefinitions['fixture-pro-csv'].profile, 'valorgrid');
    assert.equal(preview.summary.errorCount, 0);
    assert.equal(preview.summary.buys, 1);
    assert.equal(preview.summary.ignoredCount, 1);
    assert.equal(preview.rows[0].status, 'valid');
    assert.equal(preview.rows[0].normalized.cashFlowEur, -21);
    assert.equal(preview.rows[1].status, 'ignored');
    assert.deepEqual(preview.rows[1].errors, []);
    assert.ok(preview.detectedInstruments.some((item) => item.label === 'VIDRALA SA - RTS - NON TRADEABLE'));
    assert.equal(
      preview.detectedInstruments.some((item) => item.label.startsWith('isin:')),
      false,
    );
  } finally {
    delete adapterDefinitions['fixture-pro-csv'];
    if (originalPath === undefined) delete process.env.VALORGRID_PRO_ADAPTERS_PATH;
    else process.env.VALORGRID_PRO_ADAPTERS_PATH = originalPath;
    fs.rmSync(adapterDir, { recursive: true, force: true });
  }
});

test('GET /api/import/template.xlsx returns ValorGrid workbook template', async () => {
  const response = await request('/api/import/template.xlsx');
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = await readWorkbook(buffer);

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.ok(response.headers.get('content-disposition').includes('ValorGrid_Plantilla_Importacion.xlsx'));
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ['Movimientos', 'Instrucciones', 'Ejemplos'],
  );
  const rows = worksheetRows(workbook.getWorksheet('Movimientos'), MOVIMIENTOS_HEADERS.length);
  assert.deepEqual(rows[0], [
    'Tipo',
    'Fecha',
    'Ticker',
    'Yahoo',
    'Acciones',
    'Precio',
    'Divisa',
    'FX a EUR',
    'Valor EUR',
    'Comision EUR',
    'Referencia',
  ]);
});

test('synthetic S&P500 sample XLSX has correct structure and Movimientos sheet', async () => {
  const filePath = path.join(
    __dirname,
    '..',
    'samples',
    'valorgrid-template',
    'valorgrid-template-sp500-synthetic.xlsx',
  );
  const buffer = fs.readFileSync(filePath);
  const workbook = await readWorkbook(buffer);

  assert.ok(workbook.worksheets.some((sheet) => sheet.name === 'Movimientos'));
  const rows = worksheetRows(workbook.getWorksheet('Movimientos'), MOVIMIENTOS_HEADERS.length);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], [
    'Tipo',
    'Fecha',
    'Ticker',
    'Yahoo',
    'Acciones',
    'Precio',
    'Divisa',
    'FX a EUR',
    'Valor EUR',
    'Comision EUR',
    'Referencia',
  ]);

  const tickers = rows.slice(1).map((row) => String(row[2]).trim().toUpperCase());
  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) =>
    assert.ok(tickers.includes(ticker), `should include ${ticker}`),
  );

  const allRefs = rows.slice(1).map((row) => String(row[10]).trim());
  assert.ok(
    allRefs.every((ref) => ref.startsWith('sample-sp500-')),
    'all references should use sample-sp500- prefix',
  );
});

test('synthetic S&P500 sample preview resolves buys, sells, FX, and commissions', async () => {
  const filePath = path.join(
    __dirname,
    '..',
    'samples',
    'valorgrid-template',
    'valorgrid-template-sp500-synthetic.xlsx',
  );
  const buffer = fs.readFileSync(filePath);
  const contentBase64 = buffer.toString('base64');

  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) => {
    seedTestInstrument({
      symbol: ticker,
      yahooSymbol: ticker,
      name: `S&P500 ${ticker}`,
      type: 'stock',
      currency: 'USD',
    });
  });

  const preview = await previewImport({
    source: 'valorgrid-xlsx',
    filename: 'valorgrid-template-sp500-synthetic.xlsx',
    contentBase64,
  });

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

  const inferredSell = preview.rows.find(
    (row) => row.normalized && row.normalized.externalId && row.normalized.externalId.startsWith('sample-sp500-007'),
  );
  assert.ok(inferredSell, 'should find row with reference sample-sp500-007');
  assert.equal(inferredSell.normalized.type, 'remove');
  assert.equal(inferredSell.normalized.symbol, 'KO');

  assert.ok(Number(preview.summary.valueEur) > 0);
  assert.ok(Number(preview.summary.commissionEur) > 0);
});

test('synthetic S&P500 sample commit produces correct final positions', async () => {
  const filePath = path.join(
    __dirname,
    '..',
    'samples',
    'valorgrid-template',
    'valorgrid-template-sp500-synthetic.xlsx',
  );
  const buffer = fs.readFileSync(filePath);
  const contentBase64 = buffer.toString('base64');

  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) => {
    seedTestInstrument({
      symbol: ticker,
      yahooSymbol: ticker,
      name: `S&P500 ${ticker}`,
      type: 'stock',
      currency: 'USD',
    });
  });

  const commit = await commitImport({
    source: 'valorgrid-xlsx',
    filename: 'valorgrid-template-sp500-synthetic.xlsx',
    contentBase64,
  });
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

test('synthetic S&P500 sample reimport is idempotent and supports rollback', async () => {
  const filePath = path.join(
    __dirname,
    '..',
    'samples',
    'valorgrid-template',
    'valorgrid-template-sp500-synthetic.xlsx',
  );
  const buffer = fs.readFileSync(filePath);
  const contentBase64 = buffer.toString('base64');

  ['AAPL', 'MSFT', 'NVDA', 'KO', 'JNJ', 'XOM'].forEach((ticker) => {
    seedTestInstrument({
      symbol: ticker,
      yahooSymbol: ticker,
      name: `S&P500 ${ticker}`,
      type: 'stock',
      currency: 'USD',
    });
  });

  const first = await commitImport({
    source: 'valorgrid-xlsx',
    filename: 'valorgrid-template-sp500-synthetic.xlsx',
    contentBase64,
  });
  const txnCount = db.prepare("SELECT COUNT(*) AS cnt FROM transactions WHERE origin = 'import'").get().cnt;

  const repeated = await commitImport({
    source: 'valorgrid-xlsx',
    filename: 'valorgrid-template-sp500-synthetic.xlsx',
    contentBase64,
  });
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
  const workbook = await readWorkbook(Buffer.from(await response.arrayBuffer()));
  const rows = worksheetRows(workbook.getWorksheet('Movimientos'), MOVIMIENTOS_HEADERS.length);

  assert.equal(rows.length, 1, 'Movimientos must have exactly 1 row (headers only)');
  assert.deepEqual(rows[0], [
    'Tipo',
    'Fecha',
    'Ticker',
    'Yahoo',
    'Acciones',
    'Precio',
    'Divisa',
    'FX a EUR',
    'Valor EUR',
    'Comision EUR',
    'Referencia',
  ]);
});

test('template Instrucciones sheet contains expected instructional content', async () => {
  const response = await request('/api/import/template.xlsx');
  const workbook = await readWorkbook(Buffer.from(await response.arrayBuffer()));
  assert.ok(workbook.worksheets.some((sheet) => sheet.name === 'Instrucciones'));

  const rows = worksheetRows(workbook.getWorksheet('Instrucciones'), 1);
  const allText = rows
    .flat()
    .map((cell) => String(cell))
    .join(' ');
  assert.ok(allText.includes('Plantilla de importación'), 'should contain title');
  assert.ok(allText.includes('Cómo usar esta plantilla'), 'should contain usage section');
  assert.ok(allText.includes('FX a EUR'), 'should document FX a EUR field');
  assert.ok(allText.includes('Comision EUR'), 'should document Comision EUR field');
  assert.ok(allText.includes('Movimientos'), 'should reference Movimientos sheet');
});

test('template Ejemplos sheet has valid example data rows', async () => {
  const response = await request('/api/import/template.xlsx');
  const workbook = await readWorkbook(Buffer.from(await response.arrayBuffer()));
  assert.ok(workbook.worksheets.some((sheet) => sheet.name === 'Ejemplos'));

  const rows = worksheetRows(workbook.getWorksheet('Ejemplos'), MOVIMIENTOS_HEADERS.length);
  assert.deepEqual(rows[0], [
    'Tipo',
    'Fecha',
    'Ticker',
    'Yahoo',
    'Acciones',
    'Precio',
    'Divisa',
    'FX a EUR',
    'Valor EUR',
    'Comision EUR',
    'Referencia',
  ]);
  assert.equal(rows.length, 5, 'should have 1 header + 4 example rows');

  const dataRows = rows.slice(1);
  const tickers = dataRows.map((row) => String(row[2]).trim().toUpperCase());
  assert.ok(tickers.includes('MSFT'), 'should include MSFT example');
  assert.ok(tickers.includes('VWRL'), 'should include VWRL example');
  assert.ok(tickers.includes('SAN'), 'should include SAN example (negative shares inference)');
  assert.ok(tickers.includes('AAPL'), 'should include AAPL example (empty Valor EUR)');

  const aaplRow = dataRows.find((row) => String(row[2]).trim().toUpperCase() === 'AAPL');
  assert.equal(String(aaplRow[8]).trim(), '', 'AAPL example should have empty Valor EUR to demo auto-compute');
});

test('valorgrid-xlsx auto-computes Valor EUR when empty with valid FX for non-EUR', async () => {
  seedTestInstrument({ symbol: 'VAUTO', yahooSymbol: 'VAUTO', name: 'Auto Compute', type: 'stock', currency: 'USD' });
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-05-01', 'VAUTO', '2', '10', 'USD', '0.9', '', '0.5', 'auto-valor'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[0].normalized.currency, 'USD');
  assert.equal(preview.rows[0].normalized.fxToEur, 0.9);
  assert.equal(Number(preview.rows[0].normalized.valueEur.toFixed(2)), 18);
});

test('valorgrid-xlsx rejects zero shares', async () => {
  seedTestInstrument({ symbol: 'VZERO', yahooSymbol: 'VZERO', name: 'Zero Shares', type: 'stock', currency: 'EUR' });
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-05-02', 'VZERO', '0', '10', 'EUR', '', '', '0', 'zero-shares'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.rows[0].status, 'error');
  assert.ok(preview.rows[0].errors.some((item) => /Acciones debe ser mayor/.test(item)));
});

test('valorgrid-xlsx rejects negative price (abs applied so negative price becomes valid)', async () => {
  seedTestInstrument({ symbol: 'VNEGP', yahooSymbol: 'VNEGP', name: 'Negative Price', type: 'stock', currency: 'EUR' });
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-05-03', 'VNEGP', '5', '-10', 'EUR', '', '', '0', 'neg-price'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[0].normalized.price, 10, 'negative price should be converted to positive via abs');
});

test('valorgrid-xlsx rejects zero or negative FX for non-EUR trades', async () => {
  seedTestInstrument({ symbol: 'VFX0', yahooSymbol: 'VFX0', name: 'Zero FX', type: 'stock', currency: 'USD' });
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-05-04', 'VFX0', '2', '10', 'USD', '0', '', '0', 'zero-fx'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.rows[0].status, 'error');
  assert.ok(preview.rows[0].errors.some((item) => /FX a EUR/.test(item)));
});

test('valorgrid-xlsx requires mapping for instrument that does not exist', async () => {
  const contentBase64 = await valorGridWorkbook([
    ['compra', '2026-06-01', 'GHOST', '10', '5', 'EUR', '', '', '0', 'ghost-ticker'],
  ]);

  const preview = await previewImport({ source: 'valorgrid-xlsx', contentBase64 });
  assert.equal(preview.rows[0].status, 'needs_mapping');
  assert.equal(preview.canCommit, false);
  assert.ok(
    preview.detectedInstruments.some((item) => item.symbol === 'GHOST'),
    'GHOST should appear in detected instruments',
  );
});

test('GET /api/import/sources returns community sources when edition is community', async () => {
  const result = await jsonRequest('/api/import/sources');
  assert.equal(result.response.status, 200);
  assert.ok(Array.isArray(result.body.sources));

  const valorgrid = result.body.sources.find((s) => s.key === 'valorgrid-xlsx');
  assert.ok(valorgrid, 'valorgrid-xlsx source must be present');
  assert.equal(valorgrid.label, 'Plantilla Excel de ValorGrid');
  assert.equal(valorgrid.edition, 'community');
  assert.equal(valorgrid.available, true);

  const degiro = result.body.sources.find((s) => s.key === 'degiro-csv');
  assert.ok(degiro, 'degiro-csv source must be present in the list');
  assert.equal(degiro.edition, 'professional');
  assert.equal(degiro.available, false, 'degiro-csv must not be available in community edition');

  const ibkr = result.body.sources.find((s) => s.key === 'ibkr-csv');
  assert.ok(ibkr, 'ibkr-csv source must be present in the list');
  assert.equal(ibkr.edition, 'professional');
  assert.equal(ibkr.available, false, 'ibkr-csv must not be available in community edition');

  const clicktrade = result.body.sources.find((s) => s.key === 'clicktrade-xlsx');
  assert.ok(clicktrade, 'clicktrade-xlsx source must be present in the list');
  assert.equal(clicktrade.edition, 'professional');
  assert.equal(clicktrade.available, false, 'clicktrade-xlsx must not be available in community edition');
  assert.equal(clicktrade.inputKind, 'xlsx', 'clicktrade-xlsx must have inputKind set to xlsx');
});

test('listImportSources includes knownProAdapters with available=false in community edition', async () => {
  const sources = listImportSources('community');
  assert.ok(Array.isArray(sources));
  assert.ok(sources.length >= 4, 'should have at least 4 sources (1 community + 3 pro)');

  const valorgrid = sources.find((s) => s.key === 'valorgrid-xlsx');
  assert.ok(valorgrid);
  assert.equal(valorgrid.available, true);

  const degiro = sources.find((s) => s.key === 'degiro-csv');
  assert.ok(degiro);
  assert.equal(degiro.label, 'DEGIRO Transactions CSV');
  assert.equal(degiro.edition, 'professional');
  assert.equal(degiro.available, false);

  const ibkr = sources.find((s) => s.key === 'ibkr-csv');
  assert.ok(ibkr);
  assert.equal(ibkr.label, 'Interactive Brokers Transactions CSV');
  assert.equal(ibkr.edition, 'professional');
  assert.equal(ibkr.available, false);

  const clicktrade = sources.find((s) => s.key === 'clicktrade-xlsx');
  assert.ok(clicktrade);
  assert.equal(clicktrade.label, 'ClickTrade');
  assert.equal(clicktrade.edition, 'professional');
  assert.equal(clicktrade.available, false);
  assert.equal(clicktrade.inputKind, 'xlsx', 'clicktrade-xlsx must have inputKind set to xlsx');
});

test('listImportSources marks all sources as available in professional edition, except coming-soon adapters', async () => {
  const sources = listImportSources('professional');
  assert.ok(Array.isArray(sources));

  for (const source of sources) {
    if (source.comingSoon) {
      assert.equal(source.available, false, `${source.key} should not be available (coming soon)`);
    } else {
      assert.equal(source.available, true, `${source.key} should be available in professional edition`);
    }
  }
});

test('listImportSources returns correct response shape for every source', async () => {
  const sources = listImportSources('community');

  for (const source of sources) {
    assert.ok(typeof source.key === 'string' && source.key.length > 0, 'key must be a non-empty string');
    assert.ok(typeof source.label === 'string' && source.label.length > 0, 'label must be a non-empty string');
    assert.ok(['community', 'professional'].includes(source.edition), 'edition must be community or professional');
    assert.ok(typeof source.available === 'boolean', 'available must be a boolean');
    if (source.comingSoon !== undefined) {
      assert.equal(source.comingSoon, true, `comingSoon must be true when present (${source.key})`);
    }
  }
});

test('loadProAdapters handles missing VALORGRID_PRO_ADAPTERS_PATH gracefully', async () => {
  const originalPath = process.env.VALORGRID_PRO_ADAPTERS_PATH;
  delete process.env.VALORGRID_PRO_ADAPTERS_PATH;

  // loadProAdapters should not throw when env var is unset
  assert.doesNotThrow(() => loadProAdapters());

  // adapterDefinitions should only contain community adapters (no extra pro entries)
  const keys = Object.keys(adapterDefinitions);
  assert.ok(keys.includes('valorgrid-xlsx'), 'valorgrid-xlsx must be present');
  assert.equal(keys.length, 1, 'only community adapters should be present when PRO path is unset');

  // Restore original value
  if (originalPath !== undefined) {
    process.env.VALORGRID_PRO_ADAPTERS_PATH = originalPath;
  }
});
