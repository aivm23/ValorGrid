const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { assert, jsonRequest, registerLifecycle } = require('./integration-helpers');

registerLifecycle(test);

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('frontend i18n layer is wired into app bootstrap and preferences', () => {
  const app = read('apps/web/src/app.js');
  const html = read('apps/web/index.html');
  const dom = read('apps/web/src/dom.js');
  const events = read('apps/web/src/events.js');
  const i18n = read('apps/web/src/i18n.js');
  const catalog = read('apps/web/src/i18n-catalog.js');

  assert.ok(app.includes("from './i18n.js'"), 'app imports i18n module');
  assert.ok(app.includes('attachI18n'), 'app attaches i18n before rendering');
  assert.ok(app.includes('ctx.initLanguage();'), 'app initializes language preference');
  assert.ok(html.includes('id="language-select"'), 'admin preferences expose language selector');
  assert.ok(dom.includes('languageSelect'), 'dom module exposes language selector');
  assert.ok(events.includes('handleLanguageChange'), 'events module wires language changes');
  assert.ok(i18n.includes('registerTranslations'), 'extensions can register private dictionaries');
  assert.ok(i18n.includes('MutationObserver'), 'dynamic DOM mutations are translated');
  assert.ok(i18n.includes("data-i18n"), 'static DOM nodes can bind explicit i18n keys');
  assert.ok(i18n.includes("data-label"), 'responsive table labels are translated');
  assert.ok(i18n.includes("from './i18n-catalog.js'"), 'i18n imports the shared catalog');
  assert.ok(catalog.includes('BASE_TEXT_TRANSLATIONS'), 'catalog exports base translations');
  assert.ok(catalog.includes("from './i18n-catalog-modals.js'"), 'catalog imports modal translations');
  assert.ok(catalog.includes("from './i18n-catalog-import.js'"), 'catalog imports import workflow translations');
});

test('frontend number formatting is centralized behind locale helpers', () => {
  const offenders = [];
  for (const relativePath of ['apps/web/src/state.js', 'apps/web/src/monthly.js']) {
    const source = read(relativePath);
    if (source.includes("Intl.NumberFormat('es-ES'") || source.includes("toLocaleString('es-ES'")) {
      offenders.push(relativePath);
    }
  }
  assert.deepEqual(offenders, [], 'web modules must not hardcode es-ES number formatting outside i18n fallback helpers');
});

test('Community Professional Edition gate honors Accept-Language', async () => {
  const english = await jsonRequest('/api/portfolio/returns', { headers: { 'accept-language': 'en' } });
  const spanish = await jsonRequest('/api/portfolio/returns', { headers: { 'accept-language': 'es' } });

  assert.equal(english.response.status, 403);
  assert.equal(spanish.response.status, 403);
  assert.equal(english.body.error, 'Feature available in Professional Edition');
  assert.equal(spanish.body.error, 'Funcionalidad disponible en Professional Edition');
});

test('dashboard dynamic copy is rendered through i18n keys', () => {
  const i18n = read('apps/web/src/i18n-catalog.js');
  const operations = read('apps/web/src/operations.js');
  const summary = read('apps/web/src/summary.js');

  for (const key of [
    'operations.metrics.marketValue.label',
    'operations.metrics.totalGain.label',
    'operations.metrics.unrealizedGain.label',
    'operations.metrics.realizedGain.label',
    'operations.metrics.commissions.label',
    'summary.priceStatus.stale.one',
    'summary.priceStatus.stale.other',
    'summary.legend.breakdownAvailable',
  ]) {
    assert.ok(i18n.includes(`'${key}'`), `${key} must exist in the i18n catalog`);
  }

  for (const literal of [
    '<span>Valor mercado</span>',
    '<span>Resultado total</span>',
    '<span>Plusvalía latente</span>',
    '<span>Plusvalía realizada</span>',
    '<span>Comisiones</span>',
    'Precios desde cache local:',
    'valor(es) con cotizacion antigua',
    "'Desglose disponible'",
  ]) {
    assert.equal(operations.includes(literal) || summary.includes(literal), false, `${literal} must not be rendered directly`);
  }

  assert.ok(operations.includes("ctx.t('operations.metrics.marketValue.label')"), 'operations renders metric labels via i18n keys');
  assert.ok(summary.includes("ctx.tn('summary.priceStatus.stale'"), 'summary renders stale price status via i18n plurals');
});

test('frontend residual dashboard surfaces use i18n keys for generated copy', () => {
  const catalog = read('apps/web/src/i18n-catalog-ui.js');
  const importCatalog = read('apps/web/src/i18n-catalog-import.js');
  const monthly = read('apps/web/src/monthly.js');
  const ledger = read('apps/web/src/ledger.js');
  const imports = read('apps/web/src/import-preview-renderer.js');
  const confirm = read('apps/web/src/import-confirm-renderer.js');
  const forms = read('apps/web/src/forms.js');

  for (const key of [
    'monthly.subtitle.withData',
    'ledger.totalMovements',
    'backups.recent',
    'import.summary.rows',
    'import.source.valorgridXlsx',
    'import.detectedFormat',
    'import.confirm.selectedOperations',
    'form.operation.title.buy',
  ]) {
    assert.ok(
      catalog.includes(`'${key}'`) || importCatalog.includes(`'${key}'`),
      `${key} must exist in the frontend i18n catalogs`,
    );
  }

  assert.ok(monthly.includes("ctx.t('monthly.valueStart')"), 'monthly summary labels use i18n keys');
  assert.ok(ledger.includes("ctx.t('ledger.totalMovements'"), 'ledger totals use i18n keys');
  assert.ok(imports.includes("ctx.t('import.summary.rows')"), 'import summary labels use i18n keys');
  assert.ok(imports.includes("ctx.t('import.detectedFormat')"), 'import detected format uses i18n');
  assert.ok(confirm.includes("ctx.t('import.confirm.selectedOperations'"), 'import confirmation labels use i18n keys');
  assert.ok(forms.includes('form.operation.title.sell'), 'operation dialog labels use i18n keys');
  assert.ok(forms.includes('form.operation.title.buy'), 'operation dialog labels use i18n keys');
});

test('frontend modal copy is covered by i18n dictionaries', () => {
  const modalCatalog = read('apps/web/src/i18n-catalog-modals.js');
  const modes = read('apps/web/src/transaction-entry-modes.js');
  const operations = read('apps/web/src/operations.js');
  const imports = read('apps/web/src/imports.js');
  const bulk = read('apps/web/src/bulk-actions.js');
  const dividends = read('apps/web/src/dividends.js');

  for (const key of [
    'transaction.mode.sellHint',
    'transaction.field.grossSellEur',
    'instrument.selection.other',
    'group.displayOptions',
    'import.feedback.ready',
    'delete.transactions.title',
    'dividends.confirm',
  ]) {
    assert.ok(modalCatalog.includes(`'${key}'`), `${key} must exist in modal i18n catalog`);
  }

  assert.ok(modes.includes("ctx.t('transaction.mode.sellHint')"), 'transaction mode hints use i18n');
  assert.ok(operations.includes("ctx.tn('instrument.selection'"), 'instrument selection counters use i18n plurals');
  assert.ok(imports.includes("ctx.t('import.feedback.ready')"), 'import feedback uses i18n');
  assert.ok(bulk.includes("ctx.t('delete.transactions.title')"), 'delete modal copy uses i18n');
  assert.ok(dividends.includes("ctx.t('dividends.confirm')"), 'dividend modal actions use i18n');
});
