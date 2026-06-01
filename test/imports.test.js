const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  assert,
  db,
  createTransaction,
  getPositionShares,
  getTransactions,
  previewImport,
  commitImport,
  rollbackImportBatch,
  seedTestInstrument,
  createWorkbookBase64,
  jsonRequest,
  registerLifecycle,
} = require('./integration-helpers');

registerLifecycle(test);
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'buy,IGR1,2026-05-01,2,10,EUR,20',
    'sell,IGR1,2026-05-03,1,12,EUR,12',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci贸n,N煤mero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi贸n AutoFX,Costes de transacci贸n y/o externos EUR,Total EUR,ID Orden,',
    '11-07-2025,12:00,INDUSTRIA DE DISENO TEXTIL SA,ES0148396007,MAD,MAD,-1,"346,9600",EUR,"346,96",EUR,"346,96","1,0000","0,00","0,00","346,96","ord-inditex-like",',
  ].join('\n');

  const preview = previewImport({ source: 'degiro-csv', filename: 'Transactions.csv', content });
  assert.notEqual(preview.rows[0].normalized.symbol, 'VIDRALASA');
  assert.equal(preview.rows[0].status, 'skipped');
  assert.equal(preview.rows[0].blockReasonCode, 'unknown_sell_only');
});

test('DEGIRO imports non EUR currencies using generic FX to EUR without assuming USD', () => {
  const content = [
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci髇,N鷐ero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi髇 AutoFX,Costes de transacci髇 y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci贸n,N煤mero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi贸n AutoFX,Costes de transacci贸n y/o externos EUR,Total EUR,ID Orden,',
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
    'Fecha,Hora,Producto,ISIN,Bolsa de referencia,Centro de ejecuci贸n,N煤mero,Precio,,Valor local,,Valor EUR,Tipo de cambio,Comisi贸n AutoFX,Costes de transacci贸n y/o externos EUR,Total EUR,ID Orden,',
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


