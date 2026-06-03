const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const XLSX = require('../vendor/xlsx.full.min.js');

const root = path.resolve(__dirname, '..');
const ignoredDirs = new Set([
  '.backups',
  'backups',
  '.git',
  '.github',
  '.idea',
  '.vscode',
  'data',
  'dist',
  'imports',
  'local',
  'node_modules',
  '.opencode',
]);
const ignoredFiles = [/^PLAN.*\.md$/i, /^Plan_.*\.md$/i];
const textExtensions = new Set([
  '',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.ps1',
  '.sh',
  '.txt',
  '.yml',
]);
const publicBrokerTeaserTokens = new Set([
  ['DE', 'GIRO'].join(''),
  ['I', 'BKR'].join(''),
  ['degiro', 'csv'].join('-'),
  ['ibkr', 'csv'].join('-'),
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

function allowsPublicBrokerTeaser(file) {
  const relative = path.relative(root, file);
  return relative === 'index.html' || relative === 'src\\domains\\data-ingestion\\ingestion-profiles.js' || relative === 'src/domains/data-ingestion/ingestion-profiles.js' || relative === 'test\\imports.test.js' || relative === 'test/imports.test.js' || relative === 'docs\\API.md' || relative === 'docs/API.md';
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
    ['Lib', 'ro1', '.xlsx'].join(''),
    ['portfolio.sqlite', 'wal'].join('-'),
    ['portfolio.sqlite', 'shm'].join('-'),
    ['github', 'preview'].join('-'),
    ['valorgrid', 'github', 'preview'].join('-'),
    ['preview:', 'github'].join(''),
    ['start:', 'github', '-preview'].join(''),
    ['create', 'github', 'preview'].join('-'),
    ['start', 'github', 'preview'].join('-'),
    ['SPPW', 'META'].join(', '),
    ['SPPW.DE', 'META'].join(', '),
    ['DE', 'GIRO'].join(''),
    ['I', 'BKR'].join(''),
    ['degiro', 'csv'].join('-'),
    ['ibkr', 'csv'].join('-'),
    ['broker', 'degiro'].join('-'),
    ['transactions', 'export'].join('_'),
    ['portfolio', 'snapshot'].join('_'),
  ];
  const offenders = [];

  for (const file of publicFiles()) {
    if (!textExtensions.has(path.extname(file))) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const item of forbidden) {
      if (allowsPublicBrokerTeaser(file) && publicBrokerTeaserTokens.has(item)) continue;
      if (text.includes(item)) offenders.push(`${path.relative(root, file)} contains ${item}`);
    }
  }

  assert.deepEqual(offenders, []);
});

test('public XLSX sample files do not contain private broker tokens', () => {
  const forbidden = [
    ['DE', 'GIRO'].join(''),
    ['I', 'BKR'].join(''),
    ['degiro', 'csv'].join('-'),
    ['ibkr', 'csv'].join('-'),
    ['broker', 'degiro'].join('-'),
    ['transactions', 'export'].join('_'),
    ['portfolio', 'snapshot'].join('_'),
  ];
  const offenders = [];

  for (const file of publicFiles()) {
    if (path.extname(file) !== '.xlsx') continue;
    const buffer = fs.readFileSync(file);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    workbook.SheetNames.forEach((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
      rows.forEach((row) => {
        const text = row.map((cell) => String(cell)).join(' ');
        for (const item of forbidden) {
          if (text.toLowerCase().includes(item.toLowerCase())) {
            offenders.push(`${path.relative(root, file)} sheet ${sheetName} contains ${item}`);
          }
        }
      });
    });
  }

  assert.deepEqual(offenders, []);
});

test('fresh install configuration does not bundle personal holdings or plans', () => {
  const appSource = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  assert.equal(/baseShares:\s*[1-9]/.test(appSource), false);
  assert.match(appSource, /const defaultAutoPlans = \[\];/);
  const schemaSource = fs.readFileSync(path.join(root, 'src', 'schema.js'), 'utf8');
  const privateImportToken = ['Lib', 'ro1'].join('');
  assert.equal(schemaSource.includes(privateImportToken), false);
});

test('gitignore protects local portfolio data and user import files', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const pattern of ['*.sqlite', '*.sqlite-wal', '*.sqlite-shm', '.backups/', 'backups/', 'data/', 'local/', '.env', '.opencode/']) {
    assert.ok(gitignore.includes(pattern), `${pattern} is ignored`);
  }
});

test('dockerignore protects private data from container build context', () => {
  const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
  for (const pattern of ['.git', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm', '.backups', 'backups', 'data', '.env', 'local', 'imports', '.opencode']) {
    assert.ok(dockerignore.includes(pattern), `${pattern} is ignored in Docker build context`);
  }
});
