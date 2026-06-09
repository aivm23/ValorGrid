const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  resolveRuntimeConfig,
  parseSchemaTableNames,
  resetDatabase,
  collectDoctorReport,
} = require('../scripts/db-maintenance');
const { openDatabase } = require('../src/platform/db');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');

function withTempRoot(fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-db-ops-'));
  try {
    return fn(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('database runtime path resolution follows app policy', () => {
  withTempRoot((tempRoot) => {
    const plain = resolveRuntimeConfig({}, tempRoot);
    assert.equal(plain.dbPath, path.join(tempRoot, 'data', 'portfolio.sqlite'));
    assert.equal(plain.backupDir, path.join(tempRoot, '.backups'));
    assert.equal(plain.port, 1325);

    fs.writeFileSync(path.join(tempRoot, 'portfolio.sqlite'), '');
    const legacy = resolveRuntimeConfig({}, tempRoot);
    assert.equal(legacy.dbPath, path.join(tempRoot, 'portfolio.sqlite'));

    const explicit = resolveRuntimeConfig(
      {
        PORTFOLIO_DB_PATH: path.join(tempRoot, 'custom', 'override.sqlite'),
        VALORGRID_BACKUP_DIR: path.join(tempRoot, 'custom', 'backups'),
        PORT: '0',
      },
      tempRoot,
    );
    assert.equal(explicit.dbPath, path.join(tempRoot, 'custom', 'override.sqlite'));
    assert.equal(explicit.backupDir, path.join(tempRoot, 'custom', 'backups'));
    assert.equal(explicit.port, 0);

    const desktopLike = resolveRuntimeConfig(
      {
        PORTFOLIO_DB_PATH: path.join(tempRoot, 'desktop-data', 'portfolio.sqlite'),
      },
      tempRoot,
    );
    assert.equal(desktopLike.backupDir, path.join(tempRoot, 'backups'));
  });
});

test('resetDatabase creates backup, removes sidecars, and recreates fresh schema', () => {
  withTempRoot((tempRoot) => {
    const dbPath = path.join(tempRoot, 'reset-target.sqlite');
    const env = { PORTFOLIO_DB_PATH: dbPath };
    const db = openDatabase(dbPath);
    db.exec(`
      CREATE TABLE pre_reset_data (id INTEGER PRIMARY KEY);
      INSERT INTO pre_reset_data (id) VALUES (1);
    `);
    db.close();

    fs.writeFileSync(`${dbPath}-wal`, 'wal');
    fs.writeFileSync(`${dbPath}-shm`, 'shm');

    const result = resetDatabase({ env, root: tempRoot });
    assert.ok(result.backup);
    assert.ok(fs.existsSync(result.backup.path));
    assert.ok(result.removedArtifacts.removed.includes(dbPath));
    const accountedArtifacts = new Set([
      ...result.removedArtifacts.removed,
      ...result.removedArtifacts.missing,
    ]);
    assert.ok(accountedArtifacts.has(`${dbPath}-wal`));
    assert.ok(accountedArtifacts.has(`${dbPath}-shm`));
    assert.equal(fs.existsSync(`${dbPath}-wal`), false);
    assert.equal(fs.existsSync(`${dbPath}-shm`), false);
    assert.deepEqual(result.verification.missingTables, []);
    assert.deepEqual(result.verification.missingMetaKeys, []);

    const reopened = openDatabase(dbPath);
    const stale = reopened
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pre_reset_data'")
      .get();
    reopened.close();
    assert.equal(stale, undefined);
  });
});

test('db scripts write backups to configured backupDir', () => {
  withTempRoot((tempRoot) => {
    const dbPath = path.join(tempRoot, 'desktop-data', 'portfolio.sqlite');
    const env = { PORTFOLIO_DB_PATH: dbPath };
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = openDatabase(dbPath);
    db.exec('CREATE TABLE pre_reset_data (id INTEGER PRIMARY KEY)');
    db.close();

    const config = resolveRuntimeConfig(env, tempRoot);
    const result = resetDatabase({ env, root: tempRoot });
    assert.ok(result.backup);
    assert.equal(path.dirname(result.backup.path), config.backupDir);
    assert.equal(fs.existsSync(path.join(tempRoot, '.backups')), false);

    const report = collectDoctorReport({ env, root: tempRoot });
    assert.equal(report.backupDir, config.backupDir);
    assert.equal(report.backupsCount, 1);
    assert.ok(report.checks.some((check) => check.id === 'backups' && check.status === 'ok'));
  });
});

test('db doctor reports fail for missing db and passes for valid fresh db', () => {
  withTempRoot((tempRoot) => {
    const missingPath = path.join(tempRoot, 'missing.sqlite');
    const missingReport = collectDoctorReport({
      env: { PORTFOLIO_DB_PATH: missingPath },
      root: tempRoot,
    });
    assert.ok(missingReport.summary.fail >= 1);

    const validPath = path.join(tempRoot, 'valid.sqlite');
    const validDb = openDatabase(validPath);
    validDb.close();
    resetDatabase({ env: { PORTFOLIO_DB_PATH: validPath }, root: tempRoot });
    const validReport = collectDoctorReport({
      env: { PORTFOLIO_DB_PATH: validPath },
      root: tempRoot,
    });
    assert.equal(validReport.summary.fail, 0);
  });
});

test('schema tables in DATA_MODEL docs stay synchronized with src/schema.js', () => {
  const schemaTables = parseSchemaTableNames();
  const docsSource = fs.readFileSync(path.join(root, 'docs', 'DATA_MODEL.md'), 'utf8');
  const docTables = new Set(
    [...docsSource.matchAll(/^###\s+`([a-z_][a-z0-9_]*)`/gim)].map((match) => match[1]),
  );

  const missingInDocs = schemaTables.filter((table) => !docTables.has(table));
  const extraInDocs = [...docTables].filter((table) => !schemaTables.includes(table));

  assert.deepEqual(missingInDocs, [], `Tables missing in docs: ${missingInDocs.join(', ')}`);
  assert.deepEqual(extraInDocs, [], `Tables not found in schema: ${extraInDocs.join(', ')}`);
});

test('runtime code and scripts do not contain ALTER TABLE migrations', () => {
  const runtimeFiles = [];
  function collectFiles(relativeDir) {
    const fullDir = path.join(root, relativeDir);
    for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
      const childRelative = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(childRelative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(js|ps1|sh)$/i.test(entry.name)) continue;
      runtimeFiles.push(childRelative);
    }
  }
  collectFiles('src');
  collectFiles('scripts');

  const offenders = runtimeFiles.filter((relativePath) =>
    /\bALTER\s+TABLE\s+[a-z_][a-z0-9_]*\s+(ADD|RENAME|DROP|ALTER)\b/i.test(
      fs.readFileSync(path.join(root, relativePath), 'utf8'),
    ),
  );
  assert.deepEqual(offenders, [], `ALTER TABLE is not allowed in runtime/scripts: ${offenders.join(', ')}`);
});

test('demo command is canonical and loadtest alias has been removed', () => {
  assert.ok(
    pkg.scripts['seed:demo'].includes('scripts/seed-loadtest-db.js'),
    'seed:demo must use the canonical dataset entrypoint',
  );
  assert.equal(pkg.scripts['seed:loadtest'], undefined, 'seed:loadtest should not exist');

  const helpersSource = fs.readFileSync(path.join(root, 'test', 'integration-helpers.js'), 'utf8');
  assert.equal(
    helpersSource.includes('function seedSyntheticHistory'),
    false,
    'integration helpers must not define a second synthetic dataset generator',
  );
});
