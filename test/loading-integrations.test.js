const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('refreshPrices button uses withAppLoading', () => {
  const events = read('apps/web/src/events.js');
  assert.ok(events.includes('ctx.withAppLoading'), 'events.js uses withAppLoading');
  assert.ok(events.includes('loading.dashboard.title'), 'events.js uses loading.dashboard.title');
});

test('history range change uses withAppLoading', () => {
  const history = read('apps/web/src/history.js');
  assert.ok(history.includes('ctx.withAppLoading'), 'history.js uses withAppLoading');
  assert.ok(history.includes('loading.history.title'), 'history.js uses loading.history.title');
});

test('transaction submit (buy/sell) uses withAppLoading', () => {
  const forms = read('apps/web/src/forms.js');
  assert.ok(forms.includes('loading.buy.title'), 'forms.js has loading.buy.title');
  assert.ok(forms.includes('loading.sell.title'), 'forms.js has loading.sell.title');
  assert.ok(forms.includes('loading.buy.message'), 'forms.js has loading.buy.message');
  assert.ok(forms.includes('loading.sell.message'), 'forms.js has loading.sell.message');
  assert.ok(forms.includes('buildTransactionLoadingSummary'), 'transaction preview is adapted for the loading dialog');
  assert.ok(
    forms.includes('summary: buildTransactionLoadingSummary(preview)'),
    'validated summary is shown while saving',
  );
  assert.ok(!forms.includes('setTimeout(closeAddDialog, 1800)'), 'transaction dialog has no fixed success delay');
});

test('transaction editor uses withAppLoading', () => {
  const editor = read('apps/web/src/transaction-editor.js');
  assert.ok(editor.includes('loading.edit.title'), 'transaction-editor has loading.edit.title');
  assert.ok(editor.includes('loading.edit.message'), 'transaction-editor has loading.edit.message');
});

test('bulk delete transactions uses withAppLoading', () => {
  const bulk = read('apps/web/src/bulk-actions.js');
  assert.ok(bulk.includes('loading.delete.title'), 'bulk-actions has loading.delete.title');
  assert.ok(bulk.includes('loading.delete.message'), 'bulk-actions has loading.delete.message');
  assert.ok(bulk.includes('loading.instrument.delete.title'), 'bulk-actions has loading.instrument.delete.title');
  assert.ok(bulk.includes('loading.instrument.check.title'), 'bulk-actions has loading.instrument.check.title');
  assert.ok(bulk.includes('loading.groups.delete.title'), 'bulk-actions has loading.groups.delete.title');
  assert.ok(bulk.includes('loading.groups.delete.message'), 'bulk-actions has loading.groups.delete.message');
});

test('auto plan save uses withAppLoading', () => {
  const autoPlan = read('apps/web/src/auto-plan-form.js');
  assert.ok(autoPlan.includes('loading.contributions.save.title'), 'has loading.contributions.save.title');
  assert.ok(autoPlan.includes('loading.contributions.save.message'), 'has loading.contributions.save.message');
  assert.ok(autoPlan.includes('loading.contributions.preview'), 'preview is part of the observed loading flow');
});

test('onboarding uses withAppLoading', () => {
  const onboarding = read('apps/web/src/onboarding.js');
  assert.ok(onboarding.includes('loading.onboarding.title'), 'has loading.onboarding.title');
  assert.ok(onboarding.includes('loading.onboarding.message'), 'has loading.onboarding.message');
});

test('instrument events uses withAppLoading for all actions', () => {
  const ie = read('apps/web/src/instrument-events.js');
  assert.ok(ie.includes('loading.groups.create.title'), 'has groups.create');
  assert.ok(ie.includes('loading.instrument.create.title'), 'has instrument.create');
  assert.ok(ie.includes('loading.instrument.save.title'), 'has instrument.save');
  assert.ok(ie.includes('loading.groups.save.title'), 'has groups.save');
  assert.ok(ie.includes('loading.groups.toggle.title'), 'has groups.toggle');
});

test('brand palette toggle uses withAppLoading', () => {
  const colors = read('apps/web/src/instrument-colors.js');
  assert.ok(colors.includes('loading.palette.enable.title'), 'has palette.enable.title');
  assert.ok(colors.includes('loading.palette.disable.title'), 'has palette.disable.title');
  assert.ok(colors.includes('loading.palette.enable.message'), 'has palette.enable.message');
  assert.ok(colors.includes('loading.palette.disable.message'), 'has palette.disable.message');
});

test('liquidity operations use withAppLoading', () => {
  const liq = read('apps/web/src/liquidity.js');
  assert.ok(liq.includes('loading.liquidity.create.title'), 'has liquidity.create');
  assert.ok(liq.includes('loading.liquidity.save.title'), 'has liquidity.save');
  assert.ok(liq.includes('loading.liquidity.delete.title'), 'has liquidity.delete');
  assert.ok(liq.includes('loading.liquidity.message'), 'has liquidity.message');
});

test('alpha vantage setup uses withAppLoading', () => {
  const av = read('apps/web/src/alpha-vantage-setup.js');
  assert.ok(av.includes('loading.alphaVantage.check.title'), 'has alphaVantage.check');
  assert.ok(av.includes('loading.alphaVantage.check.message'), 'has alphaVantage.check.message');
  assert.ok(av.includes('loading.alphaVantage.validate.title'), 'key validation uses its own observed operation');
  assert.ok(av.includes('loading.alphaVantage.create.title'), 'deferred creation uses its own observed operation');
  assert.ok(!av.includes('return new Promise'), 'loading never waits for assistant interaction');
});

