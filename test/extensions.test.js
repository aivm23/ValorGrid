const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createExtensionHost } = require('../apps/server/src/platform/extensions');
const { jsonRequest, registerLifecycle } = require('./integration-helpers');

registerLifecycle(test);

test('GET /api/extensions returns an empty Community manifest by default', async () => {
  const { response, body } = await jsonRequest('/api/extensions');

  assert.equal(response.status, 200);
  assert.equal(body.edition, 'community');
  assert.deepEqual(body.extensions, []);
  assert.deepEqual(body.web, { modules: [], styles: [] });
});

test('extension host exposes normalized private extension manifest and assets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-extension-'));
  try {
    const webDir = path.join(tempDir, 'web');
    fs.mkdirSync(webDir);
    const extensionPath = path.join(tempDir, 'index.cjs');
    fs.writeFileSync(
      extensionPath,
      `
module.exports = {
  id: 'test-pro',
  edition: 'professional',
  features: ['test-feature'],
  web: {
    root: ${JSON.stringify(webDir)},
    modules: ['client.js'],
    styles: ['client.css'],
  },
  registerServer(ctx) {
    ctx.extensions.routes.push(async () => false);
  },
};
`,
    );

    const config = { appInfo: { edition: 'community' }, extensionPath };
    const warnings = [];
    const host = createExtensionHost({ config, logger: { warn: (message) => warnings.push(message) } });
    const ctx = { appInfo: config.appInfo, config, extensions: host };

    host.registerServer(ctx);

    assert.deepEqual(warnings, []);
    assert.equal(config.appInfo.edition, 'professional');
    assert.equal(host.routes.length, 1);
    assert.deepEqual(host.manifest(), {
      edition: 'professional',
      extensions: [{ id: 'test-pro', edition: 'professional', features: ['test-feature'] }],
      web: {
        modules: ['/extensions/test-pro/client.js'],
        styles: ['/extensions/test-pro/client.css'],
      },
    });
    assert.equal(host.resolveAsset('/extensions/test-pro/client.js'), path.join(webDir, 'client.js'));
    assert.equal(host.resolveAsset('/extensions/test-pro/../index.cjs'), null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
