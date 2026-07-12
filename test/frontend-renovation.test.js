const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
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

function filesUnder(relativePath, extensions = new Set(['.js'])) {
  const base = path.join(root, relativePath);
  return fs.readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) return filesUnder(path.relative(root, full), extensions);
    return extensions.has(path.extname(entry.name)) ? [path.relative(root, full)] : [];
  });
}

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
  assert.ok(ledger.includes('type-dividend'), 'ledger uses type-dividend class');
  assert.ok(ledger.includes("ctx.t('history.events.dividend')"), 'ledger labels dividend transactions through i18n');
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
  assert.ok(css.includes('.type-dividend'), 'CSS defines type-dividend style');
  assert.ok(css.includes('.origin-auto'), 'CSS defines origin-auto style');
  assert.ok(css.includes('.origin-import'), 'CSS defines origin-import style');
});

test('ledger transaction editor is available only for one non-dividend selection', () => {
  const html = read('apps/web/index.html');
  const ledger = read(path.join('apps', 'web', 'src', 'ledger.js'));
  const editor = read(path.join('apps', 'web', 'src', 'transaction-editor.js'));
  const forms = read(path.join('apps', 'web', 'src', 'forms.js'));

  assert.ok(html.includes('id="edit-selected-transaction"'), 'ledger toolbar includes an edit action');
  assert.ok(html.includes('id="transaction-edit-dialog"'), 'transaction editor has its own modal');
  assert.ok(html.includes('id="add-note"'), 'buy/sell modal includes optional note field');
  assert.ok(ledger.includes('selectedCount === 1'), 'ledger requires exactly one selected row for edit');
  assert.ok(ledger.includes("selectedTransaction.type === 'dividend'"), 'ledger hides edit for dividends');
  assert.ok(ledger.includes('ledger-note-tooltip'), 'ledger shows saved notes without a new table column');
  assert.ok(editor.includes('/preview`'), 'editor requests server-side edit preview');
  assert.ok(editor.includes("'PUT'"), 'editor saves through PUT');
  assert.ok(forms.includes('payload.note = note'), 'creation payload includes optional note');
});

test('liquidity is separated from groups and instruments in the values dialog', () => {
  const html = read('apps/web/index.html');
  const app = read(path.join('apps', 'web', 'src', 'app.js'));
  const dom = read(path.join('apps', 'web', 'src', 'dom.js'));
  const dashboard = read(path.join('apps', 'web', 'src', 'dashboard.js'));
  const routes = read(path.join('apps', 'server', 'src', 'routes.js'));
  const liquidity = read(path.join('apps', 'web', 'src', 'liquidity.js'));
  const operations = read(path.join('apps', 'web', 'src', 'operations.js'));
  const forms = read(path.join('apps', 'web', 'src', 'forms.js'));
  const workflow = read(path.join('apps', 'web', 'src', 'import-workflow.js'));
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));

  assert.ok(html.includes('id="liquidity-section"'), 'values dialog includes dedicated liquidity section');
  assert.ok(html.includes('id="new-liquidity-balance"'), 'liquidity section edits current balance directly');
  assert.ok(!html.includes('new-liquidity-date'), 'liquidity section does not ask for a date');
  assert.ok(html.includes('instrument-config-section--groups'), 'values dialog separates the groups row visually');
  assert.ok(html.includes('instrument-config-section--liquidity'), 'values dialog separates the liquidity row visually');
  assert.ok(html.includes('instrument-config-section--values'), 'values dialog separates the instruments row visually');
  assert.ok(app.includes("from './liquidity.js'"), 'frontend imports liquidity module');
  assert.ok(app.includes('attachLiquidity'), 'frontend attaches liquidity module during startup');
  assert.ok(dom.includes("document.querySelector('#create-liquidity-account')"), 'DOM registers create liquidity button');
  assert.ok(dashboard.includes("ctx.fetchJson('/api/liquidity')"), 'dashboard loads liquidity state');
  assert.ok(dashboard.includes('ctx.renderLiquidity?.()'), 'dashboard renders liquidity section');
  assert.ok(routes.includes('route-liquidity'), 'backend registers liquidity routes');
  assert.ok(liquidity.includes('/api/liquidity/accounts'), 'liquidity module uses liquidity API');
  assert.ok(liquidity.includes('class="instrument-table liquidity-table"'), 'liquidity accounts render as a table');
  assert.ok(liquidity.includes('<th>ID</th>'), 'liquidity table starts with fixed technical identifier');
  assert.ok(liquidity.includes('data-select-liquidity'), 'liquidity rows can be selected like instruments');
  assert.ok(liquidity.includes('data-delete-selected-liquidity'), 'liquidity table exposes bulk delete action');
  assert.ok(liquidity.includes('data-save-liquidity'), 'liquidity rows expose save action');
  assert.ok(!liquidity.includes('data-delete-liquidity'), 'liquidity rows do not expose per-row delete action');
  assert.ok(liquidity.includes('selectedLiquiditySymbols'), 'liquidity selection is stored in state');
  assert.ok(liquidity.includes('class="row-select row-select-only"'), 'liquidity visibility uses standard checkbox styling');
  assert.ok(!liquidity.includes('data-liquidity-field="showInDistribution"') || !liquidity.includes('class="switch-field"><input type="checkbox" data-liquidity-field="showInDistribution"'), 'liquidity does not use switch-field checkbox styling');
  assert.ok(operations.includes("instrument.type !== 'fx' && instrument.type !== 'cash'"), 'normal instrument table excludes cash');
  assert.ok(forms.includes("instrument.type !== 'fx' && instrument.type !== 'cash'"), 'operation selectors exclude cash');
  assert.ok(workflow.includes("item.type !== 'fx' && item.type !== 'cash'"), 'import matching excludes cash');
  assert.ok(css.includes('.instrument-config-section-head'), 'CSS styles values dialog section headers');
  assert.ok(css.includes('.liquidity-create-form input'), 'CSS styles liquidity form inputs');
  assert.ok(css.includes('.liquidity-table'), 'CSS styles liquidity account table');
  const liquiditySectionCss = css.match(/\.instrument-config-section--liquidity\s*\{[^}]+\}/)?.[0] || '';
  assert.ok(!liquiditySectionCss.includes('background'), 'liquidity section keeps the neutral panel background');
  assert.ok(css.includes('align-items: start'), 'CSS prevents opened group cards from stretching sibling cards');
  assert.ok(css.includes('.group-visual-options .switch-field'), 'CSS aligns group display option controls');
});