test('import dialog and preview use withAppLoading', () => {
  const imports = read('apps/web/src/imports.js');
  assert.ok(imports.includes('loading.import.open.title'), 'has import.open');
  assert.ok(imports.includes('loading.import.analyze.title'), 'has import.analyze');
  assert.ok(imports.includes('loading.import.read.title'), 'file reading is observed');
  assert.ok(imports.includes('loading.import.validateInstruments.title'), 'instrument validation has phase copy');
  assert.ok(imports.includes('loading.import.validateOperations.title'), 'operation validation has phase copy');
});

test('import template download uses withAppLoading', () => {
  const wf = read('apps/web/src/import-workflow.js');
  assert.ok(wf.includes('loading.template.title'), 'has template.title');
});

test('ledger export uses withAppLoading', () => {
  const ledger = read('apps/web/src/ledger.js');
  assert.ok(ledger.includes('loading.export.title'), 'has export.title');
});

test('dividend operations use withAppLoading', () => {
  const div = read('apps/web/src/dividends.js');
  assert.ok(div.includes('loading.dividends.open.title'), 'has dividends.open');
  assert.ok(div.includes('loading.dividends.save.title'), 'has dividends.save');
  assert.ok(div.includes('loading.dividends.confirm.title'), 'has dividends.confirm');
  assert.ok(div.includes('loading.dividends.confirm.message'), 'has dividends.confirm.message');
  assert.ok(div.includes('loading.dividends.dismiss.title'), 'has dividends.dismiss');
  assert.ok(div.includes('loading.dividends.preference.title'), 'has dividends.preference');
});

test('backup operations use withAppLoading', () => {
  const events = read('apps/web/src/events.js');
  assert.ok(events.includes('loading.backup.create.title'), 'has backup.create');
  assert.ok(events.includes('loading.backup.delete.title'), 'has backup.delete');
});

test('update operations use withAppLoading', () => {
  const updates = read('apps/web/src/updates.js');
  assert.ok(updates.includes('loading.update.check.title'), 'has update.check');
  assert.ok(updates.includes('loading.update.check.message'), 'has update.check.message');
  assert.ok(updates.includes('loading.update.docker.title'), 'has update.docker');
});

test('import commit and rollback use withAppLoading', () => {
  const imports = read('apps/web/src/imports.js');
  const batches = read('apps/web/src/import-batches.js');
  assert.ok(imports.includes('loading.import.commit.title'), 'has import.commit');
  assert.ok(imports.includes('loading.import.commit.message'), 'has import.commit.message');
  assert.ok(batches.includes('loading.import.rollback.title'), 'has import.rollback');
});

test('no orphaned loading keys in catalog (ES = EN)', () => {
  const catalog = read('apps/web/src/i18n-catalog-loading.js');
  const esKeys = [];
  const enKeys = [];
  let inEs = false;
  let inEn = false;
  for (const line of catalog.split('\n')) {
    if (line.includes('es: {')) inEs = true;
    if (line.includes('en: {')) {
      inEs = false;
      inEn = true;
    }
    const match = line.match(/^    '([^']+)':/);
    if (match) {
      if (inEs) esKeys.push(match[1]);
      if (inEn) enKeys.push(match[1]);
    }
  }
  const esSet = new Set(esKeys);
  const enSet = new Set(enKeys);
  for (const key of esSet) {
    assert.ok(enSet.has(key), `ES key "${key}" missing from EN`);
  }
  for (const key of enSet) {
    assert.ok(esSet.has(key), `EN key "${key}" missing from ES`);
  }

  const sourceDir = path.join(__dirname, '..', 'apps', 'web', 'src');
  const source = fs
    .readdirSync(sourceDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'i18n-catalog-loading.js')
    .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
  const referenced = new Set([...source.matchAll(/['"](loading\.[A-Za-z0-9.]+)['"]/g)].map((match) => match[1]));
  for (const key of referenced) {
    assert.ok(esSet.has(key), `Referenced loading key "${key}" missing from catalog`);
  }
});

test('boot loader reflects the real initial promises and keeps a recoverable error state', () => {
  const app = read('apps/web/src/app.js');
  const dashboard = read('apps/web/src/dashboard.js');
  assert.ok(app.includes('Promise.allSettled'), 'boot waits for its initial operations');
  assert.ok(app.includes('refreshDashboard({ throwOnError: true })'), 'dashboard boot failures reject');
  assert.ok(app.includes("setBootState('error'"), 'boot failure remains visible');
  assert.ok(dashboard.includes('if (options.throwOnError) throw error'), 'dashboard supports strict boot loading');
});

test('startup scan does NOT use withAppLoading', () => {
  const div = read('apps/web/src/dividends.js');
  const scanIdx = div.indexOf('startDividendStartupScan');
  if (scanIdx !== -1) {
    const around = div.substring(scanIdx, scanIdx + 500);
    assert.ok(!around.includes('withAppLoading'), 'startup scan does not use withAppLoading');
  }
});
