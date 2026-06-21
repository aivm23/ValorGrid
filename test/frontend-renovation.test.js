const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  assert,
  createTransaction,
  cachePrice,
  seedTestInstrument,
  jsonRequest,
  registerLifecycle,
} = require('./integration-helpers');

registerLifecycle(test);

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

// ── 1) KPI cards with semantic border-left colors and micro-info context ──

test('operations.js renders KPI cards with semantic border classes and metric-micro', async () => {
  seedTestInstrument({ symbol: 'KPI1', yahooSymbol: 'KPI1.DE', name: 'KPI Test', type: 'stock' });
  cachePrice('KPI1.DE', '2026-05-14', 50);

  await createTransaction({ type: 'add', symbol: 'KPI1', date: '2026-05-14', shares: 2 });

  const { response, body } = await jsonRequest('/api/portfolio/summary');
  assert.equal(response.status, 200);
  assert.ok(body.performance, 'performance data exists');
  assert.ok(body.performance.netContributed > 0, 'netContributed is positive');

  // Verify the operations.js source uses semantic border classes
  const ops = read(path.join('apps', 'web', 'src', 'operations.js'));
  assert.ok(ops.includes('has-border-accent'), 'operations uses has-border-accent');
  assert.ok(ops.includes('has-border-positive'), 'operations uses has-border-positive');
  assert.ok(ops.includes('has-border-amber'), 'operations uses has-border-amber');
  assert.ok(ops.includes('borderClasses'), 'operations uses position-based borderClasses array');
  assert.ok(ops.includes('metric-micro'), 'operations uses metric-micro for micro-info');
});

test('monthly.js renders YTD KPI cards with semantic border classes', async () => {
  const monthly = read(path.join('apps', 'web', 'src', 'monthly.js'));
  assert.ok(monthly.includes('has-border-accent'), 'monthly uses has-border-accent');
  assert.ok(monthly.includes('has-border-positive'), 'monthly uses has-border-positive');
  assert.ok(monthly.includes('has-border-negative'), 'monthly uses has-border-negative');
  assert.ok(monthly.includes('metric-micro'), 'monthly uses metric-micro');
});

// ── 2) History chart with gradient line and refined area fill ──

test('charts.js renders SVG with linearGradient for history line and area', async () => {
  seedTestInstrument({ symbol: 'HIST1', yahooSymbol: 'HIST1.DE', name: 'History Test', type: 'stock' });
  cachePrice('HIST1.DE', '2026-01-15', 40);
  cachePrice('HIST1.DE', '2026-03-15', 45);
  cachePrice('HIST1.DE', '2026-05-14', 50);

  await createTransaction({ type: 'add', symbol: 'HIST1', date: '2026-01-15', shares: 2 });
  await createTransaction({ type: 'add', symbol: 'HIST1', date: '2026-03-15', shares: 1 });

  const { response, body } = await jsonRequest('/api/portfolio/history?range=all');
  assert.equal(response.status, 200);
  assert.ok(body.series, 'history series exists');
  assert.ok(body.series.length > 0, 'history has series data');

  // Verify charts.js source defines SVG gradient elements
  const charts = read(path.join('apps', 'web', 'src', 'charts.js'));
  assert.ok(charts.includes('historyLineGrad'), 'charts defines historyLineGrad ID');
  assert.ok(charts.includes('historyAreaGrad'), 'charts defines historyAreaGrad ID');
  assert.ok(charts.includes('linearGradient'), 'charts uses linearGradient element');
  assert.ok(charts.includes('history-line'), 'charts defines history-line class');
  assert.ok(charts.includes('history-area'), 'charts defines history-area class');

  // Verify CSS references the gradients via url()
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('url(#historyLineGrad)'), 'CSS references line gradient');
  assert.ok(css.includes('url(#historyAreaGrad)'), 'CSS references area gradient');
});

// ── 3) Ledger table with type/origin badges and hover states ──