test('frontend confirmations use the custom modal instead of native browser dialogs', () => {
  const html = read('apps/web/index.html');
  const app = read(path.join('apps', 'web', 'src', 'app.js'));
  const dom = read(path.join('apps', 'web', 'src', 'dom.js'));
  const confirmDialog = read(path.join('apps', 'web', 'src', 'confirm-dialog.js'));
  const nativeDialogPattern = /\b(?:window\.)?(?:confirm|alert|prompt)\s*\(/;

  assert.ok(html.includes('id="confirm-action-dialog"'), 'index.html contains the shared confirmation dialog');
  assert.ok(app.includes("from './confirm-dialog.js'"), 'app bootstraps the confirmation dialog module');
  assert.ok(dom.includes("document.querySelector('#confirm-action-dialog')"), 'dom.js registers confirmation dialog refs');
  assert.ok(confirmDialog.includes('confirmAction'), 'confirm-dialog.js exposes confirmAction');
  assert.ok(confirmDialog.includes('showModal()'), 'confirm-dialog.js uses the app modal pattern');

  for (const file of filesUnder(path.join('apps', 'web', 'src'))) {
    const source = read(file);
    assert.ok(!nativeDialogPattern.test(source), `${file} does not use native browser dialogs`);
  }
});

test('dividend review UI uses toolbar alert and automatic startup scan', () => {
  const html = read(path.join('apps', 'web', 'index.html'));
  const app = read(path.join('apps', 'web', 'src', 'app.js'));
  const dashboard = read(path.join('apps', 'web', 'src', 'dashboard.js'));
  const dividends = read(path.join('apps', 'web', 'src', 'dividends.js'));
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));

  assert.ok(html.includes('id="dividend-alert"'), 'toolbar contains dividend alert');
  assert.ok(html.includes('id="dividend-draft-dialog"'), 'HTML contains dividend draft dialog');
  assert.ok(html.includes('Dividendos pendientes'), 'dialog title is visible');
  assert.ok(app.includes("from './dividends.js'"), 'app imports dividends module');
  assert.ok(dashboard.includes('startDividendStartupScan'), 'dashboard starts dividend scan after load');
  assert.ok(dividends.includes('/api/dividends/scan'), 'dividend module calls scan API');
  assert.ok(dividends.includes("mode: 'startup'"), 'scan is startup-driven');
  assert.equal(dividends.includes('Buscar dividendos'), false, 'UI does not expose manual search button');
  assert.ok(dividends.includes("ctx.t('dividends.confirm')"), 'draft modal can confirm dividend');
  assert.ok(dividends.includes("ctx.t('dividends.autoNext')"), 'draft modal exposes auto include checkbox');
  assert.ok(dividends.includes("ctx.t('dividends.splitWarning')"), 'draft modal informs split limitation through i18n');
  assert.ok(css.includes('.dividend-draft-card'), 'CSS styles dividend draft cards');
  assert.ok(css.includes('.toolbar-badge'), 'CSS styles alert badge');
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

test('summary.js uses canonical donut identity for groups and detail instruments', () => {
  const summary = read(path.join('apps', 'web', 'src', 'summary.js'));
  assert.ok(summary.includes('function donutItemIdentity'), 'summary defines donutItemIdentity helper');
  assert.ok(summary.includes("item.type === 'group' && item.groupId"), 'groups use groupId identity');
  assert.ok(summary.includes('return `group:${item.groupId}`'), 'group identity is explicit');
  assert.ok(summary.includes('return `symbol:${item.symbol}`'), 'instrument identity is symbol-based');
  assert.ok(summary.includes('leftIdentity === rightIdentity'), 'sameDonutItem compares canonical identities');
  assert.ok(
    !summary.includes('left.groupId || right.groupId'),
    'groupId no longer wins for every item because detail instruments also have groupId',
  );
});

test('summary.js uses group colors only for group donut items', () => {
  const summary = read(path.join('apps', 'web', 'src', 'summary.js'));
  assert.ok(summary.includes('function donutItemColor'), 'summary defines donutItemColor helper');
  assert.ok(summary.includes("item?.type === 'group'"), 'only group items force group color');
  assert.ok(summary.includes('ctx.assetColor(item.symbol, item.color)'), 'instrument items use assetColor');
  assert.ok(!summary.includes('if (item?.groupId) return item.color'), 'groupId alone does not force group color');
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
  assert.ok(monthly.includes("ctx.t('monthly.subtitle.withData'"), 'monthly includes translated month count text');
  assert.ok(monthly.includes("ctx.t('monthly.subtitle.empty')"), 'monthly includes translated empty state text');
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
  assert.ok(charts.includes('history.stats.lastValue.label'), 'history stat label is resolved through i18n');
  assert.ok(charts.includes('history.stats.lastValue.tooltip'), 'history tooltip is resolved through i18n');
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

// ── Ledger export button and helpers ──

test('Exportar button removed from header and added to ledger-header-actions', () => {
  const html = read(path.join('apps', 'web', 'index.html'));
  assert.ok(!html.includes('id="toolbar-export-xlsx"'), 'toolbar-export-xlsx removed from header');
  assert.ok(html.includes('id="ledger-export-xlsx"'), 'ledger-export-xlsx exists in ledger');
  assert.ok(html.includes('ledger-header-actions'), 'button is inside ledger-header-actions');
});

test('ledger export dialog exists in HTML', () => {
  const html = read(path.join('apps', 'web', 'index.html'));
  assert.ok(html.includes('id="ledger-export-dialog"'), 'export dialog exists');
  assert.ok(html.includes('id="ledger-export-summary"'), 'export summary exists');
  assert.ok(html.includes('id="ledger-export-confirm"'), 'export confirm button exists');
  assert.ok(html.includes('id="ledger-export-cancel"'), 'export cancel button exists');
});

test('ledger.js exports shared helpers for filter reuse', () => {
  const ledger = read(path.join('apps', 'web', 'src', 'ledger.js'));
  assert.ok(ledger.includes('getLedgerFilterState'), 'exports getLedgerFilterState');
  assert.ok(ledger.includes('hasActiveLedgerFilters'), 'exports hasActiveLedgerFilters');
  assert.ok(ledger.includes('filterLedgerTransactions'), 'exports filterLedgerTransactions');
  assert.ok(ledger.includes('buildLedgerExportUrl'), 'exports buildLedgerExportUrl');
  assert.ok(ledger.includes('handleLedgerExport'), 'exports handleLedgerExport');
  assert.ok(ledger.includes('LEDGER_EXPORT_WARNING_THRESHOLD'), 'defines warning threshold constant');
});

test('ledger.js uses shared helpers in renderLedger', () => {
  const ledger = read(path.join('apps', 'web', 'src', 'ledger.js'));
  assert.ok(ledger.includes('getLedgerFilterState(elements)'), 'renderLedger uses getLedgerFilterState');
  assert.ok(ledger.includes('hasActiveLedgerFilters(filters)'), 'renderLedger uses hasActiveLedgerFilters');
  assert.ok(ledger.includes('filterLedgerTransactions(allTransactions, filters)'), 'renderLedger uses filterLedgerTransactions');
});

test('ledger i18n keys include export dialog translations', () => {
  const catalog = read(path.join('apps', 'web', 'src', 'i18n-catalog-ui.js'));
  assert.ok(catalog.includes('ledger.export.title'), 'has export title key');
  assert.ok(catalog.includes('ledger.export.confirm'), 'has export confirm key');
  assert.ok(catalog.includes('ledger.export.cancel'), 'has export cancel key');
  assert.ok(catalog.includes('ledger.export.allSummary'), 'has all summary key');
  assert.ok(catalog.includes('ledger.export.filteredSummary'), 'has filtered summary key');
  assert.ok(catalog.includes('ledger.export.heavyWarning'), 'has heavy warning key');
});

test('dom.js registers ledger export elements', () => {
  const dom = read(path.join('apps', 'web', 'src', 'dom.js'));
  assert.ok(dom.includes('ledgerExportXlsx'), 'dom registers ledgerExportXlsx');
  assert.ok(dom.includes('ledgerExportDialog'), 'dom registers ledgerExportDialog');
  assert.ok(dom.includes('ledgerExportConfirm'), 'dom registers ledgerExportConfirm');
  assert.ok(dom.includes('ledgerExportCancel'), 'dom registers ledgerExportCancel');
});

test('events.js wires ledger export button', () => {
  const events = read(path.join('apps', 'web', 'src', 'events.js'));
  assert.ok(events.includes('ledgerExportXlsx'), 'events references ledgerExportXlsx');
  assert.ok(events.includes('handleLedgerExport'), 'events calls handleLedgerExport');
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
  assert.ok(workflow.includes('renderImportSourceOptions(sources, edition, ctx.escapeHtml, ctx.t)'), 'workflow escapes and translates options through helper');
  assert.ok(helpers.includes('Professional Edition'), 'option labels include Professional Edition');
  assert.ok(helpers.includes('import.source.comingSoon'), 'option labels translate coming soon copy');
  assert.ok(helpers.includes('DEGIRO'), 'helpers maps degiro-csv key to DEGIRO');
  assert.ok(helpers.includes('Interactive Brokers'), 'helpers maps ibkr-csv to Interactive Brokers');
  assert.ok(helpers.includes('ClickTrade'), 'helpers maps clicktrade-xlsx to ClickTrade');
});

test('import source helper labels are plain text and match Pro teaser copy', () => {
  const helpers = read(path.join('apps', 'web', 'src', 'import-workflow-helpers.js'));
  assert.ok(helpers.includes("return name + ' - Professional Edition'"), 'Pro source labels use plain-text separator');
  assert.ok(
    helpers.includes('import.source.comingSoon') && helpers.includes('Professional Edition'),
    'comingSoon source labels include translated coming soon copy and edition',
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

test('history-preferences.js keeps Professional Edition teaser without filter controls', () => {
  const hp = read(path.join('apps', 'web', 'src', 'history-preferences.js'));
  assert.ok(!hp.includes('history-event-mode'), 'does not render event mode select in Community');
  assert.ok(!hp.includes('data-filter-asset'), 'does not render asset filter controls in Community');
  assert.ok(!hp.includes("sendJson('/api/preferences/ui', 'PUT', { historyEventFilters"), 'does not save history preferences in Community');
});

test('forms.js sends unitPrice in transaction payload', () => {
  const forms = read(path.join('apps', 'web', 'src', 'forms.js'));
  assert.ok(forms.includes('payload.unitPrice'), 'forms.js sends unitPrice payload');
  assert.ok(forms.includes('date: ctx.elements.addDate.value, entryMode'), 'forms.js sends entryMode payload');
  assert.ok(forms.includes("preview.type === 'remove' && preview.entryMode === 'manual_total_eur'"), 'forms.js labels manual EUR sells');
  assert.ok(forms.includes('payload.priceCurrency'), 'forms.js sends manual price currency payload');
  assert.ok(
    forms.indexOf("entryMode === 'manual_unit_price'") > forms.indexOf("entryMode === 'manual_total_eur'"),
    'manual unit price path must be separated from manual total EUR',
  );
  assert.ok(forms.includes("entryMode === 'market_eur'"), 'forms.js keeps market EUR mode explicit');
  assert.ok(forms.includes('payload.fxToEur'), 'forms.js sends manual FX payload when provided');
});

test('operation modal uses transaction entry mode tabs with common fields outside', () => {
  const index = read('apps/web/index.html');
  const modes = read(path.join('apps', 'web', 'src', 'transaction-entry-modes.js'));
  assert.ok(index.includes('name="add-entry-mode"'), 'operation modal includes entry mode tabs');
  assert.ok(index.includes('value="market_eur"'), 'operation modal includes market EUR mode');
  assert.ok(index.includes('value="manual_total_eur"'), 'operation modal includes manual total EUR mode');
  assert.ok(index.includes('value="manual_unit_price"'), 'operation modal includes manual unit price mode');
  assert.ok(index.indexOf('id="add-date"') < index.indexOf('id="add-calculation-section"'), 'date remains outside tabs');
  assert.ok(index.indexOf('id="add-commission-field"') > index.indexOf('id="add-calculation-section"'), 'commission remains after tabs');
  assert.ok(modes.includes("operationType.value === 'remove'"), 'sell mode is handled separately');
  assert.ok(modes.includes("return 'manual_total_eur'"), 'sell mode always resolves to manual total EUR');
  assert.ok(modes.includes('addEntryModeTabs.hidden = isSell'), 'sell mode hides entry mode tabs');
  assert.ok(modes.includes('transaction.field.grossSellEur'), 'sell mode labels gross EUR amount through i18n');
});

test('format.js renders quantity units by instrument type', async () => {
  const { attach } = await import(pathToFileURL(path.join(root, 'apps', 'web', 'src', 'format.js')).href);
  const ctx = {
    state: {
      hideBalances: false,
      instruments: [
        { symbol: 'STOCK1', type: 'stock' },
        { symbol: 'ETF1', type: 'etf' },
        { symbol: 'BTC', type: 'crypto' },
        { symbol: 'GOLD', type: 'commodity' },
      ],
    },
    sharesFormatter: new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }),
    cryptoSharesFormatter: new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }),
  };

  attach(ctx);

  assert.equal(ctx.instrumentQuantityLabel({ symbol: 'STOCK1' }), 'acciones');
  assert.equal(ctx.instrumentQuantityLabel({ symbol: 'ETF1' }), 'acciones');
  assert.equal(ctx.instrumentQuantityLabel({ symbol: 'BTC' }), 'unidades');
  assert.equal(ctx.instrumentQuantityLabel({ symbol: 'GOLD' }), 'unidades');
  assert.equal(ctx.instrumentQuantityLabel({ symbol: 'UNKNOWN' }), 'cantidad');
  assert.equal(ctx.formatInstrumentQuantity(1.234567, { symbol: 'BTC' }), '1,234567 unidades');
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

  // Tooltip content is now resolved through i18n keys.
  assert.ok(ops.includes("ctx.t('operations.metrics.netContributed.tooltip')"), 'aportado tooltip i18n key');
  assert.ok(ops.includes("ctx.t('operations.metrics.totalGain.tooltip')"), 'resultado tooltip i18n key');
  assert.ok(ops.includes("ctx.t('operations.metrics.unrealizedGain.tooltip')"), 'latent tooltip i18n key');

  // New microcopy for Aportado neto
  assert.ok(ops.includes('operations.metrics.netContributed.micro.positive'), 'aportado microcopy: positive key');
  assert.ok(ops.includes('operations.metrics.netContributed.micro.negative'), 'aportado microcopy: negative key');

  // New microcopy for Resultado total
  assert.ok(ops.includes('operations.metrics.totalGain.micro.withdrawn'), 'resultado microcopy: withdrawn key');
  assert.ok(ops.includes('operations.metrics.totalGain.micro.noContribution'), 'resultado microcopy: no contribution key');
  assert.ok(ops.includes('operations.metrics.totalGain.micro.overContributed'), 'resultado microcopy: over contributed key');

  // New microcopy for Plusvalía latente
  assert.ok(ops.includes('operations.metrics.unrealizedGain.micro.openInvestment'), 'latent microcopy: open investment key');
  assert.ok(ops.includes('operations.metrics.unrealizedGain.micro.noOpenInvestment'), 'latent microcopy: no open investment key');

  // Plusvalía realizada copy updated
  assert.ok(ops.includes('operations.metrics.realizedGain.micro'), 'realized copy i18n key');

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
  assert.ok(index.includes('id="dashboard-layout-preference-controls"'), 'PRO dashboard layout anchor exists');
});

test('CSS keeps Community teaser styles and no active PRO preference styles', () => {
  const css = read('apps/web/src/styles.css');
  assert.ok(!css.includes('.pro-preferences-card[open] .pro-preferences-summary'), 'old rule removed');
  assert.ok(css.includes('.pro-preferences-card.is-community-edition[open] .pro-preferences-summary'), 'Community rule keeps summary visible');
  assert.ok(!css.includes('.pro-preferences-card.is-pro-edition'), 'active PRO card styles live outside Community');
  assert.ok(!css.includes('.operations-preference-row'), 'active PRO operations styles live outside Community');
  assert.ok(!css.includes('.history-filter-checkbox'), 'active PRO history filter styles live outside Community');
  assert.ok(!css.includes('.return-breakdown-visibility-toggle'), 'active PRO return breakdown styles live outside Community');
  assert.ok(!css.includes('.dashboard-layout-row'), 'active PRO dashboard layout styles live outside Community');
});

test('community operations panel keeps fixed summaries and no metric selector wiring', () => {
  const ops = read(path.join('apps', 'web', 'src', 'operations.js'));
  assert.ok(ops.includes('const metricIds = DEFAULT_OPERATION_METRIC_IDS'), 'performance cards use fixed defaults');
  assert.ok(!ops.includes('operation-metric-select'), 'does not render metric selector controls');
  assert.ok(!ops.includes("sendJson('/api/preferences/ui', 'PUT', { operationsMetricIds"), 'does not save metric preferences');
});

test('community history rendering shows all events and no filter predicate', () => {
  const history = read(path.join('apps', 'web', 'src', 'history.js'));
  assert.ok(history.includes('return history.events;'), 'Community returns all history events');
  assert.ok(!history.includes('matchesHistoryEventFilters'), 'Community does not include premium filter predicate');
});

test('return-breakdown-preferences.js keeps Professional Edition teaser only', () => {
  const source = read(path.join('apps', 'web', 'src', 'return-breakdown-preferences.js'));
  assert.ok(!source.includes('sendJson'), 'does not persist return breakdown preferences in Community');
  assert.ok(!source.includes('/api/portfolio/returns'), 'does not fetch premium return data in Community');
});

test('history-preferences.js keeps syncProPreferencesPanel only for edition banner', () => {
  const hp = read(path.join('apps', 'web', 'src', 'history-preferences.js'));
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

test('history-preferences.js syncProPreferencesPanel hides Pro request card on PRO edition', () => {
  const hp = read(path.join('apps', 'web', 'src', 'history-preferences.js'));
  assert.ok(hp.includes('admin-card--pro-request'), 'targets the Pro request card selector');
  assert.ok(hp.includes('proRequestCard.hidden = isPro'), 'hides Pro request card when edition is professional');
  assert.ok(hp.includes('if (proRequestCard)'), 'guards against missing Pro request card');
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

// ── 17) Market data provider availability indicator ──

test('index.html includes market provider status indicator next to price-status', () => {
  const html = read('apps/web/index.html');
  assert.ok(html.includes('id="market-provider-status"'), 'index.html contains #market-provider-status element');
  assert.ok(html.includes('class="provider-status'), 'indicator uses provider-status class');
  assert.ok(html.includes('tabindex="0"'), 'indicator is focusable via tabindex');
  assert.ok(html.includes('role="img"'), 'indicator has role img for accessibility');

  const priceStatusPos = html.indexOf('id="price-status"');
  const providerStatusPos = html.indexOf('id="market-provider-status"');
  assert.ok(priceStatusPos > -1 && providerStatusPos > -1, 'both elements exist');
  assert.ok(providerStatusPos > priceStatusPos, 'indicator is placed after price-status');
});

test('index.html wraps provider status indicator with custom tooltip matching metric-info pattern', () => {
  const html = read('apps/web/index.html');
  assert.ok(html.includes('class="provider-status-wrap"'), 'indicator is wrapped in provider-status-wrap container');
  assert.ok(html.includes('id="market-provider-status-tooltip"'), 'custom tooltip element exists');
  assert.ok(html.includes('class="provider-status-tooltip"'), 'tooltip uses provider-status-tooltip class');
  assert.ok(html.includes('role="tooltip"'), 'tooltip has role tooltip for accessibility');
  assert.ok(html.includes('class="sr-only"'), 'sr-only span provides screen reader text');
  assert.ok(!html.includes('title="Yahoo Finance'), 'native title attribute is not used for the tooltip text');
});

test('dashboard.js loads /api/market-data/sources and stores it in state', () => {
  const dashboard = read(path.join('apps', 'web', 'src', 'dashboard.js'));
  assert.ok(dashboard.includes("ctx.fetchJson('/api/market-data/sources')"), 'dashboard fetches market-data sources');
  assert.ok(dashboard.includes('state.marketDataSources'), 'dashboard stores marketDataSources in state');
});

test('dashboard.js exposes renderMarketProviderStatus and computeProviderStatus', () => {
  const dashboard = read(path.join('apps', 'web', 'src', 'dashboard.js'));
  assert.ok(dashboard.includes('function renderMarketProviderStatus'), 'dashboard defines renderMarketProviderStatus');
  assert.ok(dashboard.includes('function computeProviderStatus'), 'dashboard defines computeProviderStatus');
  assert.ok(dashboard.includes('renderMarketProviderStatus'), 'dashboard exports renderMarketProviderStatus');
  assert.ok(dashboard.includes('provider-status-${level}'), 'dashboard builds provider-status class from level');
  assert.ok(dashboard.includes('marketProviderStatusTooltip'), 'dashboard updates custom tooltip element');
  assert.ok(dashboard.includes('--provider-status-accent'), 'dashboard sets accent color via CSS variable');
});

test('dashboard.js computeProviderStatus tooltip includes provider names', () => {
  const dashboard = read(path.join('apps', 'web', 'src', 'dashboard.js'));
  assert.ok(dashboard.includes('Yahoo Finance'), 'tooltip mentions Yahoo Finance');
  assert.ok(dashboard.includes('Alpha Vantage'), 'tooltip mentions Alpha Vantage');
  assert.ok(dashboard.includes('no configurado'), 'tooltip handles unconfigured Alpha Vantage');
  assert.ok(dashboard.includes('incidencias registradas'), 'tooltip handles both providers down');
});

test('dom.js registers marketProviderStatus and tooltip elements', () => {
  const dom = read(path.join('apps', 'web', 'src', 'dom.js'));
  assert.ok(dom.includes("document.querySelector('#market-provider-status')"), 'dom.js registers marketProviderStatus');
  assert.ok(dom.includes("document.querySelector('#market-provider-status-tooltip')"), 'dom.js registers marketProviderStatusTooltip');
});

test('styles.css defines provider status indicator classes and custom tooltip', () => {
  const css = read(path.join('apps', 'web', 'src', 'styles.css'));
  assert.ok(css.includes('.provider-status'), 'CSS defines .provider-status base class');
  assert.ok(css.includes('.provider-status-ok'), 'CSS defines provider-status-ok');
  assert.ok(css.includes('.provider-status-warn'), 'CSS defines provider-status-warn');
  assert.ok(css.includes('.provider-status-error'), 'CSS defines provider-status-error');
  assert.ok(css.includes('border-radius: 50%'), 'indicator is circular');
  assert.ok(css.includes('.provider-status-wrap'), 'CSS defines wrapper with position relative');
  assert.ok(css.includes('.provider-status-tooltip'), 'CSS defines custom tooltip class');
  assert.ok(css.includes('--provider-status-accent'), 'tooltip accent color uses CSS variable');
  assert.ok(css.includes('border-left: 3px solid'), 'tooltip has left accent border like metric-info-tooltip');
  assert.ok(css.includes('box-shadow: var(--shadow-sm)'), 'tooltip uses same shadow as metric-info-tooltip');
  assert.ok(css.includes('background: var(--card)'), 'tooltip uses card background');
  assert.ok(css.includes('opacity: 0'), 'tooltip starts hidden');
  assert.ok(css.includes(':focus-within .provider-status-tooltip'), 'tooltip shows on keyboard focus');
});

test('computeProviderStatus helper returns correct level for each provider state combination', async () => {
  const { computeProviderStatus } = await import(pathToFileURL(path.join(root, 'apps', 'web', 'src', 'dashboard.js')).href);

  const providers = [
    { key: 'yahoo', label: 'Yahoo Finance', enabled: true, primary: true },
    { key: 'alpha_vantage', label: 'Alpha Vantage', enabled: false, primary: false },
  ];

  // No known errors -> ok
  assert.equal(computeProviderStatus({ providers, states: [] }).level, 'ok');

  // No data at all -> ok
  assert.equal(computeProviderStatus(null).level, 'ok');

  // Only Yahoo error -> warn
  const yahooError = computeProviderStatus({
    providers,
    states: [{ provider: 'yahoo', status: 'error', reason: 'timeout' }],
  });
  assert.equal(yahooError.level, 'warn');
  assert.ok(yahooError.tooltip.includes('Yahoo Finance'), 'warn tooltip mentions Yahoo Finance');

  // Only Alpha error (but Alpha not configured) -> ok (does not degrade)
  const alphaErrorUnconfigured = computeProviderStatus({
    providers,
    states: [{ provider: 'alpha_vantage', status: 'error', reason: 'rate limit' }],
  });
  assert.equal(alphaErrorUnconfigured.level, 'ok');

  // Only Alpha error (Alpha configured) -> warn
  const alphaConfiguredProviders = [
    { key: 'yahoo', label: 'Yahoo Finance', enabled: true, primary: true },
    { key: 'alpha_vantage', label: 'Alpha Vantage', enabled: true, primary: false },
  ];
  const alphaError = computeProviderStatus({
    providers: alphaConfiguredProviders,
    states: [{ provider: 'alpha_vantage', status: 'error', reason: 'rate limit' }],
  });
  assert.equal(alphaError.level, 'warn');
  assert.ok(alphaError.tooltip.includes('Alpha Vantage'), 'warn tooltip mentions Alpha Vantage');

  // Both error -> error
  const bothError = computeProviderStatus({
    providers: alphaConfiguredProviders,
    states: [
      { provider: 'yahoo', status: 'error', reason: 'down' },
      { provider: 'alpha_vantage', status: 'error', reason: 'rate limit' },
    ],
  });
  assert.equal(bothError.level, 'error');
  assert.ok(bothError.tooltip.includes('incidencias registradas'), 'error tooltip mentions both providers down');

  // Alpha unconfigured, no errors -> ok with "no configurado" tooltip
  const okUnconfigured = computeProviderStatus({ providers, states: [] });
  assert.equal(okUnconfigured.level, 'ok');
  assert.ok(okUnconfigured.tooltip.includes('no configurado'), 'ok tooltip says Alpha Vantage is no configurado');
});

test('administration dialog contains an update card wired to the update service', () => {
  const html = read('apps/web/index.html');
  const dom = read('apps/web/src/dom.js');
  const events = read('apps/web/src/events.js');
  const app = read('apps/web/src/app.js');
  const updates = read('apps/web/src/updates.js');

  assert.ok(html.includes('admin-card--update'), 'admin dialog contains an update card');
  assert.ok(html.includes('id="update-check"'), 'update card has a check button');
  assert.ok(html.includes('id="update-download"'), 'update card has a download button');
  assert.ok(html.includes('id="update-docker-commands"'), 'update card has docker commands button');
  assert.ok(html.includes('id="update-release-notes"'), 'update card links to release notes');
  assert.ok(html.includes('id="update-current-version"'), 'update card shows current version');
  assert.ok(html.includes('id="update-latest-version"'), 'update card shows latest version');
  assert.ok(html.includes('id="update-db-status"'), 'update card shows DB status');
  assert.ok(dom.includes('updateCheck'), 'dom module exposes update check button');
  assert.ok(dom.includes('updateDownload'), 'dom module exposes update download button');
  assert.ok(dom.includes('updateDockerCommands'), 'dom module exposes docker commands button');
  assert.ok(dom.includes('proRequestLink'), 'dom module exposes Pro request link');
  assert.ok(app.includes("from './updates.js'"), 'app imports the updates module');
  assert.ok(app.includes('attachUpdates'), 'app attaches the updates module');
  assert.ok(events.includes('loadUpdateStatus'), 'admin dialog triggers update status on open');
  assert.ok(updates.includes('fetchJson'), 'updates module fetches update status from the API');
  assert.ok(updates.includes('/api/update/status'), 'updates module calls the update status endpoint');
});

test('Solicitar Professional Edition button links to valorgrid.app/pro', () => {
  const html = read('apps/web/index.html');

  assert.ok(html.includes('id="pro-request-link"'), 'admin dialog contains a Pro request link');
  assert.ok(
    html.includes('href="https://valorgrid.app/pro/"'),
    'Pro request link points to https://valorgrid.app/pro/',
  );
  assert.ok(
    html.includes('target="_blank" rel="noopener"'),
    'Pro request link opens in a new tab safely',
  );
  assert.ok(html.includes('data-i18n="pro.request"'), 'Pro request button uses i18n key');
});

test('update and Pro request i18n keys exist in both ES and EN catalogs', () => {
  const catalog = read('apps/web/src/i18n-catalog-ui.js');

  for (const key of [
    'updates.title',
    'updates.currentVersion',
    'updates.latestVersion',
    'updates.check',
    'updates.download',
    'updates.dockerCommands',
    'updates.dbStatus',
    'updates.openRelease',
    'updates.available',
    'updates.error',
    'updates.downloadHint',
    'pro.request',
    'pro.requestDescription',
  ]) {
    assert.ok(catalog.includes(`'${key}'`), `${key} must exist in the i18n catalog`);
  }
});
