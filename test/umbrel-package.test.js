const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const pkg = require('../package.json');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Umbrel package generator is in sync with checked-in package files', () => {
  const output = execFileSync(process.execPath, ['scripts/update-umbrel-package.js', '--check'], {
    cwd: repoRoot,
    stdio: 'pipe',
  }).toString();

  assert.match(output, new RegExp(`Umbrel package checked for v${pkg.version}`));
});

test('official Umbrel compose is independent and uses app_proxy only', () => {
  const manifest = read('deploy/umbrel/official/valorgrid/umbrel-app.yml');
  const compose = read('deploy/umbrel/official/valorgrid/docker-compose.yml');

  assert.doesNotMatch(manifest, /^icon:/m);
  assert.match(compose, /app_proxy:/);
  assert.match(compose, /APP_HOST:\s*valorgrid_app_1/);
  assert.match(compose, /APP_PORT:\s*1325/);
  assert.match(compose, /VALORGRID_RUNTIME_MODE:\s*docker/);
  assert.match(
    compose,
    new RegExp(`image:\\s*ghcr\\.io/aivm23/valorgrid:v${pkg.version.replace(/\./g, '\\.')}@sha256:[a-f0-9]{64}`),
  );
  assert.match(compose, /\$\{APP_DATA_DIR\}\/data:\/data/);
  assert.doesNotMatch(compose, /^\s*build:\s*$/m);
  assert.doesNotMatch(compose, /^\s*ports:\s*$/m);
  assert.doesNotMatch(compose, /latest\b/);
  assert.doesNotMatch(compose, /docker\.sock/);
});

test('community Umbrel app id is prefixed by the community store id', () => {
  const store = read('deploy/umbrel/community-store/umbrel-app-store.yml');
  const manifest = read('deploy/umbrel/community-store/valorgrid-store-valorgrid/umbrel-app.yml');
  const compose = read('deploy/umbrel/community-store/valorgrid-store-valorgrid/docker-compose.yml');
  const icon = read('deploy/umbrel/community-store/valorgrid-store-valorgrid/icon.svg');

  assert.match(store, /^id:\s*valorgrid-store\s*$/m);
  assert.match(manifest, /^id:\s*valorgrid-store-valorgrid\s*$/m);
  assert.match(manifest, new RegExp(`^version:\\s*"${pkg.version.replace(/\./g, '\\.')}"\\s*$`, 'm'));
  assert.match(
    manifest,
    /^icon:\s*https:\/\/raw\.githubusercontent\.com\/aivm23\/valorgrid-umbrel-app-store\/main\/valorgrid-store-valorgrid\/icon\.svg\s*$/m,
  );
  assert.match(compose, /APP_HOST:\s*valorgrid-store-valorgrid_app_1/);
  assert.match(compose, /VALORGRID_RUNTIME_MODE:\s*docker/);
  assert.match(icon, /<svg[^>]+aria-label="ValorGrid"/);
});
