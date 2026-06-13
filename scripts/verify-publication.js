const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const cliRootArg = process.argv.find((arg) => arg.startsWith('--root='));
const repoRoot = cliRootArg
  ? path.resolve(process.cwd(), cliRootArg.slice('--root='.length))
  : process.env.VALORGRID_REPO_ROOT
    ? path.resolve(process.env.VALORGRID_REPO_ROOT)
    : process.cwd();

const IGNORED_DIRS = new Set([
  '.git',
  '.backups',
  'backups',
  '.idea',
  '.vscode',
  'data',
  'dist',
  'imports',
  'local',
  'node_modules',
  '.opencode',
  '.codex',
  'tmp',
  'temp',
  '.cache',
  '.agents',
]);

const IGNORED_FILE_PATTERNS = [/^PLAN.*\.md$/i, /^Plan_.*\.md$/i];

const TRACKED_PUBLIC_PATHS = ['.opencode/', '.agents/', '.codex/', 'skills-lock.json'];
const LOCAL_PUBLIC_WORKFLOW_DIRS = [
  path.join('.opencode', 'agent'),
  path.join('.opencode', 'commands'),
  path.join('.opencode', 'skills'),
];

const TEXT_EXTENSIONS = new Set(['', '.css', '.html', '.js', '.json', '.md', '.ps1', '.sh', '.txt', '.yml']);

const FORBIDDEN_TEXT_PATTERNS = [
  ['C:', 'Users'].join('\\'),
  ['C:', 'Users'].join('\\\\'),
  ['Lib', 'ro1'].join(''),
  ['github', 'preview'].join('-'),
  ['valorgrid', 'github', 'preview'].join('-'),
  ['preview:', 'github'].join(''),
  ['start:', 'github', 'preview'].join('-'),
  ['create', 'github', 'preview'].join('-'),
  ['start', 'github', 'preview'].join('-'),
  String.fromCharCode(27) + '[',
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

const PUBLIC_BROKER_TEASER_PATTERNS = new Set([
  ['DE', 'GIRO'].join(''),
  ['I', 'BKR'].join(''),
  ['degiro', 'csv'].join('-'),
  ['ibkr', 'csv'].join('-'),
]);

const PUBLIC_BROKER_TEASER_FILES = new Set([
  'index.html',
  ['apps', 'server', 'src', 'domains', 'data-ingestion', 'ingestion-profiles.js'].join(path.sep),
  'apps/server/src/domains/data-ingestion/ingestion-profiles.js',
  ['test', 'imports.test.js'].join(path.sep),
  'test/imports.test.js',
  ['test', 'frontend-renovation.test.js'].join(path.sep),
  'test/frontend-renovation.test.js',
  'apps/web/src/imports.js',
  ['apps', 'web', 'src', 'imports.js'].join(path.sep),
  'apps/web/src/import-workflow.js',
  ['apps', 'web', 'src', 'import-workflow.js'].join(path.sep),
  'apps/web/src/import-workflow-helpers.js',
  ['apps', 'web', 'src', 'import-workflow-helpers.js'].join(path.sep),
]);

const REQUIRED_GITIGNORE_PATTERNS = [
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
];

const REQUIRED_DOCKERIGNORE_PATTERNS = [
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
];

const checks = [];
let failed = 0;

function addCheck(status, id, message, details = null) {
  if (status === 'fail') failed += 1;
  checks.push({ status, id, message, details });
}

function statusLabel(status) {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'WARN';
  return 'FAIL';
}

function runNodeSyntaxCheck(target) {
  const absolute = path.isAbsolute(target) ? target : path.join(repoRoot, target);
  if (!fs.existsSync(absolute)) {
    addCheck('warn', `node-check:${path.basename(target)}`, `Skipped syntax check (file not present): ${target}`);
    return;
  }
  try {
    execFileSync(process.execPath, ['--check', absolute], { stdio: 'pipe' });
    addCheck('ok', `node-check:${path.basename(target)}`, `Syntax check passed: ${target}`);
  } catch (error) {
    addCheck('fail', `node-check:${path.basename(target)}`, `Syntax check failed: ${target}`, error.stderr?.toString() || error.message);
  }
}

function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) collectFiles(path.join(dir, entry.name), files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(entry.name))) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function collectTrackedPublicFiles() {
  let output = '';
  try {
    output = execFileSync('git', ['-C', repoRoot, 'ls-files', '--', ...TRACKED_PUBLIC_PATHS], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((relative) => path.join(repoRoot, relative))
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
    .filter((file) => !IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(path.basename(file))));
}

function collectLocalPublicWorkflowFiles() {
  return LOCAL_PUBLIC_WORKFLOW_DIRS.flatMap((relativeDir) => {
    const fullDir = path.join(repoRoot, relativeDir);
    return fs.existsSync(fullDir) ? collectFiles(fullDir) : [];
  });
}

function collectPublicFiles() {
  return Array.from(new Set([...collectFiles(repoRoot), ...collectLocalPublicWorkflowFiles(), ...collectTrackedPublicFiles()]));
}

function collectRuntimeFiles(relativeDir) {
  const fullDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(fullDir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const childRelative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectRuntimeFiles(childRelative));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(js|ps1|sh)$/i.test(entry.name)) continue;
    results.push(childRelative);
  }
  return results;
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (!pkg.version) {
    addCheck('fail', 'package-version', 'package.json does not contain a version field');
    return null;
  }
  addCheck('ok', 'package-version', `package.json version present: ${pkg.version}`);
  return pkg;
}