test('ledger.js renders type-badge and origin-badge classes for transactions', async () => {
  seedTestInstrument({ symbol: 'LED1', yahooSymbol: 'LED1.DE', name: 'Ledger Test', type: 'stock' });
  cachePrice('LED1.DE', '2026-05-14', 30);

  await createTransaction({ type: 'add', symbol: 'LED1', date: '2026-05-14', shares: 1 });

  const { response, body } = await jsonRequest('/api/transactions');
  assert.equal(response.status, 200);
  assert.ok(body.transactions.length > 0, 'transactions exist');
  const tx = body.transactions.find((t) => t.symbol === 'LED1');
  assert.ok(tx, 'LED1 transaction found');
  assert.equal(tx.type, 'add', 'transaction has type');
  assert.ok(['manual', 'auto', 'import'].includes(tx.origin), 'transaction has origin');

  // Verify ledger.js source uses badge classes
  const ledger = read(path.join('apps', 'web', 'src', 'ledger.js'));
  assert.ok(ledger.includes('type-badge'), 'ledger uses type-badge class');
  assert.ok(ledger.includes('type-sell'), 'ledger uses type-sell class');
  assert.ok(ledger.includes('type-buy'), 'ledger uses type-buy class');
  assert.ok(ledger.includes('origin-badge'), 'ledger uses origin-badge class');
  assert.ok(ledger.includes('origin-auto'), 'ledger uses origin-auto class');
  assert.ok(ledger.includes('origin-import'), 'ledger uses origin-import class');
  assert.ok(ledger.includes('origin-manual'), 'ledger uses origin-manual class');
});

test('CSS defines hover states for ledger table rows', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('tbody tr:hover'), 'CSS defines tbody tr:hover');
  assert.ok(css.includes('tbody tr.is-selected'), 'CSS defines is-selected row state');
  assert.ok(css.includes('.type-buy'), 'CSS defines type-buy style');
  assert.ok(css.includes('.type-sell'), 'CSS defines type-sell style');
  assert.ok(css.includes('.origin-auto'), 'CSS defines origin-auto style');
  assert.ok(css.includes('.origin-import'), 'CSS defines origin-import style');
});

// ── 4) Modal entrance/exit animations ──

test('CSS defines modal entrance and exit keyframe animations', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('@keyframes modalIn'), 'CSS defines modalIn animation');
  assert.ok(css.includes('@keyframes modalOut'), 'CSS defines modalOut animation');
  assert.ok(css.includes('.modal.is-closing'), 'CSS uses is-closing class for exit');
  assert.ok(css.includes('scale(0.96)'), 'modal animation uses scale');
  assert.ok(css.includes('translateY(8px)'), 'modal animation uses translateY');
});

// ── 5) Donut chart entrance animation and radial offset hover ──

test('CSS defines donut chart entrance animation', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('@keyframes donutIn'), 'CSS defines donutIn animation');
  assert.ok(css.includes('transform: scale(0.88)'), 'donutIn starts with scale down');
  assert.ok(css.includes('opacity: 0'), 'donutIn starts with opacity 0');
});

test('CSS defines donut chart active segment radial offset', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('.donut-chart-active'), 'CSS defines donut-chart-active class');
  assert.ok(css.includes('--donut-active-x'), 'CSS uses --donut-active-x property');
  assert.ok(css.includes('--donut-active-y'), 'CSS uses --donut-active-y property');
  assert.ok(css.includes('--donut-active-start'), 'CSS uses --donut-active-start property');
  assert.ok(css.includes('--donut-active-end'), 'CSS uses --donut-active-end property');
});

test('summary.js sets CSS custom properties for active donut segment', () => {
  const summary = read(path.join('apps', 'web', 'src', 'summary.js'));
  assert.ok(summary.includes('--donut-active-color'), 'summary sets --donut-active-color');
  assert.ok(summary.includes('--donut-active-start'), 'summary sets --donut-active-start');
  assert.ok(summary.includes('--donut-active-end'), 'summary sets --donut-active-end');
  assert.ok(summary.includes('--donut-active-x'), 'summary sets --donut-active-x');
  assert.ok(summary.includes('--donut-active-y'), 'summary sets --donut-active-y');
  assert.ok(summary.includes('donut-chart-active'), 'summary toggles donut-chart-active class');
});

