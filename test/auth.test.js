const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createConfig } = require('../src/platform/config');
const { parseBasicAuth } = require('../src/platform/auth');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-auth-'));
process.env.PORTFOLIO_DB_PATH = path.join(tempDir, 'portfolio.sqlite');
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.VALORGRID_AUTH_USER = 'owner';
process.env.VALORGRID_AUTH_PASSWORD = 'correct horse battery staple';

const { db, server } = require('../server.js');

let baseUrl;

function basicAuth(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      connection: 'close',
      ...(options.headers || {}),
    },
  });
}

test.before(async () => {
  baseUrl = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Basic Auth config is disabled unless password is set', () => {
  assert.equal(createConfig({}).auth.enabled, false);
  assert.equal(createConfig({ VALORGRID_AUTH_PASSWORD: '' }).auth.enabled, false);
  assert.deepEqual(createConfig({ VALORGRID_AUTH_PASSWORD: 'secret' }).auth, {
    enabled: true,
    user: 'valorgrid',
    password: 'secret',
  });
});

test('Basic Auth parser supports colons inside passwords', () => {
  const header = basicAuth('owner', 'secret:with:colons');
  assert.deepEqual(parseBasicAuth(header), {
    user: 'owner',
    password: 'secret:with:colons',
  });
});

test('Basic Auth protects static assets and API when enabled', async () => {
  const home = await request('/');
  assert.equal(home.status, 401);
  assert.equal(home.headers.get('www-authenticate'), 'Basic realm="ValorGrid", charset="UTF-8"');

  const health = await request('/api/health');
  assert.equal(health.status, 401);
});

test('Basic Auth rejects wrong credentials', async () => {
  const response = await request('/api/health', {
    headers: {
      authorization: basicAuth('owner', 'wrong'),
    },
  });
  assert.equal(response.status, 401);
});

test('Basic Auth accepts configured single-user credentials', async () => {
  const apiResponse = await request('/api/health', {
    headers: {
      authorization: basicAuth('owner', 'correct horse battery staple'),
    },
  });
  assert.equal(apiResponse.status, 200);
  assert.equal((await apiResponse.json()).status, 'ok');

  const staticResponse = await request('/', {
    headers: {
      authorization: basicAuth('owner', 'correct horse battery staple'),
    },
  });
  assert.equal(staticResponse.status, 200);
  assert.match(await staticResponse.text(), /ValorGrid/);
});