function checkGitignore() {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    addCheck('fail', 'gitignore-exists', '.gitignore is missing');
    return;
  }
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  const missing = REQUIRED_GITIGNORE_PATTERNS.filter((pattern) => !gitignore.includes(pattern));
  if (missing.length) {
    addCheck('fail', 'gitignore-patterns', `.gitignore is missing required patterns: ${missing.join(', ')}`, missing);
  } else {
    addCheck('ok', 'gitignore-patterns', '.gitignore contains all required patterns.');
  }
}

function checkDockerignore() {
  const dockerignorePath = path.join(repoRoot, '.dockerignore');
  if (!fs.existsSync(dockerignorePath)) {
    addCheck('fail', 'dockerignore-exists', '.dockerignore is required for Docker publication safety');
    return;
  }
  const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');
  const missing = REQUIRED_DOCKERIGNORE_PATTERNS.filter((pattern) => !dockerignore.includes(pattern));
  if (missing.length) {
    addCheck('fail', 'dockerignore-patterns', `.dockerignore is missing required patterns: ${missing.join(', ')}`, missing);
  } else {
    addCheck('ok', 'dockerignore-patterns', '.dockerignore contains all required patterns.');
  }
}

function relativePosix(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function matchesAnyBrokerTeaserFile(relative) {
  return PUBLIC_BROKER_TEASER_FILES.has(relative) || PUBLIC_BROKER_TEASER_FILES.has(relative.split('/').join(path.sep));
}

function checkForbiddenFiles() {
  const publicFiles = collectPublicFiles();
  const allowedPrivateRootFiles = new Set([
    'portfolio.sqlite',
    ['portfolio.sqlite', 'wal'].join('-'),
    ['portfolio.sqlite', 'shm'].join('-'),
  ]);
  const forbidden = [];
  for (const file of publicFiles) {
    const name = path.basename(file);
    if (allowedPrivateRootFiles.has(name)) continue;
    if (
      name.endsWith('.sqlite') ||
      name.endsWith('.sqlite-wal') ||
      name.endsWith('.sqlite-shm') ||
      name.endsWith('.sqlite.sql') ||
      name.endsWith('.dump') ||
      name.endsWith('.dbdump') ||
      name.endsWith('.log') ||
      name.endsWith('.out') ||
      name.endsWith('.err') ||
      name.startsWith('debug-') ||
      /^PLAN.*\.md$/i.test(name) ||
      /^Plan_.*\.md$/i.test(name)
    ) {
      forbidden.push(file);
    }
  }
  if (forbidden.length) {
    addCheck('fail', 'forbidden-files', `Forbidden publishable files found: ${forbidden.length}`, forbidden);
  } else {
    addCheck('ok', 'forbidden-files', 'No forbidden publishable files found.');
  }
}

function checkForbiddenText() {
  const publicFiles = collectPublicFiles();
  const leaks = [];
  for (const file of publicFiles) {
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
    const relative = relativePosix(file);
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
      if (matchesAnyBrokerTeaserFile(relative) && PUBLIC_BROKER_TEASER_PATTERNS.has(pattern)) continue;
      if (content.includes(pattern)) {
        leaks.push(`${relative} contains ${pattern}`);
      }
    }
  }
  if (leaks.length) {
    addCheck('fail', 'forbidden-text', 'Private or preview text patterns found', leaks);
  } else {
    addCheck('ok', 'forbidden-text', 'No private or preview text patterns found.');
  }
}