// ── 6) Sub-chart slide-in animation ──

test('CSS defines sub-chart slide-in keyframe animation', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('@keyframes subchartIn'), 'CSS defines subchartIn animation');
  assert.ok(css.includes('translateX(16px)'), 'subchartIn starts with translateX offset');
  assert.ok(css.includes('.subchart'), 'CSS targets .subchart with animation');
});

// ── 7) Price freshness indicator ──

test('summary.js renders market data quality status', async () => {
  seedTestInstrument({ symbol: 'FRESH1', yahooSymbol: 'FRESH1.DE', name: 'Freshness Test', type: 'stock' });
  cachePrice('FRESH1.DE', '2026-05-14', 25);

  await createTransaction({ type: 'add', symbol: 'FRESH1', date: '2026-05-14', shares: 1 });

  const { response, body } = await jsonRequest('/api/portfolio/summary');
  assert.equal(response.status, 200);
  assert.ok(body.updatedAt, 'summary has updatedAt timestamp');

  // Verify summary.js source uses market-data quality logic.
  const summary = read(path.join('apps', 'web', 'src', 'summary.js'));
  assert.ok(summary.includes('marketDataStatus'), 'summary reads market data status');
  assert.ok(summary.includes("status.status === 'missing'"), 'summary handles missing prices');
  assert.ok(summary.includes("status.status === 'stale'"), 'summary handles stale prices');
  assert.ok(summary.includes('priceStatus'), 'summary updates priceStatus element');
});

// ── 8) YTD subtitle with month count ──

test('monthly.js sets YTD subtitle with completed month count', async () => {
  const monthly = read(path.join('apps', 'web', 'src', 'monthly.js'));
  assert.ok(monthly.includes('ytdSubtitle'), 'monthly references ytdSubtitle element');
  assert.ok(monthly.includes('meses con datos'), 'monthly includes month count text');
  assert.ok(monthly.includes('A la espera del primer movimiento'), 'monthly includes empty state text');
  assert.ok(monthly.includes('completedMonths'), 'monthly uses completedMonths for count');
});

// ── 9) History subtitle with first date ──

test('charts.js sets history subtitle with first date', async () => {
  const charts = read(path.join('apps', 'web', 'src', 'charts.js'));
  assert.ok(charts.includes('historySubtitle'), 'charts references historySubtitle element');
  assert.ok(charts.includes('first.date'), 'charts uses first date from series');
  assert.ok(charts.includes('formatPlainDate'), 'charts formats the date');
});

test('index.html and charts.js render metric info tooltips for visible totals', () => {
  const index = read('apps/web/index.html');
  const charts = read(path.join('apps', 'web', 'src', 'charts.js'));
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));

  assert.ok(index.includes('Total visible estimado'), 'distribution label updated');
  assert.ok(index.includes('aria-label="Información sobre la métrica"'), 'metric info aria label present in index');
  assert.ok(index.includes('visibles en distribución'), 'distribution tooltip explains visibility');
  assert.ok(charts.includes('Último valor histórico'), 'history stat label updated in charts');
  assert.ok(charts.includes('cartera activa materializada en histórico'), 'history tooltip explains materialized portfolio');
  assert.ok(css.includes('.metric-info-button'), 'CSS defines metric info button');
  assert.ok(css.includes('.metric-info-tooltip'), 'CSS defines metric info tooltip');
});

// ── 10) Ledger filter info with result count ──

