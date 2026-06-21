const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('runtime loads an optional extension before serving /api/extensions', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-extension-runtime-'));
  const extensionPath = path.join(tempDir, 'index.cjs');
  fs.writeFileSync(
    extensionPath,
    `
module.exports = {
  id: 'test-pro',
  edition: 'professional',
  features: ['runtime-feature'],
  registerServer(ctx) {
    ctx.registerImportAdapters([
      {
        source: 'runtime-extension-csv',
        label: 'Runtime Extension CSV',
        parse() {
          return { headers: [], rows: [], fileSubtype: 'runtime-extension' };
        },
      },
    ]);
  },
};
`,
  );

  const originalEnv = {
    PORTFOLIO_DB_PATH: process.env.PORTFOLIO_DB_PATH,
    VALORGRID_BACKUP_DIR: process.env.VALORGRID_BACKUP_DIR,
    VALORGRID_EXTENSION_PATH: process.env.VALORGRID_EXTENSION_PATH,
    PORT: process.env.PORT,
    HOST: process.env.HOST,
  };

  process.env.PORTFOLIO_DB_PATH = path.join(tempDir, 'portfolio.sqlite');
  process.env.VALORGRID_BACKUP_DIR = path.join(tempDir, 'backups');
  process.env.VALORGRID_EXTENSION_PATH = extensionPath;
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  fs.mkdirSync(process.env.VALORGRID_BACKUP_DIR, { recursive: true });

  const serverPath = path.join(repoRoot, 'apps', 'server', 'server.js');
  delete require.cache[require.resolve(serverPath)];
  const app = require(serverPath);

  try {
    const baseUrl = await new Promise((resolve) => {
      app.server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${app.server.address().port}`));
    });
    const response = await fetch(`${baseUrl}/api/extensions`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.edition, 'professional');
    assert.deepEqual(body.extensions, [{ id: 'test-pro', edition: 'professional', features: ['runtime-feature'] }]);

    const importSourcesResponse = await fetch(`${baseUrl}/api/import/sources`);
    const importSourcesBody = await importSourcesResponse.json();
    const extensionSource = importSourcesBody.sources.find((source) => source.key === 'runtime-extension-csv');
    assert.equal(importSourcesResponse.status, 200);
    assert.equal(extensionSource?.edition, 'professional');
    assert.equal(extensionSource?.available, true);
  } finally {
    if (app.server.listening) await new Promise((resolve) => app.server.close(resolve));
    app.db.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
