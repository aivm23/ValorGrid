const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const ExcelJS = require('exceljs');

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
  '.agents',
  '.codex',
]);
const ignoredFiles = [/^PLAN.*\.md$/i, /^Plan_.*\.md$/i];
const trackedPublicPaths = ['.opencode/', '.agents/', '.codex/', 'skills-lock.json'];
const localPublicWorkflowDirs = [
  path.join('.opencode', 'agent'),
  path.join('.opencode', 'commands'),
  path.join('.opencode', 'skills'),
];
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

function collectPublicFiles(dir = root, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) collectPublicFiles(path.join(dir, entry.name), files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (ignoredFiles.some((pattern) => pattern.test(entry.name))) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function trackedIgnoredPublicFiles() {
  let output = '';
  try {
    output = execFileSync('git', ['-C', root, 'ls-files', '--', ...trackedPublicPaths], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((relative) => path.join(root, relative))
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
    .filter((file) => !ignoredFiles.some((pattern) => pattern.test(path.basename(file))));
}

function localPublicWorkflowFiles() {
  return localPublicWorkflowDirs.flatMap((relativeDir) => {
    const fullDir = path.join(root, relativeDir);
    return fs.existsSync(fullDir) ? collectPublicFiles(fullDir) : [];
  });
}

function publicFiles() {
  return Array.from(new Set([...collectPublicFiles(), ...localPublicWorkflowFiles(), ...trackedIgnoredPublicFiles()]));
}

function allowsPublicBrokerTeaser(file) {
  const relative = path.relative(root, file);
  return relative === 'index.html' || relative === 'src\\domains\\data-ingestion\\ingestion-profiles.js' || relative === 'src/domains/data-ingestion/ingestion-profiles.js' || relative === 'test\\imports.test.js' || relative === 'test/imports.test.js' || relative === 'test\\frontend-renovation.test.js' || relative === 'test/frontend-renovation.test.js' || relative === 'client/imports.js' || relative === 'client\\imports.js' || relative === 'client/import-workflow.js' || relative === 'client\\import-workflow.js' || relative === 'client/import-workflow-helpers.js' || relative === 'client\\import-workflow-helpers.js';
}

function publicDocumentationFiles() {
  return publicFiles().filter((file) => {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    return relative === 'README.md' || relative === 'AGENTS.md' || relative.startsWith('docs/');
  });
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

test('public documentation does not expose professional connector internals', () => {
  const forbidden = [
    ['VALORGRID', 'PRO', 'ADAPTERS', 'PATH'].join('_'),
    ['degiro', 'csv'].join('-'),
    ['ibkr', 'csv'].join('-'),
    ['DE', 'GIRO'].join(''),
    ['I', 'BKR'].join(''),
    'knownProAdapters',
    'loadProAdapters',
    'repositorio privado',
    'private repo',
    ['transactions', 'export'].join('_'),
    ['broker', 'degiro'].join('-'),
  ];
  const offenders = [];

  for (const file of publicDocumentationFiles()) {
    if (!textExtensions.has(path.extname(file))) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const item of forbidden) {
      if (text.toLowerCase().includes(item.toLowerCase())) {
        offenders.push(`${path.relative(root, file)} contains ${item}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

function plainCellValue(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  if (typeof value === 'object' && value.text) return String(value.text);
  if (typeof value === 'object' && value.result !== undefined) return value.result;
  return value;
}

test('public XLSX sample files do not contain private broker tokens', async () => {
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
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    workbook.worksheets.forEach((worksheet) => {
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const cells = [];
        for (let columnIndex = 1; columnIndex <= Math.max(row.actualCellCount || 0, worksheet.actualColumnCount || 0); columnIndex += 1) {
          cells.push(plainCellValue(row.getCell(columnIndex)));
        }
        const text = cells.map((cell) => String(cell)).join(' ');
        for (const item of forbidden) {
          if (text.toLowerCase().includes(item.toLowerCase())) {
            offenders.push(`${path.relative(root, file)} sheet ${worksheet.name} contains ${item}`);
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
  for (const pattern of [
    '*.sqlite',
    '*.sqlite-wal',
    '*.sqlite-shm',
    '.backups/',
    'backups/',
    'data/',
    'local/',
    '.env',
    '.opencode/*',
    '.opencode/plans/',
    '.agents/',
    'skills-lock.json',
    '.codex/',
  ]) {
    assert.ok(gitignore.includes(pattern), `${pattern} is ignored`);
  }
  assert.ok(gitignore.includes('!.opencode/commands/'), 'public OpenCode commands are visible to Git');
  assert.ok(gitignore.includes('!.opencode/skills/'), 'public OpenCode skills are visible to Git');
});

test('dockerignore protects private data from container build context', () => {
  const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
  for (const pattern of ['.git', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm', '.backups', 'backups', 'data', '.env', 'local', 'imports', '.opencode']) {
    assert.ok(dockerignore.includes(pattern), `${pattern} is ignored in Docker build context`);
  }
});
