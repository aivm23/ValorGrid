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
  const ops = read(path.join('client', 'operations.js'));
  assert.ok(ops.includes('has-border-accent'), 'operations uses has-border-accent');
  assert.ok(ops.includes('has-border-positive'), 'operations uses has-border-positive');
  assert.ok(ops.includes('has-border-negative'), 'operations uses has-border-negative');
  assert.ok(ops.includes('has-border-amber'), 'operations uses has-border-amber');
  assert.ok(ops.includes('metric-micro'), 'operations uses metric-micro for micro-info');
});

test('monthly.js renders YTD KPI cards with semantic border classes', async () => {
  const monthly = read(path.join('client', 'monthly.js'));
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
  const charts = read(path.join('client', 'charts.js'));
  assert.ok(charts.includes('historyLineGrad'), 'charts defines historyLineGrad ID');
  assert.ok(charts.includes('historyAreaGrad'), 'charts defines historyAreaGrad ID');
  assert.ok(charts.includes('linearGradient'), 'charts uses linearGradient element');
  assert.ok(charts.includes('history-line'), 'charts defines history-line class');
  assert.ok(charts.includes('history-area'), 'charts defines history-area class');

  // Verify CSS references the gradients via url()
  const css = read('styles.css');
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
  const ledger = read(path.join('client', 'ledger.js'));
  assert.ok(ledger.includes('type-badge'), 'ledger uses type-badge class');
  assert.ok(ledger.includes('type-sell'), 'ledger uses type-sell class');
  assert.ok(ledger.includes('type-buy'), 'ledger uses type-buy class');
  assert.ok(ledger.includes('origin-badge'), 'ledger uses origin-badge class');
  assert.ok(ledger.includes('origin-auto'), 'ledger uses origin-auto class');
  assert.ok(ledger.includes('origin-import'), 'ledger uses origin-import class');
  assert.ok(ledger.includes('origin-manual'), 'ledger uses origin-manual class');
});

test('CSS defines hover states for ledger table rows', () => {
  const css = read('styles.css');
  assert.ok(css.includes('tbody tr:hover'), 'CSS defines tbody tr:hover');
  assert.ok(css.includes('tbody tr.is-selected'), 'CSS defines is-selected row state');
  assert.ok(css.includes('.type-buy'), 'CSS defines type-buy style');
  assert.ok(css.includes('.type-sell'), 'CSS defines type-sell style');
  assert.ok(css.includes('.origin-auto'), 'CSS defines origin-auto style');
  assert.ok(css.includes('.origin-import'), 'CSS defines origin-import style');
});

// ── 4) Modal entrance/exit animations ──

test('CSS defines modal entrance and exit keyframe animations', () => {
  const css = read('styles.css');
  assert.ok(css.includes('@keyframes modalIn'), 'CSS defines modalIn animation');
  assert.ok(css.includes('@keyframes modalOut'), 'CSS defines modalOut animation');
  assert.ok(css.includes('.modal.is-closing'), 'CSS uses is-closing class for exit');
  assert.ok(css.includes('scale(0.96)'), 'modal animation uses scale');
  assert.ok(css.includes('translateY(8px)'), 'modal animation uses translateY');
});

// ── 5) Donut chart entrance animation and radial offset hover ──

test('CSS defines donut chart entrance animation', () => {
  const css = read('styles.css');
  assert.ok(css.includes('@keyframes donutIn'), 'CSS defines donutIn animation');
  assert.ok(css.includes('transform: scale(0.88)'), 'donutIn starts with scale down');
  assert.ok(css.includes('opacity: 0'), 'donutIn starts with opacity 0');
});

test('CSS defines donut chart active segment radial offset', () => {
  const css = read('styles.css');
  assert.ok(css.includes('.donut-chart-active'), 'CSS defines donut-chart-active class');
  assert.ok(css.includes('--donut-active-x'), 'CSS uses --donut-active-x property');
  assert.ok(css.includes('--donut-active-y'), 'CSS uses --donut-active-y property');
  assert.ok(css.includes('--donut-active-start'), 'CSS uses --donut-active-start property');
  assert.ok(css.includes('--donut-active-end'), 'CSS uses --donut-active-end property');
});

