const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
delete process.env.ALPHA_VANTAGE_API_KEY;

const {
  assert,
  jsonRequest,
  registerLifecycle,
} = require('./integration-helpers');

registerLifecycle(test);

const { readAlphaVantageKey, saveAlphaVantageKey, deleteAlphaVantageKey } = require('../apps/server/src/platform/runtime-secrets');

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

test('GET /api/market-data/alpha-vantage/status returns configured: false when no env key is set', async () => {
  const prev = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  const prevLegacy = process.env.ALPHA_VANTAGE_API_KEY;
  delete process.env.ALPHA_VANTAGE_API_KEY;
  try {
    const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/status');
    assert.equal(response.status, 200);
    assert.equal(body.configured, false);
    assert.equal(body.mode, 'server');
    assert.ok(body.hint);
  } finally {
    if (prev) process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = prev;
    else delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
    if (prevLegacy) process.env.ALPHA_VANTAGE_API_KEY = prevLegacy;
    else delete process.env.ALPHA_VANTAGE_API_KEY;
  }
});

test('GET /api/market-data/sources always returns alpha_vantage provider', async () => {
  const prev = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  const prevLegacy = process.env.ALPHA_VANTAGE_API_KEY;
  delete process.env.ALPHA_VANTAGE_API_KEY;
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
  }
});

test('POST /api/market-data/alpha-vantage/key returns 400 in server mode (not desktop)', async () => {
  const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'TESTKEY1234567890' }),
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
  assert.ok(body.hint);
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

test('DELETE /api/market-data/alpha-vantage/key returns 400 in server mode', async () => {
  const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/key', {
    method: 'DELETE',
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('GET /api/market-data/alpha-vantage/status returns configured: true when env key is set', async () => {
  process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = 'ENVKEY123456789000';
  try {
    const { response, body } = await jsonRequest('/api/market-data/alpha-vantage/status');
    assert.equal(response.status, 200);
    assert.equal(body.configured, true);
  } finally {
    delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
  }
});
