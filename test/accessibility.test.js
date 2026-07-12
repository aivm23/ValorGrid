const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'apps', 'web', 'index.html'), 'utf8');

function attributes(source) {
  return new Map(
    Array.from(source.matchAll(/([\w:-]+)=(?:"([^"]*)"|'([^']*)')/g), (match) => [match[1], match[2] ?? match[3]]),
  );
}

test('static HTML ids and ARIA references are valid', () => {
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML ids must be unique');
  const knownIds = new Set(ids);
  for (const match of html.matchAll(/\baria-(?:labelledby|describedby)="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) assert.ok(knownIds.has(id), `ARIA reference must resolve: ${id}`);
  }
});

test('every dialog has an accessible title and description', () => {
  const dialogs = Array.from(html.matchAll(/<dialog\b([^>]*)>/g));
  assert.ok(dialogs.length > 0, 'at least one dialog is expected');
  for (const dialog of dialogs) {
    const attrs = attributes(dialog[1]);
    assert.ok(attrs.get('id'), 'dialog must have an id');
    assert.ok(attrs.get('aria-labelledby'), `${attrs.get('id')} must reference its title`);
    assert.ok(attrs.get('aria-describedby'), `${attrs.get('id')} must reference its description`);
  }
});

test('static buttons have an accessible name and markup has no inline events', () => {
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = attributes(match[1]);
    const visibleText = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&\w+;/g, '')
      .trim();
    const named = visibleText || attrs.get('aria-label') || attrs.get('aria-labelledby') || attrs.get('title');
    assert.ok(named, `button must have an accessible name: ${match[0].slice(0, 100)}`);
  }
  assert.doesNotMatch(html, /\son(?:click|change|input|submit|keydown|keyup)=/i);
});

test('dialog behavior restores focus after native modal close', () => {
  const source = fs.readFileSync(path.join(root, 'apps', 'web', 'src', 'dialog-behavior.js'), 'utf8');
  assert.match(source, /dialog\.showModal =/);
  assert.match(source, /dialog\.addEventListener\('close'/);
  assert.match(source, /event\.key !== 'Escape'/);
  assert.match(source, /returnFocus\.focus\(\)/);
});

test('CSS cascade is split into an explicit stable order', () => {
  const entry = fs.readFileSync(path.join(root, 'apps', 'web', 'src', 'styles.css'), 'utf8');
  const imports = Array.from(entry.matchAll(/@import url\('(.+?)'\);/g), (match) => match[1]);
  assert.deepEqual(imports, [
    './styles/foundation.css',
    './styles/components.css',
    './styles/dialogs.css',
    './styles/admin.css',
    './styles/responsive.css',
    './styles/import-overrides.css',
  ]);
  for (const importPath of imports) {
    assert.ok(fs.statSync(path.resolve(root, 'apps', 'web', 'src', importPath)).size > 0, `${importPath} is not empty`);
  }
});