test('ledger.js shows filtered count X/Y in totals row when filters are active', async () => {
  seedTestInstrument({ symbol: 'FILTER1', yahooSymbol: 'FILTER1.DE', name: 'Filter Test', type: 'stock' });
  cachePrice('FILTER1.DE', '2026-05-14', 20);

  await createTransaction({ type: 'add', symbol: 'FILTER1', date: '2026-05-14', shares: 1 });

  const { response, body } = await jsonRequest('/api/transactions');
  assert.equal(response.status, 200);
  assert.ok(body.transactions.length > 0, 'transactions exist for filtering');

  const ledger = read(path.join('apps', 'web', 'src', 'ledger.js'));
  assert.ok(ledger.includes('ledgerFilterInfo'), 'ledger references ledgerFilterInfo element');
  assert.ok(ledger.includes('ledger-filtered-count'), 'ledger uses filtered-count class for highlights');
  assert.ok(ledger.includes('hasFilters'), 'ledger checks for active filters');
  assert.ok(ledger.includes('/ ${allTransactions.length}'), 'ledger shows X / Y format');
});

// ── 11) Checkbox animation ──

test('CSS defines checkbox check animation with scale and clip-path', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('@keyframes checkPop'), 'CSS defines checkPop animation');
  assert.ok(css.includes('transform: scale(0)'), 'checkbox starts unchecked with scale 0');
  assert.ok(css.includes('transform: scale(1.2)'), 'checkPop has overshoot scale');
  assert.ok(css.includes('clip-path: polygon'), 'checkbox uses clip-path for checkmark');
  assert.ok(css.includes('appearance: none'), 'checkbox uses custom styling');
  assert.ok(css.includes('transition:'), 'checkbox has transition properties');
});

// ── 12) Bulk toolbar slide-in and delete button pulse ──

test('CSS defines bulk toolbar slide-in animation', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('@keyframes bulkToolbarIn'), 'CSS defines bulkToolbarIn animation');
  assert.ok(css.includes('transform: translateY(8px)'), 'bulkToolbarIn starts with translateY offset');
  assert.ok(css.includes('.bulk-toolbar'), 'CSS targets bulk-toolbar with animation');
});

test('CSS defines delete button pulse animation on hover', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('@keyframes deletePulse'), 'CSS defines deletePulse animation');
  assert.ok(css.includes('.icon-bulk-delete:hover'), 'delete pulse triggers on hover');
  assert.ok(css.includes('box-shadow'), 'delete pulse uses box-shadow');
  assert.ok(css.includes('var(--negative)'), 'delete pulse uses negative color');
});

// ── 13) Dark mode grid line opacity ──

test('CSS reduces grid line opacity in dark mode', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('[data-theme="dark"] .history-grid-line'), 'CSS targets dark mode grid lines');
  assert.ok(css.includes('opacity: 0.15'), 'dark mode grid lines have reduced opacity');
  assert.ok(css.includes('.history-reference-line'), 'CSS defines reference line style');
  assert.ok(css.includes('[data-theme="dark"] .history-reference-line'), 'CSS targets dark mode reference lines');
});

// ── 14) Legend separator between groups ──

test('charts.js renders legend separator before STOCK group', async () => {
  const charts = read(path.join('apps', 'web', 'src', 'charts.js'));
  assert.ok(charts.includes('legend-separator'), 'charts uses legend-separator class');
  assert.ok(charts.includes('hasSeparator'), 'charts computes hasSeparator flag');
  assert.ok(charts.includes("item.symbol === 'STOCK'"), 'charts checks for STOCK symbol');
});

test('CSS defines legend separator styling', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('.legend-separator'), 'CSS defines legend-separator class');
  assert.ok(css.includes('height: 1px'), 'separator has height');
  assert.ok(css.includes('background: var(--line)'), 'separator uses line color');
});

// ── Integration: verify all frontend modules export attach functions ──

test('all frontend modules use ES module attach pattern', () => {
  const clientModules = [
    'charts.js',
    'summary.js',
    'monthly.js',
    'ledger.js',
    'operations.js',
    'dashboard.js',
    'forms.js',
    'onboarding.js',
    'imports.js',
    'theme.js',
    'privacy.js',
    'history.js',
    'bulk-actions.js',
    'state.js',
    'dom.js',
    'format.js',
  ];

  for (const mod of clientModules) {
    const source = read(path.join('apps', 'web', 'src', mod));
    assert.ok(
      source.includes('export function attach') || source.includes('export { attach }'),
      `${mod} exports attach function`,
    );
    assert.ok(source.includes('Object.assign(ctx'), `${mod} extends ctx namespace`);
  }

  // events.js is the event-wiring module; it uses ctx but does not extend it
  const eventsSource = read(path.join('apps', 'web', 'src', 'events.js'));
  assert.ok(eventsSource.includes('export function attach'), 'events.js exports attach function');
  assert.ok(eventsSource.includes('const { elements, state'), 'events.js destructures ctx');
});