test('summary.js sets CSS custom properties for active donut segment', () => {
  const summary = read(path.join('client', 'summary.js'));
  assert.ok(summary.includes('--donut-active-color'), 'summary sets --donut-active-color');
  assert.ok(summary.includes('--donut-active-start'), 'summary sets --donut-active-start');
  assert.ok(summary.includes('--donut-active-end'), 'summary sets --donut-active-end');
  assert.ok(summary.includes('--donut-active-x'), 'summary sets --donut-active-x');
  assert.ok(summary.includes('--donut-active-y'), 'summary sets --donut-active-y');
  assert.ok(summary.includes('donut-chart-active'), 'summary toggles donut-chart-active class');
});

// ── 6) Sub-chart slide-in animation ──

test('CSS defines sub-chart slide-in keyframe animation', () => {
  const css = read('styles.css');
  assert.ok(css.includes('@keyframes subchartIn'), 'CSS defines subchartIn animation');
  assert.ok(css.includes('translateX(16px)'), 'subchartIn starts with translateX offset');
  assert.ok(css.includes('.subchart'), 'CSS targets .subchart with animation');
});

// ── 7) Price freshness indicator ──

test('summary.js computes price freshness with emoji indicators', async () => {
  seedTestInstrument({ symbol: 'FRESH1', yahooSymbol: 'FRESH1.DE', name: 'Freshness Test', type: 'stock' });
  cachePrice('FRESH1.DE', '2026-05-14', 25);

  await createTransaction({ type: 'add', symbol: 'FRESH1', date: '2026-05-14', shares: 1 });

  const { response, body } = await jsonRequest('/api/portfolio/summary');
  assert.equal(response.status, 200);
  assert.ok(body.updatedAt, 'summary has updatedAt timestamp');

  // Verify summary.js source uses freshness logic
  const summary = read(path.join('client', 'summary.js'));
  assert.ok(summary.includes('freshness'), 'summary computes freshness');
  assert.ok(summary.includes('priceStatus'), 'summary updates priceStatus element');
  assert.ok(summary.includes('Yahoo Finance'), 'summary references Yahoo Finance in status text');
  assert.ok(summary.includes('hace'), 'summary uses relative time label');
});

// ── 8) YTD subtitle with month count ──

test('monthly.js sets YTD subtitle with completed month count', async () => {
  const monthly = read(path.join('client', 'monthly.js'));
  assert.ok(monthly.includes('ytdSubtitle'), 'monthly references ytdSubtitle element');
  assert.ok(monthly.includes('meses con datos'), 'monthly includes month count text');
  assert.ok(monthly.includes('A la espera del primer movimiento'), 'monthly includes empty state text');
  assert.ok(monthly.includes('completedMonths'), 'monthly uses completedMonths for count');
});

// ── 9) History subtitle with first date ──

test('charts.js sets history subtitle with first date', async () => {
  const charts = read(path.join('client', 'charts.js'));
  assert.ok(charts.includes('historySubtitle'), 'charts references historySubtitle element');
  assert.ok(charts.includes('first.date'), 'charts uses first date from series');
  assert.ok(charts.includes('formatPlainDate'), 'charts formats the date');
});

// ── 10) Ledger filter info with result count ──

test('ledger.js shows filter info with result count when filters are active', async () => {
  seedTestInstrument({ symbol: 'FILTER1', yahooSymbol: 'FILTER1.DE', name: 'Filter Test', type: 'stock' });
  cachePrice('FILTER1.DE', '2026-05-14', 20);

  await createTransaction({ type: 'add', symbol: 'FILTER1', date: '2026-05-14', shares: 1 });

  const { response, body } = await jsonRequest('/api/transactions');
  assert.equal(response.status, 200);
  assert.ok(body.transactions.length > 0, 'transactions exist for filtering');

  // Verify ledger.js source shows filter info
  const ledger = read(path.join('client', 'ledger.js'));
  assert.ok(ledger.includes('ledgerFilterInfo'), 'ledger references ledgerFilterInfo element');
  assert.ok(ledger.includes('Mostrando'), 'ledger shows "Mostrando X de Y" text');
  assert.ok(ledger.includes('movimientos'), 'ledger includes result count label');
  assert.ok(ledger.includes('hasFilters'), 'ledger checks for active filters');
});

