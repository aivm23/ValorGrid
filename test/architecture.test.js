const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function lineCount(relativePath) {
  return read(relativePath).split(/\r?\n/).length;
}

function filesUnder(relativePath) {
  const dir = path.join(root, relativePath);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const child = path.join(relativePath, entry.name);
      if (entry.isDirectory()) return filesUnder(child);
      return entry.isFile() && entry.name.endsWith('.js') ? [child] : [];
    });
}

test('backend architecture stays modular and SQLite remains isolated', () => {
  assert.ok(lineCount('server.js') <= 50, 'server.js must remain a bootstrap file');
  assert.ok(lineCount(path.join('src', 'app-core.js')) <= 30, 'src/app-core.js must remain a shim');

  for (const file of filesUnder('src')) {
    assert.ok(lineCount(file) <= 500, `${file} must stay below 500 lines`);
    if (file !== path.join('src', 'db.js')) {
      assert.equal(read(file).includes('node:sqlite'), false, `${file} must not import node:sqlite`);
    }
  }

  assert.equal(/\.prepare\(|db\./.test(read(path.join('src', 'routes.js'))), false, 'routes must not run SQL directly');
  assert.equal(/FROM transactions|INSERT INTO transactions|cash_flow|portfolio_value/.test(read(path.join('src', 'market-data.js'))), false, 'market-data must not own ledger logic');
  assert.equal(/Yahoo|fetchYahoo|query1\.finance/.test(read(path.join('src', 'portfolio-service.js'))), false, 'portfolio-service must not call Yahoo directly');
});

test('server public exports remain stable after modularization', () => {
  process.env.PORTFOLIO_DB_PATH ||= path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'arch-db-')), 'portfolio.sqlite');
  process.env.PORT ||= '0';
  const serverModule = require('../server.js');
  const expected = [
    'db',
    'server',
    'createTransaction',
    'previewTransaction',
    'deleteTransaction',
    'getTransactions',
    'buildSummary',
    'buildMonthly',
    'buildPortfolioHistory',
    'buildPortfolioPerformance',
    'getQuoteForSymbol',
    'listInstruments',
    'updateInstrument',
  ];

  for (const key of expected) {
    assert.ok(key in serverModule, `${key} export is required`);
  }
});

test('frontend architecture stays modular', () => {
  assert.ok(lineCount('app.js') <= 150, 'app.js must remain a small orchestrator');
  for (const file of filesUnder('client')) {
    assert.ok(lineCount(file) <= 350, `${file} must stay below 350 lines`);
  }

  assert.equal(/fetch\(/.test(read(path.join('client', 'charts.js'))), false, 'charts must not fetch data');
  assert.equal(/document\.|querySelector|innerHTML/.test(read(path.join('client', 'api.js'))), false, 'api must not touch DOM');
  assert.equal(/api\/|fetchJson|sendJson/.test(read(path.join('client', 'theme.js'))), false, 'theme must not call portfolio APIs');
  assert.equal(read('app.js').includes('undefined'), false, 'app.js must not render undefined text');
});

test('import wizard uses non technical row decisions', () => {
  const renderer = read(path.join('client', 'import-preview-renderer.js'));
  const workflow = read(path.join('client', 'import-workflow.js'));

  assert.equal(renderer.includes('select class="import-row-control"'), false, 'row actions must not use a dropdown');
  assert.ok(renderer.includes('type="checkbox" data-import-row-action'), 'row actions must use checkbox import toggles');
  assert.equal(renderer.includes('>Revisar</option>'), false, 'row actions must not expose a review option');
  assert.ok(workflow.includes('create.yahooSymbol'), 'created instruments must require a Yahoo ticker before confirming');
});