// ── Integration: verify CSS class coverage for all new features ──

test('CSS contains all semantic border classes used by KPI cards', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  const borderClasses = [
    '.metric-grid article.has-border-accent',
    '.metric-grid article.has-border-positive',
    '.metric-grid article.has-border-negative',
    '.metric-grid article.has-border-amber',
    '.metric-grid article.has-border-violet',
  ];

  for (const cls of borderClasses) {
    assert.ok(css.includes(cls), `CSS defines ${cls}`);
  }
});

test('CSS defines metric-micro styling for KPI micro-info', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('.metric-micro'), 'CSS defines metric-micro class');
  assert.ok(css.includes('font-family: var(--font-mono)'), 'metric-micro uses monospace font');
  assert.ok(css.includes('tabular-nums'), 'metric-micro uses tabular-nums');
});

test('import-workflow.js renders Pro sources in plain-text options and banners', () => {
  const workflow = read(path.join('apps', 'web', 'src', 'import-workflow.js'));
  const helpers = read(path.join('apps', 'web', 'src', 'import-workflow-helpers.js'));
  assert.ok(helpers.includes('getImportSourceDisplayName'), 'helpers defines getImportSourceDisplayName');
  assert.ok(helpers.includes('getImportSourceOptionLabel'), 'helpers defines getImportSourceOptionLabel');
  assert.ok(workflow.includes('renderImportSourceOptions'), 'import-workflow.js delegates option rendering');
  assert.ok(workflow.includes('renderImportProBanners'), 'import-workflow.js delegates banner rendering');
  assert.ok(helpers.includes('import-pro-banner-brokers'), 'renders DEGIRO/IBKR banner');
  assert.ok(helpers.includes('import-pro-banner-clicktrade'), 'renders ClickTrade banner');
  assert.ok(helpers.includes('import-soon-label'), 'renders Próximamente label');
  assert.ok(helpers.includes('pro-edition-label'), 'uses pro-edition-label class for Professional Edition');
  assert.ok(!workflow.includes('" disabled><em class='), 'no HTML tags inside option values');
});

test('imports.js loads import sources when opening the import dialog', () => {
  const importsSource = read(path.join('apps', 'web', 'src', 'imports.js'));
  assert.ok(importsSource.includes('async function openImportDialog()'), 'openImportDialog can await source loading');
  assert.ok(importsSource.includes('await loadImportSources(ctx);'), 'openImportDialog refreshes import sources before showing modal');
});

test('import-workflow.js option labels include Pro source names and edition', () => {
  const workflow = read(path.join('apps', 'web', 'src', 'import-workflow.js'));
  const helpers = read(path.join('apps', 'web', 'src', 'import-workflow-helpers.js'));
  assert.ok(workflow.includes('renderImportSourceOptions(sources, edition, ctx.escapeHtml)'), 'workflow escapes options through helper');
  assert.ok(helpers.includes('Professional Edition'), 'option labels include Professional Edition');
  assert.ok(helpers.includes('Pr\\u00f3ximamente'), 'option labels include Próximamente for coming soon');
  assert.ok(helpers.includes('DEGIRO'), 'helpers maps degiro-csv key to DEGIRO');
  assert.ok(helpers.includes('Interactive Brokers'), 'helpers maps ibkr-csv to Interactive Brokers');
  assert.ok(helpers.includes('ClickTrade'), 'helpers maps clicktrade-xlsx to ClickTrade');
});

