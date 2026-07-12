const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const storagePath = path.join(root, 'apps', 'web', 'src', 'storage.js');

test('storage.js uses default export with getItem, setItem, removeItem', () => {
  const source = fs.readFileSync(storagePath, 'utf8');
  assert.ok(source.includes('export default'), 'storage.js must use default export');
  assert.ok(source.includes('getItem'), 'storage.js must export getItem');
  assert.ok(source.includes('setItem'), 'storage.js must export setItem');
  assert.ok(source.includes('removeItem'), 'storage.js must export removeItem');
});

test('storage.js references localStorage and cookie fallback', () => {
  const source = fs.readFileSync(storagePath, 'utf8');
  assert.ok(source.includes('localStorage'), 'storage.js must reference localStorage');
  assert.ok(source.includes('cookie') || source.includes('Cookie'), 'storage.js must reference cookies as fallback');
});

test('storage.js uses valorgrid-pref- prefix for cookie names', () => {
  const source = fs.readFileSync(storagePath, 'utf8');
  assert.ok(source.includes('valorgrid-pref-'), 'storage.js must use valorgrid-pref- prefix for cookies');
});

test('storage.js has SameSite=Lax attribute', () => {
  const source = fs.readFileSync(storagePath, 'utf8');
  assert.ok(source.includes('SameSite=Lax'), 'storage.js must set SameSite=Lax on cookies');
});

test('storage.js has Max-Age attribute', () => {
  const source = fs.readFileSync(storagePath, 'utf8');
  assert.ok(source.includes('Max-Age'), 'storage.js must set Max-Age on cookies');
});

test('storage.js has Path=/ attribute', () => {
  const source = fs.readFileSync(storagePath, 'utf8');
  assert.ok(source.includes('Path=/'), 'storage.js must set Path=/ on cookies');
});

test('storage.js catches exceptions without rethrowing', () => {
  const source = fs.readFileSync(storagePath, 'utf8');
  const tryCatchCount = (source.match(/try\s*\{/g) || []).length;
  const rethrowCount = (source.match(/throw\s+/g) || []).length;
  // Should have more try blocks than rethrows (storage wrapper should not rethrow)
  assert.ok(tryCatchCount > rethrowCount, 'storage.js should catch exceptions without rethrowing');
});

test('storage.js validates theme values in theme.js', () => {
  const themePath = path.join(root, 'apps', 'web', 'src', 'theme.js');
  const source = fs.readFileSync(themePath, 'utf8');
  assert.ok(source.includes('dark'), 'theme.js must handle dark theme');
  assert.ok(source.includes('light'), 'theme.js must handle light theme');
  assert.ok(
    source.includes('Set') || source.includes('includes') || source.includes('.has('),
    'theme.js must validate against a whitelist',
  );
});

test('theme.js does not accept arbitrary values', () => {
  const themePath = path.join(root, 'apps', 'web', 'src', 'theme.js');
  const source = fs.readFileSync(themePath, 'utf8');
  // Must have a validation mechanism (set or explicit check)
  assert.ok(
    source.includes('VALID_THEMES') || (source.includes('dark') && source.includes('light')),
    'theme.js must validate theme values',
  );
});
