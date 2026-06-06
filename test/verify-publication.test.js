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
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-loadtest-db.js' },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
    fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>clean</body></html>');
    const forbiddenLiteral = ['Lib', 'ro1'].join('');
    fs.writeFileSync(
      path.join(tempDir, 'README.md'),
      `# fixture\n\nA personal label ${forbiddenLiteral} must be flagged.\n`,
    );

    const result = runScriptExpectFail(tempDir);
    assert.equal(result.ok, false, 'verify-publication must fail when a forbidden pattern is present');
    assert.match(result.stdout, /forbidden-text|Private or preview text patterns found/);
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
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-loadtest-db.js' },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
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
      private: true,
      scripts: { 'seed:demo': 'node scripts/seed-demo.js' },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
    fs.writeFileSync(path.join(tempDir, 'index.html'), '<html></html>');

    const result = runScriptExpectFail(tempDir);
    assert.equal(result.ok, false);
    assert.match(result.stdout, /seed:demo must route through scripts\/seed-loadtest-db\.js/);
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
      'local',
      'imports',
      'node_modules',
    ].join('\n');
    const skillDir = path.join(tempDir, '.opencode', 'skills', 'leak');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
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