test('import source helper labels are plain text and match Pro teaser copy', () => {
  const helpers = read(path.join('apps', 'web', 'src', 'import-workflow-helpers.js'));
  assert.ok(helpers.includes("return name + ' - Professional Edition'"), 'Pro source labels use plain-text separator');
  assert.ok(
    helpers.includes("return name + ' - Pr\\u00f3ximamente - Professional Edition'"),
    'comingSoon source labels include Próximamente and edition',
  );

  for (const forbidden of ['<em', '<span', '<strong', 'class=']) {
    assert.ok(!helpers.includes(`return name + '${forbidden}`), `option helper labels must not contain ${forbidden}`);
  }
});

test('import source options keep the Community source first by UI policy', () => {
  const workflow = read(path.join('apps', 'web', 'src', 'import-workflow.js'));
  const helpers = read(path.join('apps', 'web', 'src', 'import-workflow-helpers.js'));
  assert.ok(helpers.includes("left.edition === 'community' ? -1 : 1"), 'Community sources render before Pro teasers');
  assert.ok(workflow.includes("select.value = 'valorgrid-xlsx'"), 'ValorGrid template remains the default selection');
});

test('CSS defines import-pro-banner styles', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('.import-pro-banners'), 'CSS defines .import-pro-banners container');
  assert.ok(css.includes('.import-pro-banner'), 'CSS defines .import-pro-banner');
  assert.ok(css.includes('.import-pro-banner-brokers'), 'CSS defines .import-pro-banner-brokers');
  assert.ok(css.includes('.import-pro-banner-clicktrade'), 'CSS defines .import-pro-banner-clicktrade');
  assert.ok(css.includes('.import-soon-label'), 'CSS defines .import-soon-label');
  assert.ok(css.includes('#06b6d4'), 'soon label uses cyan #06b6d4');
assert.ok(css.includes('display: flex;'), 'banner container uses flex-wrap instead of grid to fit text');
  assert.ok(!css.includes('box-shadow: inset 3px 0 0'), 'left colored border removed from all banners');
  assert.ok(css.includes('#0891b2 8%, var(--card)'), 'both banners use same blue background');
  assert.ok(!css.includes('f59e0b 9%, var(--card)'), 'no amber background in import banners');
  assert.ok(!css.includes('dark .import-pro-banner-clicktrade'), 'dark theme clicktrade selector removed');
  assert.ok(css.includes('color: #06b6d4 !important;'), 'soon label cyan is protected against generic color override');
});

test('index.html instrument type selects include crypto option', () => {
  const index = read('apps/web/index.html');
  assert.ok(index.includes('<option value="crypto">Crypto</option>'), 'index.html contains crypto option in instrument selects');
  const cryptoCount = (index.match(/<option value="crypto">Crypto<\/option>/g) || []).length;
  assert.equal(cryptoCount, 2, 'crypto option appears in both new-instrument-type and wizard-instrument-type selects');
});

test('operations.js instrument table type select includes crypto', () => {
  const ops = read(path.join('apps', 'web', 'src', 'operations.js'));
  assert.ok(ops.includes("instrument.type === 'crypto'"), 'operations.js references crypto instrument type');
});

test('instrument creation form includes commodity type and auto provider', () => {
  const index = read('apps/web/index.html');
  assert.ok(index.includes('value="commodity"'), 'create form includes commodity type');
  assert.ok(index.includes('id="new-instrument-commodity"'), 'create form includes commodity dropdown');
  assert.ok(!index.includes('id="new-instrument-price-source"'), 'price source selector is removed');
});

test('instrument-create-market-data.js handles auto provider by type', () => {
  const source = read(path.join('apps', 'web', 'src', 'instrument-create-market-data.js'));
  assert.ok(source.includes('buildInstrumentPayload'), 'payload builder is exported');
  assert.ok(source.includes("payload.provider = 'alpha_vantage'"), 'alternative provider is set for commodities');
  assert.ok(!source.includes('/api/market-data/manual-prices'), 'manual price endpoint is no longer called');
});

