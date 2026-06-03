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
    if (file !== path.join('src', 'platform', 'db.js')) {
      assert.equal(read(file).includes('node:sqlite'), false, `${file} must not import node:sqlite`);
    }
    assert.equal(/with\s*\(\s*ctx\s*\)/.test(read(file)), false, `${file} must not use with(ctx)`);
  }

  assert.equal(/\.prepare\(|db\./.test(read(path.join('src', 'routes.js'))), false, 'routes must not run SQL directly');
  assert.equal(/FROM transactions|INSERT INTO transactions|cash_flow|portfolio_value/.test(read(path.join('src', 'domains', 'market-data', 'market-data.js'))), false, 'market-data must not own ledger logic');
  assert.equal(/db\.prepare\(|db\.exec\(|price_cache|daily_price_cache/.test(read(path.join('src', 'domains', 'market-data', 'market-data.js'))), false, 'market-data service must not execute SQL directly');
  assert.equal(/db\.prepare\(|db\.exec\(|FROM instruments|INSERT INTO instruments|instrument_identifiers|instrument_groups/.test(read(path.join('src', 'domains', 'instruments', 'instrument-service.js'))), false, 'instrument-service must not execute SQL directly');
  assert.equal(
    /db\.prepare\(|db\.exec\(|FROM transactions|INSERT INTO transactions|DELETE FROM transactions|auto_plan_skips|auto_plans/.test(
      read(path.join('src', 'domains', 'transactions', 'transaction-service.js')),
    ),
    false,
    'transaction-service must not execute SQL directly',
  );
  assert.equal(
    /db\.prepare\(|db\.exec\(|FROM instrument_groups|INSERT INTO auto_plans|DELETE FROM auto_plans/.test(
      read(path.join('src', 'domains', 'onboarding', 'onboarding-service.js')),
    ),
    false,
    'onboarding-service must not execute SQL directly',
  );
  assert.equal(
    /db\.prepare\(|db\.exec\(|FROM import_batches|INSERT INTO import_rows|DELETE FROM transactions WHERE import_batch_id/.test(
      read(path.join('src', 'domains', 'data-ingestion', 'ingestion-service.js')),
    ),
    false,
    'import-service must not execute SQL directly',
  );
  assert.equal(
    /db\.prepare\(|db\.exec\(|FROM history_builds|FROM transactions|INSERT INTO market_prices_daily|INSERT INTO fx_rates_daily/.test(
      read(path.join('src', 'domains', 'history', 'history-core.js')),
    ),
    false,
    'history-core must not execute SQL directly',
  );
  assert.equal(
    /db\.prepare\(|db\.exec\(|FROM portfolio_value_daily|FROM portfolio_value_weekly|FROM portfolio_events/.test(
      read(path.join('src', 'domains', 'history', 'history-service.js')),
    ),
    false,
    'history-service must not execute SQL directly',
  );
  assert.equal(
    /db\.prepare\(|db\.exec\(|app_meta|history_invalidations/.test(read(path.join('src', 'domains', 'meta', 'meta-state.js'))),
    false,
    'meta-state must not execute SQL directly',
  );
  assert.equal(
    /db\.prepare\(|db\.exec\(|instrument_identifiers|FROM instruments/.test(read(path.join('src', 'domains', 'ticker-suggestions', 'ticker-suggestions.js'))),
    false,
    'ticker-suggestions must not execute SQL directly',
  );
  assert.equal(
    /db\.prepare\(|db\.exec\(|FROM instruments|FROM instrument_groups|FROM transactions|FROM auto_plans/.test(
      read(path.join('src', 'domains', 'portfolio', 'portfolio-service.js')),
    ),
    false,
    'portfolio-service must not execute SQL directly',
  );
  assert.equal(
    /db\.prepare\(|db\.exec\(|PRAGMA|FROM history_invalidations/.test(read(path.join('src', 'domains', 'admin', 'diagnostics-service.js'))),
    false,
    'diagnostics-service must not execute SQL directly',
  );
  assert.ok(
    read(path.join('src', 'routes.js')).includes("require('./domains/instruments/route-instruments')"),
    'routes must delegate to domain route modules',
  );
  const routeFiles = [
    { domain: 'instruments', name: 'route-instruments' },
    { domain: 'transactions', name: 'route-transactions' },
    { domain: 'data-ingestion', name: 'route-data-ingestion' },
    { domain: 'portfolio', name: 'route-portfolio' },
    { domain: 'admin', name: 'route-admin' },
  ];
  for (const { domain, name } of routeFiles) {
    const routePath = path.join('src', 'domains', domain, `${name}.js`);
    assert.ok(
      read(routePath).includes('resolveRouteHandlers(ctx)'),
      `${name} must resolve handlers from grouped services`,
    );
    assert.ok(
      read(routePath).includes('sendError'),
      `${name} must use AppError-aware sendError helper`,
    );
  }
  assert.equal(
    /ctx\.db|db\.prepare\(|db\.exec\(/.test(read(path.join('src', 'domains', 'data-ingestion', 'ingestion-preview.js'))),
    false,
    'import-preview must not query SQLite directly',
  );
  assert.equal(
    /function beginTransaction|function commitTransaction|function rollbackTransaction/.test(read(path.join('src', 'domains', 'data-ingestion', 'ingestion-repository.js'))),
    false,
    'import-repository must use shared db transaction helpers, not manual begin/commit/rollback',
  );
  assert.ok(
    read(path.join('src', 'domains', 'data-ingestion', 'ingestion-repository.js')).includes('runInTransaction'),
    'import-repository must expose runInTransaction wrapper',
  );
  assert.equal(/Yahoo|fetchYahoo|query1\.finance/.test(read(path.join('src', 'domains', 'portfolio', 'portfolio-service.js'))), false, 'portfolio-service must not call Yahoo directly');
});

test('app composition root initializes grouped ctx namespaces', () => {
  const appSource = read(path.join('src', 'app.js'));
  assert.ok(appSource.includes('const config = {'), 'src/app.js must define ctx.config namespace');
  assert.ok(appSource.includes('const cache = {'), 'src/app.js must define ctx.cache namespace');
  assert.ok(appSource.includes('const logger = {'), 'src/app.js must define ctx.logger namespace');
  assert.ok(appSource.includes('const repositories = {'), 'src/app.js must define ctx.repositories namespace');
  assert.ok(appSource.includes('const services = {'), 'src/app.js must define ctx.services namespace');
  assert.match(appSource, /const ctx = \{[\s\S]*\bconfig,/, 'ctx object must expose config');
  assert.match(appSource, /const ctx = \{[\s\S]*\bcache,/, 'ctx object must expose cache');
  assert.match(appSource, /const ctx = \{[\s\S]*\blogger,/, 'ctx object must expose logger');
  assert.match(appSource, /const ctx = \{[\s\S]*\brepositories,/, 'ctx object must expose repositories');
  assert.match(appSource, /const ctx = \{[\s\S]*\bservices,/, 'ctx object must expose services');
  assert.ok(appSource.includes('bindGroupedCtxNamespaces(ctx);'), 'grouped ctx namespaces must be hydrated after module load');
  const instrumentRepositoryIndex = appSource.indexOf("'./domains/instruments/instrument-repository'");
  const instrumentServiceIndex = appSource.indexOf("'./domains/instruments/instrument-service'");
  assert.ok(instrumentRepositoryIndex >= 0, 'src/app.js must load instrument-repository module');
  assert.ok(
    instrumentServiceIndex > instrumentRepositoryIndex,
    'src/app.js must load instrument-repository before instrument-service',
  );
  const marketRepositoryIndex = appSource.indexOf("'./domains/market-data/market-data-repository'");
  const marketServiceIndex = appSource.indexOf("'./domains/market-data/market-data'");
  assert.ok(marketRepositoryIndex >= 0, 'src/app.js must load market-data-repository module');
  assert.ok(
    marketServiceIndex > marketRepositoryIndex,
    'src/app.js must load market-data-repository before market-data service',
  );
  const transactionRepositoryIndex = appSource.indexOf("'./domains/transactions/transaction-repository'");
  const transactionServiceIndex = appSource.indexOf("'./domains/transactions/transaction-service'");
  assert.ok(transactionRepositoryIndex >= 0, 'src/app.js must load transaction-repository module');
  assert.ok(
    transactionServiceIndex > transactionRepositoryIndex,
    'src/app.js must load transaction-repository before transaction-service',
  );
  const importRepositoryIndex = appSource.indexOf("'./domains/data-ingestion/ingestion-repository'");
  const importServiceIndex = appSource.indexOf("'./domains/data-ingestion/ingestion-service'");
  assert.ok(importRepositoryIndex >= 0, 'src/app.js must load import-repository module');
  assert.ok(
    importServiceIndex > importRepositoryIndex,
    'src/app.js must load import-repository before import-service',
  );
  const onboardingRepositoryIndex = appSource.indexOf("'./domains/onboarding/onboarding-repository'");
  const onboardingServiceIndex = appSource.indexOf("'./domains/onboarding/onboarding-service'");
  assert.ok(onboardingRepositoryIndex >= 0, 'src/app.js must load onboarding-repository module');
  assert.ok(
    onboardingServiceIndex > onboardingRepositoryIndex,
    'src/app.js must load onboarding-repository before onboarding-service',
  );
  const historyRepositoryIndex = appSource.indexOf("'./domains/history/history-repository'");
  const historyCoreIndex = appSource.indexOf("'./domains/history/history-core'");
  assert.ok(historyRepositoryIndex >= 0, 'src/app.js must load history-repository module');
  assert.ok(
    historyCoreIndex > historyRepositoryIndex,
    'src/app.js must load history-repository before history-core',
  );
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
  assert.ok(lineCount(path.join('client', 'app.js')) <= 150, 'client/app.js must remain a small orchestrator');
  for (const file of filesUnder('client')) {
    assert.ok(lineCount(file) <= 350, `${file} must stay below 350 lines`);
    assert.equal(/with\s*\(\s*ctx\s*\)/.test(read(file)), false, `${file} must not use with(ctx)`);
    assert.equal(/new Function\(/.test(read(file)), false, `${file} must not use dynamic Function loaders`);
  }

  assert.equal(/fetch\(/.test(read(path.join('client', 'charts.js'))), false, 'charts must not fetch data');
  assert.equal(/document\.|querySelector|innerHTML/.test(read(path.join('client', 'api.js'))), false, 'api must not touch DOM');
  assert.equal(/api\/|fetchJson|sendJson/.test(read(path.join('client', 'theme.js'))), false, 'theme must not call portfolio APIs');
  assert.equal(read(path.join('client', 'app.js')).includes('undefined'), false, 'client/app.js must not render undefined text');
});

test('client/app.js imports use valid relative paths targeting existing files', () => {
  const appSource = read(path.join('client', 'app.js'));
  const importPaths = [];
  const re = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(appSource)) !== null) {
    importPaths.push(match[1]);
  }
  assert.ok(importPaths.length > 0, 'client/app.js must contain at least one import');

  for (const importPath of importPaths) {
    assert.equal(
      importPath.startsWith('./client/'),
      false,
      `import path '${importPath}' must not start with './client/' (would resolve to client/client/)`,
    );

    const resolved = path.join('client', importPath);
    let exists = false;
    try {
      exists = fs.statSync(path.join(root, resolved)).isFile();
    } catch {
      // file does not exist
    }
    assert.ok(exists, `import path '${importPath}' must resolve to an existing file (expected: ${resolved})`);
  }
});

test('import wizard uses non technical row decisions', () => {
  const renderer = read(path.join('client', 'import-preview-renderer.js'));
  const confirmRenderer = read(path.join('client', 'import-confirm-renderer.js'));
  const workflow = read(path.join('client', 'import-workflow.js'));
  const workflowHelpers = read(path.join('client', 'import-workflow-helpers.js'));
  const imports = read(path.join('client', 'imports.js'));
  const html = read('index.html');

  assert.ok(renderer.includes('select class="import-row-control"'), 'row actions must use a compact import/omit dropdown');
  assert.equal(renderer.includes('>Revisar</option>'), false, 'row actions must not expose a review option');
  assert.ok(renderer.includes('Mixto'), 'group action must expose a mixed state when rows are partially selected');
  assert.ok(renderer.includes('is-safety-omitted'), 'unsafe default omissions must be visually highlighted');
  assert.ok(confirmRenderer.includes('import-confirm-hero'), 'confirm step must use a structured impact summary');
  assert.ok(html.includes('class="import-file-actions"'), 'analyze action must sit directly below the file drop zone');
  assert.ok(imports.includes('ctx.elements.importPreview.hidden = Boolean(preview)'), 'analyze action must hide after preview is available');
  assert.ok(workflow.includes('create.yahooSymbol'), 'created instruments must require a Yahoo ticker before confirming');
  assert.ok(workflowHelpers.includes("const IMPORTED_GROUP_ID = 'importados'"), 'import-created instruments must default to Importados');
});

test('administration and instrument filtering stay toolbar driven', () => {
  const html = read('index.html');
  const operations = read(path.join('client', 'operations.js'));
  const events = read(path.join('client', 'events.js'));

  assert.ok(html.includes('id="admin-manager"'), 'administration must be available from the toolbar');
  assert.ok(html.includes('id="admin-dialog"'), 'administration must render in a modal');
  assert.equal(html.includes('aria-labelledby="operations-title"'), false, 'administration must not be a main dashboard panel');
  assert.ok(html.includes('id="negative-red-toggle"'), 'negative color preference must be configurable');
  assert.ok(html.includes('id="instrument-position-filter"'), 'instrument modal must include position filters');
  assert.ok(operations.includes('currentSharesForInstrument'), 'instrument filter must use current net shares');
  assert.ok(events.includes('toggleNegativePreference'), 'negative preference must be wired to UI events');
});
