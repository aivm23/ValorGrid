const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const electronBuilderConfig = require('../apps/desktop/electron-builder.config.cjs');
const { stableArtifacts } = require('../scripts/prepare-desktop-release-artifacts');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function createFile(filePath, content = 'artifact') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('desktop distribution scripts cover Windows Linux and macOS', () => {
  const scripts = pkg.scripts || {};

  assert.match(scripts['desktop:dist:win'], /--win nsis/, 'Windows build must keep NSIS installer');
  assert.match(scripts['desktop:dist:linux'], /--linux AppImage deb --x64/, 'Linux build must produce AppImage and deb for x64');
  assert.match(scripts['desktop:dist:mac'], /--mac dmg --x64 --arm64/, 'macOS build must produce x64 and arm64 DMGs');
  assert.match(scripts['release:desktop:stable'], /prepare-desktop-release-artifacts\.js/, 'stable artifact naming must be scripted');
});

test('electron-builder config defines desktop targets for all supported platforms', () => {
  assert.deepEqual(electronBuilderConfig.win.target[0], { target: 'nsis', arch: ['x64'] });
  assert.deepEqual(electronBuilderConfig.linux.target, [
    { target: 'AppImage', arch: ['x64'] },
    { target: 'deb', arch: ['x64'] },
  ]);
  assert.deepEqual(electronBuilderConfig.mac.target[0], { target: 'dmg', arch: ['x64', 'arm64'] });
  assert.equal(electronBuilderConfig.mac.identity, null, 'macOS builds must stay explicitly unsigned until notarization is added');
  assert.match(electronBuilderConfig.mac.icon, /valorgrid-logo\.icns$/, 'macOS builds must use the generated icns icon');
});

test('stable desktop artifact names are generated per platform', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-desktop-artifacts-'));
  try {
    createFile(path.join(tempDir, `ValorGrid-Setup-${pkg.version}-x64.exe`));
    createFile(path.join(tempDir, `ValorGrid-Linux-${pkg.version}-x64.AppImage`));
    createFile(path.join(tempDir, `ValorGrid-Linux-${pkg.version}-x64.deb`));
    createFile(path.join(tempDir, `ValorGrid-macOS-${pkg.version}-x64.dmg`));
    createFile(path.join(tempDir, `ValorGrid-macOS-${pkg.version}-arm64.dmg`));

    const script = path.join(root, 'scripts', 'prepare-desktop-release-artifacts.js');
    execFileSync(process.execPath, [script, tempDir, 'win32'], { stdio: 'pipe' });
    execFileSync(process.execPath, [script, tempDir, 'linux'], { stdio: 'pipe' });
    execFileSync(process.execPath, [script, tempDir, 'darwin'], { stdio: 'pipe' });

    for (const artifacts of Object.values(stableArtifacts)) {
      for (const artifact of artifacts) {
        assert.ok(fs.existsSync(path.join(tempDir, artifact.stableName)), `${artifact.stableName} must be created`);
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('release checksums include stable Windows Linux and macOS artifacts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-checksums-'));
  try {
    const expected = [
      'ValorGrid-Setup-x64.exe',
      'ValorGrid-Linux-x64.AppImage',
      'ValorGrid-Linux-x64.deb',
      'ValorGrid-macOS-x64.dmg',
      'ValorGrid-macOS-arm64.dmg',
      `ValorGrid-Setup-${pkg.version}-x64.exe`,
      `ValorGrid-macOS-${pkg.version}-arm64.dmg`,
    ];
    for (const file of expected) createFile(path.join(tempDir, file), file);
    createFile(path.join(tempDir, 'debug-output.txt'), 'not a release artifact');

    const script = path.join(root, 'scripts', 'generate-release-checksums.js');
    execFileSync(process.execPath, [script, tempDir], { stdio: 'pipe' });

    const checksums = fs.readFileSync(path.join(tempDir, 'SHA256SUMS.txt'), 'utf8');
    for (const file of expected) {
      assert.match(checksums, new RegExp(`  ${file.replace(/\./g, '\\.')}`), `${file} must be checksummed`);
    }
    assert.doesNotMatch(checksums, /debug-output\.txt/, 'unexpected files must not be checksummed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('release workflow builds and publishes desktop artifacts from all platforms', () => {
  const workflow = read(path.join('.github', 'workflows', 'release.yml'));

  assert.match(workflow, /windows-installer:/, 'release workflow must keep a Windows installer job');
  assert.match(workflow, /linux-installer:/, 'release workflow must include a Linux installer job');
  assert.match(workflow, /macos-installer:/, 'release workflow must include a macOS installer job');
  assert.match(workflow, /publish-release:/, 'release workflow must publish from downloaded artifacts');
  assert.match(workflow, /ValorGrid-Linux-x64\.AppImage/, 'Linux stable AppImage must be published');
  assert.match(workflow, /ValorGrid-Linux-x64\.deb/, 'Linux stable deb must be published');
  assert.match(workflow, /ValorGrid-macOS-x64\.dmg/, 'macOS x64 stable DMG must be published');
  assert.match(workflow, /ValorGrid-macOS-arm64\.dmg/, 'macOS arm64 stable DMG must be published');
});