test('history-preferences.js includes crypto in asset types and labels', () => {
  const hp = read(path.join('apps', 'web', 'src', 'history-preferences.js'));
  assert.ok(hp.includes("'crypto'"), 'history-preferences.js includes crypto in arrays');
  assert.ok(hp.includes("crypto: 'Crypto'"), 'history-preferences.js has Crypto label');
});

test('forms.js sends unitPrice in transaction payload', () => {
  const forms = read(path.join('apps', 'web', 'src', 'forms.js'));
  assert.ok(forms.includes('payload.unitPrice'), 'forms.js sends unitPrice payload');
  assert.ok(
    forms.indexOf('payload.unitPrice') < forms.indexOf('payload.euros = euros'),
    'manual shares + unitPrice path must take precedence over euros',
  );
  assert.ok(forms.includes('payload.fxToEur'), 'forms.js sends manual FX payload when provided');
});

test('deploy/sql/update-3.15.0-to-3.16.0.sql contains crypto CHECK', () => {
  const sql = read(path.join('deploy', 'sql', 'update-3.15.0-to-3.16.0.sql'));
  assert.ok(sql.includes("'crypto'"), 'SQL update includes crypto in CHECK constraint');
  assert.ok(sql.includes('BEGIN IMMEDIATE'), 'SQL update uses transaction');
  assert.ok(sql.includes('PRAGMA foreign_keys = OFF'), 'SQL update disables FK constraints');
  assert.ok(sql.includes('PRAGMA foreign_keys = ON'), 'SQL update re-enables FK constraints');
});

// ── 15) Operativa section microcopy and tooltips ──

test('operations.js Operativa cards use improved microcopy and tooltips', () => {
  const ops = read(path.join('apps', 'web', 'src', 'operations.js'));

  // metricInfo helper defined
  assert.ok(ops.includes('function metricInfo'), 'metricInfo helper defined in operations.js');

  // Tooltip IDs for buttons i
  assert.ok(ops.includes('op-contributed-info'), 'tooltip id for aportado neto');
  assert.ok(ops.includes('op-result-info'), 'tooltip id for resultado total');
  assert.ok(ops.includes('op-latent-info'), 'tooltip id for plusvalía latente');

  // Tooltip content
  assert.ok(ops.includes('Aportado neto total desde el primer movimiento'), 'aportado tooltip text');
  assert.ok(ops.includes('Resultado total = valor mercado - aportado neto'), 'resultado tooltip text');
  assert.ok(ops.includes('Plusvalía no realizada de posiciones abiertas'), 'latent tooltip text');

  // New microcopy for Aportado neto
  assert.ok(ops.includes('desde primer movimiento'), 'aportado microcopy: desde primer movimiento');
  assert.ok(ops.includes('retirada neta total'), 'aportado microcopy: retirada neta total');

  // New microcopy for Resultado total
  assert.ok(ops.includes('valor + retirado neto'), 'resultado microcopy: valor + retirado neto');
  assert.ok(ops.includes('sin aportación neta'), 'resultado microcopy: sin aportación neta');
  assert.ok(ops.includes('sobre aportado'), 'resultado microcopy: sobre aportado');

  // New microcopy for Plusvalía latente
  assert.ok(ops.includes('sobre inversión abierta'), 'latent microcopy: sobre inversión abierta');
  assert.ok(ops.includes('sin inversión abierta'), 'latent microcopy: sin inversión abierta');

  // Plusvalía realizada copy updated
  assert.ok(ops.includes('resultado ventas FIFO'), 'realized copy: resultado ventas FIFO');

  // Open investment formula present
  assert.ok(ops.includes('currentValue - unrealizedGain'), 'open investment formula present');
  assert.ok(ops.includes('unrealizedGain / openInvestment'), 'latent pct formula present');

  // Old copy removed
  assert.ok(!ops.includes('sin base de aportación'), 'removed old "sin base de aportación" copy');
  assert.ok(!ops.includes('>no realizada<'), 'removed old standalone "no realizada" microcopy');
});

// ── 16) Pro/Community preferences panel ──

