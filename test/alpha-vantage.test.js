const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
delete process.env.ALPHA_VANTAGE_API_KEY;
delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;

const { assert, jsonRequest, registerLifecycle } = require('./integration-helpers');

registerLifecycle(test);

const {
  readAlphaVantageKey,
  saveAlphaVantageKey,
  deleteAlphaVantageKey,
} = require('../apps/server/src/platform/runtime-secrets');

function makeBackupDir() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-secrets-'));
  const backups = path.join(base, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  const _cleanup = () => fs.rmSync(base, { recursive: true, force: true });
  return { backups, _cleanup };
}

test('runtime-secrets: save and read an Alpha Vantage key', () => {
  const { backups, _cleanup } = makeBackupDir();
  saveAlphaVantageKey(backups, 'TESTKEY1234567890');
  const key = readAlphaVantageKey(backups);
  assert.equal(key, 'TESTKEY1234567890');
  _cleanup();
});

test('runtime-secrets: return empty string when no key saved', () => {
  const { backups, _cleanup } = makeBackupDir();
  const key = readAlphaVantageKey(backups);
  assert.equal(key, '');
  _cleanup();
});

test('runtime-secrets: delete removes the saved key', () => {
  const { backups, _cleanup } = makeBackupDir();
  saveAlphaVantageKey(backups, 'DELETEKEY123456789');
  deleteAlphaVantageKey(backups);
  const key = readAlphaVantageKey(backups);
  assert.equal(key, '');
  _cleanup();
});

test('runtime-secrets: multiple keys only keep latest', () => {
  const { backups, _cleanup } = makeBackupDir();
  saveAlphaVantageKey(backups, 'FIRSTKEY123456789');
  saveAlphaVantageKey(backups, 'SECONDKEY12345678');
  const key = readAlphaVantageKey(backups);
  assert.equal(key, 'SECONDKEY12345678');
  _cleanup();
});

test('runtime-secrets: writeSecrets tightens permissions on existing file (POSIX)', () => {
  if (process.platform === 'win32') return;
  const { backups, _cleanup } = makeBackupDir();
  const filePath = path.join(path.dirname(backups), 'secrets.json');
  fs.writeFileSync(filePath, '{}', { mode: 0o644 });
  const before = fs.statSync(filePath).mode & 0o777;
  assert.equal(before, 0o644, 'pre-existing file should have 0644');
  saveAlphaVantageKey(backups, 'PERMTESTKEY123456');
  const after = fs.statSync(filePath).mode & 0o777;
  assert.equal(after, 0o600, 'after saveSecrets the file must be 0600');
  _cleanup();
});

test('GET /api/market-data/alpha-vantage/status returns configured: false when no env key is set', async () => {
  const prev = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  const prevLegacy = process.env.ALPHA_VANTAGE_API_KEY;
  delete process.env.ALPHA_VANTAGE_API_KEY;
  const prevSource = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  try {
    const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/status');
    assert.equal(response.status, 200);
    assert.equal(body.configured, false);
    assert.equal(body.mode, 'server');
    assert.equal(body.canSaveKey, true);
    assert.ok(body.hint);
  } finally {
    if (prev) process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = prev;
    else delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
    if (prevLegacy) process.env.ALPHA_VANTAGE_API_KEY = prevLegacy;
    else delete process.env.ALPHA_VANTAGE_API_KEY;
    if (prevSource) process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = prevSource;
    else delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  }
});

test('GET /api/market-data/sources always returns alpha_vantage provider', async () => {
  const prev = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  const prevLegacy = process.env.ALPHA_VANTAGE_API_KEY;
  delete process.env.ALPHA_VANTAGE_API_KEY;
  const prevSource = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  try {
    const { response, body } = await jsonRequest('/api/market-data/sources');
    assert.equal(response.status, 200);
    const alphaVantage = body.providers.find((p) => p.key === 'alpha_vantage');
    assert.ok(alphaVantage);
    assert.equal(alphaVantage.label, 'Alpha Vantage');
    assert.equal(alphaVantage.enabled, false);
    assert.equal(alphaVantage.primary, false);
  } finally {
    if (prev) process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = prev;
    else delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
    if (prevLegacy) process.env.ALPHA_VANTAGE_API_KEY = prevLegacy;
    else delete process.env.ALPHA_VANTAGE_API_KEY;
    if (prevSource) process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = prevSource;
    else delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  }
});

test('POST /api/market-data/alpha-vantage/key saves a valid key in server mode', async () => {
  const previousFetch = global.fetch;
  const prev = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  const prevSource = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  global.fetch = async (url) => {
    assert.ok(String(url).includes('alphavantage.co/query'));
    return {
      ok: true,
      async json() {
        return { price: '2048.12', nominal: 'USD' };
      },
    };
  };
  try {
    const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'TESTKEY123456789' }),
    });
    assert.equal(response.status, 201);
    assert.ok(body.message);
    assert.equal(process.env.VALORGRID_ALPHA_VANTAGE_API_KEY, 'TESTKEY123456789');
    assert.equal(process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE, 'local');

    const status = await jsonRequest('/api/market-data/alpha-vantage/status');
    assert.equal(status.body.configured, true);
    assert.equal(status.body.source, 'local');
    assert.equal(status.body.canSaveKey, true);
  } finally {
    global.fetch = previousFetch;
    if (prev) process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = prev;
    else delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
    if (prevSource) process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = prevSource;
    else delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  }
});

test('POST /api/market-data/alpha-vantage/key rejects short keys', async () => {
  const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'SHORT' }),
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('POST /api/market-data/alpha-vantage/key rejects invalid format keys', async () => {
  const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'invalid-key-with-special-chars!!!' }),
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('DELETE /api/market-data/alpha-vantage/key removes a local server key', async () => {
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = 'LOCALKEY12345678';
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = 'local';
  const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/key', {
    method: 'DELETE',
  });
  assert.equal(response.status, 200);
  assert.ok(body.message);
  assert.equal(process.env.VALORGRID_ALPHA_VANTAGE_API_KEY, undefined);
  assert.equal(process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE, undefined);
});

test('GET /api/market-data/alpha-vantage/status returns configured: true when env key is set', async () => {
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = 'ENVKEY123456789000';
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = 'env';
  try {
    const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/status');
    assert.equal(response.status, 200);
    assert.equal(body.configured, true);
    assert.equal(body.source, 'env');
    assert.equal(body.canSaveKey, false);
  } finally {
    delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
    delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  }
});

test('POST and DELETE keep env-managed Alpha Vantage keys immutable from the API', async () => {
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = 'ENVKEY1234567890';
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = 'env';
  try {
    const post = await jsonRequest('/api/market-data/alpha-vantage/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'TESTKEY123456789' }),
    });
    assert.equal(post.response.status, 400);
    assert.ok(post.body.hint);

    const del = await jsonRequest('/api/market-data/alpha-vantage/key', { method: 'DELETE' });
    assert.equal(del.response.status, 400);
    assert.ok(del.body.hint);
    assert.equal(process.env.VALORGRID_ALPHA_VANTAGE_API_KEY, 'ENVKEY1234567890');
  } finally {
    delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
    delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
  }
});
