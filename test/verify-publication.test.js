const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'verify-publication.js');

function runScript(cwd) {
  return execFileSync(process.execPath, [scriptPath], {
    cwd,
    stdio: 'pipe',
  }).toString();
}

function runScriptExpectFail(cwd) {
  try {
    execFileSync(process.execPath, [scriptPath], { cwd, stdio: 'pipe' });
    return { ok: true, stdout: '', stderr: '' };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ? error.stdout.toString() : '',
      stderr: error.stderr ? error.stderr.toString() : '',
      code: error.status,
    };
  }
}

function writeMinimalLicenseBaseline(tempDir) {
  fs.mkdirSync(path.join(tempDir, 'deploy', 'docker'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'apps', 'desktop'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'LICENSE'), 'Mozilla Public License Version 2.0\n');
  fs.writeFileSync(path.join(tempDir, 'NOTICE.md'), '# Notice\n');
  fs.writeFileSync(path.join(tempDir, 'TRADEMARKS.md'), '# Trademarks\n');
  fs.writeFileSync(path.join(tempDir, 'THIRD_PARTY_NOTICES.md'), '# Third-party notices\n');
  fs.writeFileSync(path.join(tempDir, 'CONTRIBUTING.md'), '# Contributing\n');
  fs.writeFileSync(path.join(tempDir, 'README.md'), '# fixture\n\nLicense: MPL-2.0\n');
  fs.writeFileSync(
    path.join(tempDir, 'deploy', 'docker', 'Dockerfile'),
    'LABEL org.opencontainers.image.licenses="MPL-2.0"\n',
  );
  fs.writeFileSync(
    path.join(tempDir, 'apps', 'desktop', 'electron-builder.config.cjs'),
    "module.exports = { files: ['LICENSE', 'NOTICE.md', 'TRADEMARKS.md', 'THIRD_PARTY_NOTICES.md'] };\n",
  );
}

test('verify-publication passes on the real repository', () => {
  const output = runScript(repoRoot);
  assert.match(output, /Summary: \d+ OK, \d+ WARN, 0 FAIL/);
});