test('index.html details is closed by default (no open attribute) with community class', () => {
  const index = read('apps/web/index.html');
  const match = index.match(/id="pro-preferences-card"[^>]*>/);
  assert.ok(match, 'pro-preferences-card element exists');
  assert.ok(index.includes('id="pro-preferences-card"'), 'card element found');
  assert.ok(!index.includes('pro-preferences-card" open'), 'details is closed by default');
  assert.ok(index.includes('is-community-edition'), 'card starts with is-community-edition class');
});

test('CSS no longer hides pro-preferences-summary unconditionally on open', () => {
  const css = read('apps/web/src/styles.css');
  assert.ok(!css.includes('.pro-preferences-card[open] .pro-preferences-summary'), 'old rule removed');
  assert.ok(css.includes('.pro-preferences-card.is-community-edition[open] .pro-preferences-summary'), 'Community rule keeps summary visible');
  assert.ok(css.includes('.pro-preferences-card.is-pro-edition .pro-preferences-summary'), 'PRO rule hides summary');
});

test('community operations panel keeps fixed summaries and no metric selector wiring', () => {
  const ops = read(path.join('apps', 'web', 'src', 'operations.js'));
  assert.ok(ops.includes('const metricIds = DEFAULT_OPERATION_METRIC_IDS'), 'performance cards use fixed defaults');
  assert.ok(ops.includes('Professional Edition permite elegir'), 'keeps Professional Edition teaser copy');
  assert.ok(!ops.includes('operation-metric-select'), 'does not render metric selector controls');
  assert.ok(!ops.includes("sendJson('/api/preferences/ui', 'PUT', { operationsMetricIds"), 'does not save metric preferences');
});

test('history-preferences.js forces custom mode in non-editable state', () => {
  const hp = read(path.join('apps', 'web', 'src', 'history-preferences.js'));
  assert.ok(hp.includes('isEditable ? filters : { ...filters, mode: \'custom\' }'), 'forces custom mode when not editable');
  assert.ok(hp.includes('syncProPreferencesPanel'), 'exports syncProPreferencesPanel');
});

test('history-preferences.js syncProPreferencesPanel toggles edition classes and open state', () => {
  const hp = read(path.join('apps', 'web', 'src', 'history-preferences.js'));
  assert.ok(hp.includes('is-pro-edition'), 'references is-pro-edition class');
  assert.ok(hp.includes('is-community-edition'), 'references is-community-edition class');
  assert.ok(hp.includes('card.open = true'), 'PRO opens panel');
  assert.ok(hp.includes('card.open = false'), 'Community closes panel');
  assert.ok(hp.includes('card.dataset.fixed'), 'PRO sets data-fixed attribute');
  assert.ok(hp.includes('delete card.dataset.fixed'), 'Community removes data-fixed attribute');
});

test('dashboard.js calls syncProPreferencesPanel after edition known', () => {
  const dash = read(path.join('apps', 'web', 'src', 'dashboard.js'));
  assert.ok(dash.includes('ctx.syncProPreferencesPanel?.()'), 'calls syncProPreferencesPanel');
  assert.ok(!dash.includes('proCard.open = state.edition'), 'no longer sets proCard.open inline');
});

test('operations.js Operativa cards handle edge cases without NaN or Infinity', () => {
  const ops = read(path.join('apps', 'web', 'src', 'operations.js'));

  // Verify the code guards against division by zero for latent pct
  assert.ok(ops.includes('openInvestment > 0'), 'guards latent pct against zero open investment');

  // Verify the code handles netContributed === 0 for result microcopy
  assert.ok(ops.includes('netContributed === 0'), 'handles zero netContributed for result microcopy');

  // Verify no hardcoded NaN, Infinity, or undefined in operations.js template literals
  const templateMatch = ops.match(/innerHTML\s*=\s*`[\s\S]*?`;/g) || [];
  for (const tpl of templateMatch) {
    assert.ok(!tpl.includes('NaN'), 'no NaN in template literals');
    assert.ok(!tpl.includes('Infinity'), 'no Infinity in template literals');
    assert.ok(!tpl.includes('undefined'), 'no undefined in template literals');
  }
});