function checkAlterTable() {
  const offenders = [];
  for (const relative of [...collectRuntimeFiles('apps/server/src'), ...collectRuntimeFiles('scripts')]) {
    const content = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    if (/\bALTER\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+(ADD|RENAME|DROP|ALTER)\b/.test(content)) {
      offenders.push(relative);
    }
  }
  if (offenders.length) {
    addCheck('fail', 'alter-table', 'ALTER TABLE is forbidden in runtime/scripts (fresh-only policy)', offenders);
  } else {
    addCheck('ok', 'alter-table', 'No ALTER TABLE statements in runtime/scripts.');
  }
}

function checkSeedDemo() {
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const seed = pkg.scripts?.['seed:demo'];
  if (!seed || !seed.includes('scripts/seed-loadtest-db.js')) {
    addCheck('fail', 'seed-demo', 'seed:demo must route through scripts/seed-loadtest-db.js');
    return;
  }
  if (pkg.scripts?.['seed:loadtest']) {
    addCheck('fail', 'seed-loadtest-alias', 'seed:loadtest alias must not exist alongside seed:demo');
    return;
  }
  addCheck('ok', 'seed-demo', 'seed:demo uses canonical loadtest entrypoint.');
}

function checkCasaosCompose(pkg) {
  const composePath = path.join(repoRoot, 'deploy', 'docker', 'compose.casaos.yml');
  if (!fs.existsSync(composePath)) {
    addCheck('warn', 'casaos-compose', 'compose.casaos.yml not present; skipped CasaOS checks.');
    return;
  }

  const compose = fs.readFileSync(composePath, 'utf8');
  const requiredPatterns = [
    ['image: ghcr.io/aivm23/valorgrid:latest', /^\s*image:\s*ghcr\.io\/aivm23\/valorgrid:latest\s*$/m],
    [`PORT=1325`, /^\s*PORT:\s*1325\s*$/m],
    [`target: 1325`, /^\s*-\s*target:\s*1325\s*$/m],
    [`published: "1325"`, /^\s*published:\s*["']?1325["']?\s*$/m],
    [`container: "1325"`, /^\s*-\s*container:\s*["']?1325["']?\s*$/m],
    [`version: v${pkg.version}`, new RegExp(`^\\s*version:\\s*["']?v${pkg.version.replace(/\./g, '\\.')}["']?\\s*$`, 'm')],
    ['port_map: "1325"', /^\s*port_map:\s*["']?1325["']?\s*$/m],
  ];
  const missing = requiredPatterns.filter(([, pattern]) => !pattern.test(compose)).map(([label]) => label);

  if (missing.length) {
    addCheck('fail', 'casaos-compose', 'compose.casaos.yml has stale CasaOS image, version or port metadata', missing);
  } else {
    addCheck('ok', 'casaos-compose', `compose.casaos.yml tracks latest on port 1325 with metadata v${pkg.version}.`);
  }
}

function run() {
  const pkg = readVersion();
  if (!pkg) {
    return printReport();
  }

  runNodeSyntaxCheck('apps/server/server.js');
  runNodeSyntaxCheck('apps/web/src/app.js');

  checkGitignore();
  checkDockerignore();
  checkForbiddenFiles();
  checkForbiddenText();
  checkAlterTable();
  checkSeedDemo();
  checkCasaosCompose(pkg);

  return printReport();
}

function printReport() {
  for (const check of checks) {
    const line = `[${statusLabel(check.status)}] ${check.message}`;
    if (check.details) {
      process.stdout.write(`${line}\n${JSON.stringify(check.details, null, 2)}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
  const summary = {
    ok: checks.filter((check) => check.status === 'ok').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
  };
  process.stdout.write(`Summary: ${summary.ok} OK, ${summary.warn} WARN, ${summary.fail} FAIL\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

try {
  run();
} catch (error) {
  process.stderr.write(`verify-publication failed: ${error.message}\n${error.stack}\n`);
  process.exit(1);
}
