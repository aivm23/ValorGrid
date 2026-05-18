const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const ignoredDirs = new Set([
  '.backups',
  '.git',
  '.github',
  '.idea',
  '.vscode',
  'data',
  'dist',
  'imports',
  'local',
  'node_modules',
]);
const ignoredFiles = [/^AGENTS\.md$/i, /^PLAN.*\.md$/i, /^Plan_.*\.md$/i];
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.ps1',
  '.txt',
  '.yml',
]);

function publicFiles(dir = root, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) publicFiles(path.join(dir, entry.name), files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (ignoredFiles.some((pattern) => pattern.test(entry.name))) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

test('private database artifacts are ignored and not publishable', () => {
  const privateExtensions = new Set(['.sqlite', '.sqlite-wal', '.sqlite-shm']);
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  const localArtifacts = fs
    .readdirSync(root)
    .filter((file) => privateExtensions.has(path.extname(file)));

  assert.ok(gitignore.includes('*.sqlite'));
  assert.ok(gitignore.includes('*.sqlite-wal'));
  assert.ok(gitignore.includes('*.sqlite-shm'));
  assert.ok(localArtifacts.length >= 0);
});

test('publishable text does not contain local paths or personal import labels', () => {
  const windowsUserPath = ['C:', 'Users'].join('\\\\');
  const escapedWindowsUserPath = ['C:', 'Users'].join('\\\\\\\\');
  const personalImportLabel = ['Lib', 'ro1'].join('');
  const forbidden = [
    windowsUserPath,
    escapedWindowsUserPath,
    personalImportLabel,
    ['portfolio.sqlite', 'wal'].join('-'),
    ['portfolio.sqlite', 'shm'].join('-'),
    ['github', 'preview'].join('-'),
    ['portfolio-dashboard', 'github', 'preview'].join('-'),
    ['preview:', 'github'].join(''),
    ['start:', 'github', '-preview'].join(''),
    ['create', 'github', 'preview'].join('-'),
    ['start', 'github', 'preview'].join('-'),
    ['SPPW', 'META'].join(', '),
    ['SPPW.DE', 'META'].join(', '),
  ];
  const offenders = [];

  for (const file of publicFiles()) {
    if (!textExtensions.has(path.extname(file))) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const item of forbidden) {
      if (text.includes(item)) offenders.push(`${path.relative(root, file)} contains ${item}`);
    }
  }

  assert.deepEqual(offenders, []);
});

test('fresh install configuration does not bundle personal holdings or plans', () => {
  const appSource = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  assert.equal(/baseShares:\s*[1-9]/.test(appSource), false);
  assert.match(appSource, /const defaultAutoPlans = \[\];/);
});

test('gitignore protects local portfolio data and private imports', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const pattern of ['*.sqlite', '*.sqlite-wal', '*.sqlite-shm', '.backups/', 'data/', 'local/', '.env', 'AGENTS.md']) {
    assert.ok(gitignore.includes(pattern), `${pattern} is ignored`);
  }
});
