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

  assert.ok(app.includes("from './i18n.js'"), 'app imports i18n module');
  assert.ok(app.includes('attachI18n'), 'app attaches i18n before rendering');
  assert.ok(app.includes('ctx.initLanguage();'), 'app initializes language preference');
  assert.ok(html.includes('id="language-select"'), 'admin preferences expose language selector');
  assert.ok(dom.includes('languageSelect'), 'dom module exposes language selector');
  assert.ok(events.includes('handleLanguageChange'), 'events module wires language changes');
  assert.ok(i18n.includes('registerTranslations'), 'extensions can register private dictionaries');
  assert.ok(i18n.includes('MutationObserver'), 'dynamic DOM mutations are translated');
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
