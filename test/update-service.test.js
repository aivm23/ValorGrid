const assert = require('node:assert/strict');
const test = require('node:test');
const { jsonRequest, registerLifecycle } = require('./integration-helpers');

registerLifecycle(test);

const {
  parseSemver,
  compareSemver,
  detectRuntimeMode,
  selectDesktopAsset,
  normalizeVersionTag,
  buildDockerImage,
} = require('../apps/server/src/domains/admin/update-service');

test('compareSemver detects when an update is available', () => {
  assert.equal(compareSemver('3.31.0', '3.30.0') > 0, true, '3.31.0 > 3.30.0');
  assert.equal(compareSemver('3.30.0', '3.30.0'), 0, 'equal versions');
  assert.equal(compareSemver('3.29.0', '3.30.0') < 0, true, '3.29.0 < 3.30.0');
  assert.equal(compareSemver('4.0.0', '3.30.0') > 0, true, 'major bump');
  assert.equal(compareSemver('3.30.1', '3.30.0') > 0, true, 'patch bump');
  assert.equal(compareSemver('v3.31.0', '3.30.0') > 0, true, 'handles v prefix');
  assert.equal(compareSemver('invalid', '3.30.0'), 0, 'invalid returns 0');
});

test('parseSemver extracts major minor patch and pre-release', () => {
  assert.deepEqual(parseSemver('3.30.0'), { major: 3, minor: 30, patch: 0, pre: '' });
  assert.deepEqual(parseSemver('v3.31.0'), { major: 3, minor: 31, patch: 0, pre: '' });
  assert.deepEqual(parseSemver('3.30.0-beta.1'), { major: 3, minor: 30, patch: 0, pre: 'beta.1' });
  assert.equal(parseSemver('nope'), null);
});

test('normalizeVersionTag strips leading v', () => {
  assert.equal(normalizeVersionTag('v3.30.0'), '3.30.0');
  assert.equal(normalizeVersionTag('3.30.0'), '3.30.0');
  assert.equal(normalizeVersionTag(''), '');
});

test('detectRuntimeMode resolves desktop, docker and server', () => {
  assert.equal(detectRuntimeMode({ runtime: { mode: 'desktop' } }), 'desktop');
  assert.equal(detectRuntimeMode({ runtime: { mode: 'docker' } }), 'docker');
  assert.equal(detectRuntimeMode({ runtime: { mode: 'server' } }), 'server');
  assert.equal(detectRuntimeMode({ runtime: { mode: '' } }), 'server');
  assert.equal(detectRuntimeMode({}), 'server');
});

test('selectDesktopAsset picks the correct Windows installer', () => {
  const assets = [
    { name: 'ValorGrid-Setup-3.31.0-x64.exe', downloadUrl: 'https://github.com/test/win.exe' },
    { name: 'ValorGrid-Linux-3.31.0-x64.AppImage', downloadUrl: 'https://github.com/test/linux.AppImage' },
    { name: 'ValorGrid-macOS-3.31.0-arm64.dmg', downloadUrl: 'https://github.com/test/mac.dmg' },
  ];
  const win = selectDesktopAsset(assets, 'win32', 'x64', '3.31.0');
  assert.equal(win.name, 'ValorGrid-Setup-3.31.0-x64.exe');
  assert.equal(win.downloadUrl, 'https://github.com/test/win.exe');
});

test('selectDesktopAsset picks the correct Linux AppImage first', () => {
  const assets = [
    { name: 'ValorGrid-Linux-3.31.0-x64.deb', downloadUrl: 'https://github.com/test/linux.deb' },
    { name: 'ValorGrid-Linux-3.31.0-x64.AppImage', downloadUrl: 'https://github.com/test/linux.AppImage' },
  ];
  const linux = selectDesktopAsset(assets, 'linux', 'x64', '3.31.0');
  assert.equal(linux.name, 'ValorGrid-Linux-3.31.0-x64.AppImage');
});

test('selectDesktopAsset picks the correct macOS DMG by arch', () => {
  const assets = [
    { name: 'ValorGrid-macOS-3.31.0-x64.dmg', downloadUrl: 'https://github.com/test/mac-x64.dmg' },
    { name: 'ValorGrid-macOS-3.31.0-arm64.dmg', downloadUrl: 'https://github.com/test/mac-arm64.dmg' },
  ];
  const macArm = selectDesktopAsset(assets, 'darwin', 'arm64', '3.31.0');
  assert.equal(macArm.name, 'ValorGrid-macOS-3.31.0-arm64.dmg');
  const macIntel = selectDesktopAsset(assets, 'darwin', 'x64', '3.31.0');
  assert.equal(macIntel.name, 'ValorGrid-macOS-3.31.0-x64.dmg');
});

test('selectDesktopAsset returns null when no matching asset', () => {
  assert.equal(selectDesktopAsset([], 'win32', 'x64', '3.31.0'), null);
  assert.equal(selectDesktopAsset(null, 'win32', 'x64', '3.31.0'), null);
  assert.equal(selectDesktopAsset([{ name: 'other.txt' }], 'win32', 'x64', '3.31.0'), null);
});

test('buildDockerImage produces the expected GHCR tag', () => {
  assert.equal(buildDockerImage('3.31.0'), 'ghcr.io/aivm23/valorgrid:v3.31.0');
  assert.equal(buildDockerImage('v3.31.0'), 'ghcr.io/aivm23/valorgrid:v3.31.0');
});

test('GET /api/update/status returns currentVersion even when GitHub is unreachable', async () => {
  const { response, body } = await jsonRequest('/api/update/status');
  assert.equal(response.status, 200);
  assert.ok(body.currentVersion, 'response includes currentVersion');
  assert.equal(typeof body.updateAvailable, 'boolean');
  assert.ok(body.runtimeMode, 'response includes runtimeMode');
  assert.ok(body.checkedAt, 'response includes checkedAt');
});

test('GET /api/update/docker-commands returns pull and compose commands', async () => {
  const { response, body } = await jsonRequest('/api/update/docker-commands?version=3.31.0');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.commands));
  assert.ok(body.commands.some((c) => c.includes('docker pull')));
  assert.ok(body.commands.some((c) => c.includes('docker compose up -d')));
  assert.ok(body.commands.some((c) => c.includes('v3.31.0')));
});