// ── 11) Checkbox animation ──

test('CSS defines checkbox check animation with scale and clip-path', () => {
  const css = read('styles.css');
  assert.ok(css.includes('@keyframes checkPop'), 'CSS defines checkPop animation');
  assert.ok(css.includes('transform: scale(0)'), 'checkbox starts unchecked with scale 0');
  assert.ok(css.includes('transform: scale(1.2)'), 'checkPop has overshoot scale');
  assert.ok(css.includes('clip-path: polygon'), 'checkbox uses clip-path for checkmark');
  assert.ok(css.includes('appearance: none'), 'checkbox uses custom styling');
  assert.ok(css.includes('transition:'), 'checkbox has transition properties');
});

// ── 12) Bulk toolbar slide-in and delete button pulse ──

test('CSS defines bulk toolbar slide-in animation', () => {
  const css = read('styles.css');
  assert.ok(css.includes('@keyframes bulkToolbarIn'), 'CSS defines bulkToolbarIn animation');
  assert.ok(css.includes('transform: translateY(8px)'), 'bulkToolbarIn starts with translateY offset');
  assert.ok(css.includes('.bulk-toolbar'), 'CSS targets bulk-toolbar with animation');
});

test('CSS defines delete button pulse animation on hover', () => {
  const css = read('styles.css');
  assert.ok(css.includes('@keyframes deletePulse'), 'CSS defines deletePulse animation');
  assert.ok(css.includes('.icon-bulk-delete:hover'), 'delete pulse triggers on hover');
  assert.ok(css.includes('box-shadow'), 'delete pulse uses box-shadow');
  assert.ok(css.includes('var(--negative)'), 'delete pulse uses negative color');
});

// ── 13) Dark mode grid line opacity ──

test('CSS reduces grid line opacity in dark mode', () => {
  const css = read('styles.css');
  assert.ok(css.includes('[data-theme="dark"] .history-grid-line'), 'CSS targets dark mode grid lines');
  assert.ok(css.includes('opacity: 0.15'), 'dark mode grid lines have reduced opacity');
  assert.ok(css.includes('.history-reference-line'), 'CSS defines reference line style');
  assert.ok(css.includes('[data-theme="dark"] .history-reference-line'), 'CSS targets dark mode reference lines');
});

// ── 14) Legend separator between groups ──

test('charts.js renders legend separator before STOCK group', async () => {
  const charts = read(path.join('client', 'charts.js'));
  assert.ok(charts.includes('legend-separator'), 'charts uses legend-separator class');
  assert.ok(charts.includes('hasSeparator'), 'charts computes hasSeparator flag');
  assert.ok(charts.includes("item.symbol === 'STOCK'"), 'charts checks for STOCK symbol');
});

test('CSS defines legend separator styling', () => {
  const css = read('styles.css');
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
    const source = read(path.join('client', mod));
    assert.ok(
      source.includes('export function attach') || source.includes('export { attach }'),
      `${mod} exports attach function`,
    );
    assert.ok(source.includes('Object.assign(ctx'), `${mod} extends ctx namespace`);
  }

  // events.js is the event-wiring module; it uses ctx but does not extend it
  const eventsSource = read(path.join('client', 'events.js'));
  assert.ok(eventsSource.includes('export function attach'), 'events.js exports attach function');
  assert.ok(eventsSource.includes('const { elements, state'), 'events.js destructures ctx');
});

// ── Integration: verify CSS class coverage for all new features ──

test('CSS contains all semantic border classes used by KPI cards', () => {
  const css = read('styles.css');
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
  const css = read('styles.css');
  assert.ok(css.includes('.metric-micro'), 'CSS defines metric-micro class');
  assert.ok(css.includes('font-family: var(--font-mono)'), 'metric-micro uses monospace font');
  assert.ok(css.includes('tabular-nums'), 'metric-micro uses tabular-nums');
});