test('verify-publication detects a forbidden text pattern in a temp repo', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-verify-pub-'));
  try {
    const pkg = {
      name: 'valorgrid-verify-pub-fixture',
      version: '0.0.0',
      license: 'MPL-2.0',
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-loadtest-db.js' },
    };
    fs.mkdirSync(path.join(tempDir, 'apps', 'server'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'apps', 'server', 'server.js'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'app.js'), '// placeholder\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
    writeMinimalLicenseBaseline(tempDir);
    fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>clean</body></html>');
    const forbiddenLiteral = ['Lib', 'ro1'].join('');
    fs.writeFileSync(
      path.join(tempDir, 'README.md'),
      `# fixture\n\nLicense: MPL-2.0\n\nA personal label ${forbiddenLiteral} must be flagged.\n`,
    );

    const result = runScriptExpectFail(tempDir);
    assert.equal(result.ok, false, 'verify-publication must fail when a forbidden pattern is present');
    assert.match(result.stdout, /forbidden-text|Private or preview text patterns found/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('verify-publication rejects private extension mechanics in public docs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-verify-pub-'));
  try {
    const pkg = {
      name: 'valorgrid-verify-pub-fixture',
      version: '0.0.0',
      license: 'MPL-2.0',
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-loadtest-db.js' },
    };
    fs.mkdirSync(path.join(tempDir, 'apps', 'server'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'apps', 'server', 'server.js'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'app.js'), '// placeholder\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
    writeMinimalLicenseBaseline(tempDir);
    fs.writeFileSync(
      path.join(tempDir, 'docs', 'ARCHITECTURE.md'),
      `# Architecture\n\nConfigure ${['VALORGRID', 'EXTENSION', 'PATH'].join('_')} to load private code.\n`,
    );

    const result = runScriptExpectFail(tempDir);
    assert.equal(result.ok, false);
    assert.match(result.stdout, /public-doc-boundary|private extension mechanics/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('verify-publication detects a missing gitignore pattern in a temp repo', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-verify-pub-'));
  try {
    const pkg = {
      name: 'valorgrid-verify-pub-fixture',
      version: '0.0.0',
      license: 'MPL-2.0',
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-loadtest-db.js' },
    };
    fs.mkdirSync(path.join(tempDir, 'apps', 'server'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'apps', 'server', 'server.js'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'app.js'), '// placeholder\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
    writeMinimalLicenseBaseline(tempDir);
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n');

    const result = runScriptExpectFail(tempDir);
    assert.equal(result.ok, false);
    assert.match(result.stdout, /gitignore-patterns|\.gitignore is missing required patterns/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('verify-publication detects a non-canonical seed:demo entrypoint', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-verify-pub-'));
  try {
    const pkg = {
      name: 'valorgrid-verify-pub-fixture',
      version: '0.0.0',
      license: 'MPL-2.0',
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-demo.js' },
    };
    fs.mkdirSync(path.join(tempDir, 'apps', 'server'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'apps', 'server', 'server.js'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'app.js'), '// placeholder\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
    writeMinimalLicenseBaseline(tempDir);
    fs.writeFileSync(path.join(tempDir, 'index.html'), '<html></html>');

    const result = runScriptExpectFail(tempDir);
    assert.equal(result.ok, false);
    assert.match(result.stdout, /seed:demo must route through scripts\/seed-loadtest-db\.js/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('verify-publication detects stale CasaOS port metadata', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-verify-pub-'));
  try {
    const pkg = {
      name: 'valorgrid-verify-pub-fixture',
      version: '3.7.12',
      license: 'MPL-2.0',
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-loadtest-db.js' },
    };
    const requiredGitignore = [
      '*.sqlite',
      '*.sqlite-wal',
      '*.sqlite-shm',
      'data/',
      '.backups/',
      'dist/',
      '.env',
      'secrets.json',
      'local/',
      'imports/',
      'downloads/',
    ].join('\n');
    const requiredDockerignore = [
      '.git',
      '*.sqlite',
      '*.sqlite-wal',
      '*.sqlite-shm',
      'data',
      '.backups',
      'backups',
      '.env',
      'secrets.json',
      'local',
      'imports',
      'node_modules',
    ].join('\n');
    fs.mkdirSync(path.join(tempDir, 'deploy', 'docker'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'apps', 'server', 'src', 'platform'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src'), { recursive: true });
    require('child_process').execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tempDir, 'apps', 'server', 'server.js'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'app.js'), '// placeholder\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
    writeMinimalLicenseBaseline(tempDir);
    fs.writeFileSync(path.join(tempDir, '.gitignore'), `${requiredGitignore}\n`);
    fs.writeFileSync(path.join(tempDir, '.dockerignore'), `${requiredDockerignore}\n`);
    fs.writeFileSync(
      path.join(tempDir, 'deploy', 'docker', 'compose.casaos.yml'),
      [
        'services:',
        '  valorgrid:',
        '    image: ghcr.io/aivm23/valorgrid:latest',
        '    environment:',
        '      PORT: 5173',
        '    ports:',
        '      - target: 5173',
        '        published: "5173"',
        '    x-casaos:',
        '      ports:',
        '        - container: "5173"',
        'x-casaos:',
        '  version: "v3.7.12"',
        '  port_map: "5173"',
      ].join('\n'),
    );

    const result = runScriptExpectFail(tempDir);
    assert.equal(result.ok, false);
    assert.match(result.stdout, /casaos-compose|stale CasaOS image, version or port metadata/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('verify-publication scans tracked OpenCode files even when the directory is ignored', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-verify-pub-'));
  try {
    const pkg = {
      name: 'valorgrid-verify-pub-fixture',
      version: '0.0.0',
      license: 'MPL-2.0',
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-loadtest-db.js' },
    };
    const requiredGitignore = [
      '*.sqlite',
      '*.sqlite-wal',
      '*.sqlite-shm',
      'data/',
      '.backups/',
      'dist/',
      '.env',
      'secrets.json',
      'local/',
      'imports/',
      'downloads/',
      '.opencode/',
    ].join('\n');
    const requiredDockerignore = [
      '.git',
      '*.sqlite',
      '*.sqlite-wal',
      '*.sqlite-shm',
      'data',
      '.backups',
      'backups',
      '.env',
      'secrets.json',
      'local',
      'imports',
      'node_modules',
    ].join('\n');
    const skillDir = path.join(tempDir, '.opencode', 'skills', 'leak');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'apps', 'server'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'apps', 'server', 'server.js'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'app.js'), '// placeholder\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
    writeMinimalLicenseBaseline(tempDir);
    fs.writeFileSync(path.join(tempDir, '.gitignore'), `${requiredGitignore}\n`);
    fs.writeFileSync(path.join(tempDir, '.dockerignore'), `${requiredDockerignore}\n`);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: leak\ndescription: ${['DE', 'GIRO'].join('')} fixture\n---\n`);
    execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
    execFileSync('git', ['add', '-f', '.opencode/skills/leak/SKILL.md'], { cwd: tempDir, stdio: 'pipe' });

    const result = runScriptExpectFail(tempDir);
    assert.equal(result.ok, false);
    assert.match(result.stdout, /forbidden-text|Private or preview text patterns found/);
    assert.match(result.stdout, /\.opencode\/skills\/leak\/SKILL\.md/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
