const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
// const os = require('node:os'); // disabled — backup tests commented out
const path = require('node:path');
const test = require('node:test');
const {
  resolveRuntimeConfig,
  createBackupForPath,
  resetDatabase,
  collectDoctorReport,
} = require('../scripts/db-maintenance');
const { openDatabase, verifyDatabaseFile } = require('../apps/server/src/platform/db');
// Backup-dependent functions commented out: db-maintenance.js backup features disabled
// const {
//   resolveRuntimeConfig,
//   parseSchemaTableNames,
//   resetDatabase,
//   collectDoctorReport,
// } = require('../scripts/db-maintenance');
// Backup-dependent imports commented out
// const { openDatabase } = require('../src/platform/db');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');

// withTempRoot disabled — backup tests commented out
// function withTempRoot(fn) {
//   const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-db-ops-'));
//   try {
//     return fn(tempRoot);
//   } finally {
//     fs.rmSync(tempRoot, { recursive: true, force: true });
//   }
// }

// Backup-dependent tests commented out: resetDatabase, backupDir, collectDoctorReport
// test('database runtime path resolution follows app policy', () => {
//   withTempRoot((tempRoot) => {
//     const plain = resolveRuntimeConfig({}, tempRoot);
//     assert.equal(plain.dbPath, path.join(tempRoot, 'data', 'portfolio.sqlite'));
//     assert.equal(plain.backupDir, path.join(tempRoot, '.backups'));
//     assert.equal(plain.port, 1325);
//
//     fs.writeFileSync(path.join(tempRoot, 'portfolio.sqlite'), '');
//     const legacy = resolveRuntimeConfig({}, tempRoot);
//     assert.equal(legacy.dbPath, path.join(tempRoot, 'portfolio.sqlite'));
//
//     const explicit = resolveRuntimeConfig(
//       {
//         PORTFOLIO_DB_PATH: path.join(tempRoot, 'custom', 'override.sqlite'),
//         VALORGRID_BACKUP_DIR: path.join(tempRoot, 'custom', 'backups'),
//         PORT: '0',
//       },
//       tempRoot,
//     );
//     assert.equal(explicit.dbPath, path.join(tempRoot, 'custom', 'override.sqlite'));
//     assert.equal(explicit.backupDir, path.join(tempRoot, 'custom', 'backups'));
//     assert.equal(explicit.port, 0);
//
//     const desktopLike = resolveRuntimeConfig(
//       {
//         PORTFOLIO_DB_PATH: path.join(tempRoot, 'desktop-data', 'portfolio.sqlite'),
//       },
//       tempRoot,
//     );
//     assert.equal(desktopLike.backupDir, path.join(tempRoot, 'backups'));
//   });
// });

// test('resetDatabase creates backup, removes sidecars, and recreates fresh schema', () => {
//   withTempRoot((tempRoot) => {
//     const dbPath = path.join(tempRoot, 'reset-target.sqlite');
//     const env = { PORTFOLIO_DB_PATH: dbPath };
//     const db = openDatabase(dbPath);
//     db.exec(`
//       CREATE TABLE pre_reset_data (id INTEGER PRIMARY KEY);
//       INSERT INTO pre_reset_data (id) VALUES (1);
//     `);
//     db.close();
//
//     fs.writeFileSync(`${dbPath}-wal`, 'wal');
//     fs.writeFileSync(`${dbPath}-shm`, 'shm');
//
//     const result = resetDatabase({ env, root: tempRoot });
//     assert.ok(result.backup);
//     assert.ok(fs.existsSync(result.backup.path));
//     assert.ok(result.removedArtifacts.removed.includes(dbPath));
//     const accountedArtifacts = new Set([
//       ...result.removedArtifacts.removed,
//       ...result.removedArtifacts.missing,
//     ]);
//     assert.ok(accountedArtifacts.has(`${dbPath}-wal`));
//     assert.ok(accountedArtifacts.has(`${dbPath}-shm`));
//     assert.equal(fs.existsSync(`${dbPath}-wal`), false);
//     assert.equal(fs.existsSync(`${dbPath}-shm`), false);
//     assert.deepEqual(result.verification.missingTables, []);
//     assert.deepEqual(result.verification.missingMetaKeys, []);
//
//     const reopened = openDatabase(dbPath);
//     const stale = reopened
//       .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pre_reset_data'")
//       .get();
//     reopened.close();
//     assert.equal(stale, undefined);
//   });
// });

// test('db scripts write backups to configured backupDir', () => {
//   withTempRoot((tempRoot) => {
//     const dbPath = path.join(tempRoot, 'desktop-data', 'portfolio.sqlite');
//     const env = { PORTFOLIO_DB_PATH: dbPath };
//     fs.mkdirSync(path.dirname(dbPath), { recursive: true });
//     const db = openDatabase(dbPath);
//     db.exec('CREATE TABLE pre_reset_data (id INTEGER PRIMARY KEY)');
//     db.close();
//
//     const config = resolveRuntimeConfig(env, tempRoot);
//     const result = resetDatabase({ env, root: tempRoot });
//     assert.ok(result.backup);
//     assert.equal(path.dirname(result.backup.path), config.backupDir);
//     assert.equal(fs.existsSync(path.join(tempRoot, '.backups')), false);
//
//     const report = collectDoctorReport({ env, root: tempRoot });
//     assert.equal(report.backupDir, config.backupDir);
//     assert.equal(report.backupsCount, 1);
//     assert.ok(report.checks.some((check) => check.id === 'backups' && check.status === 'ok'));
//   });
// });

// test('db doctor reports fail for missing db and passes for valid fresh db', () => {
//   withTempRoot((tempRoot) => {
//     const missingPath = path.join(tempRoot, 'missing.sqlite');
//     const missingReport = collectDoctorReport({
//       env: { PORTFOLIO_DB_PATH: missingPath },
//       root: tempRoot,
//     });
//     assert.ok(missingReport.summary.fail >= 1);
//
//     const validPath = path.join(tempRoot, 'valid.sqlite');
//     const validDb = openDatabase(validPath);
//     validDb.close();
//     resetDatabase({ env: { PORTFOLIO_DB_PATH: validPath }, root: tempRoot });
//     const validReport = collectDoctorReport({
//       env: { PORTFOLIO_DB_PATH: validPath },
//       root: tempRoot,
//     });
//     assert.equal(validReport.summary.fail, 0);
//   });
// });

function withActiveTempRoot(fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-db-ops-'));
  try {
    return fn(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function createLegacyDatabase(dbPath) {
  const db = openDatabase(dbPath);
  db.exec(`
    CREATE TABLE pre_reset_data (id INTEGER PRIMARY KEY);
    INSERT INTO pre_reset_data (id) VALUES (1);
  `);
  db.close();
}

test('database runtime path resolution follows app policy', () => {
  withActiveTempRoot((tempRoot) => {
    const plain = resolveRuntimeConfig({}, tempRoot);
    assert.equal(plain.dbPath, path.join(tempRoot, 'local', 'valorgrid', 'data', 'portfolio.sqlite'));
    assert.equal(plain.backupDir, path.join(tempRoot, 'local', 'valorgrid', 'backups'));
    assert.equal(plain.port, 1325);

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
  });
});

test('resetDatabase creates and verifies a backup before recreating a fresh schema', () => {
  withActiveTempRoot((tempRoot) => {
    const dbPath = path.join(tempRoot, 'reset-target.sqlite');
    const env = { PORTFOLIO_DB_PATH: dbPath };
    createLegacyDatabase(dbPath);

    const result = resetDatabase({ env, root: tempRoot });
    assert.ok(result.backup);
    assert.equal(result.backup.verified, true);
    assert.ok(fs.existsSync(result.backup.path));
    assert.deepEqual(verifyDatabaseFile(result.backup.path), {
      integrityCheck: 'ok',
      foreignKeyErrors: 0,
    });
    assert.ok(result.removedArtifacts.removed.includes(dbPath));
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

test('resetDatabase creates a fresh database without a backup when no database exists', () => {
  withActiveTempRoot((tempRoot) => {
    const dbPath = path.join(tempRoot, 'missing.sqlite');
    const result = resetDatabase({ env: { PORTFOLIO_DB_PATH: dbPath }, root: tempRoot });
    assert.equal(result.backup, null);
    assert.ok(fs.existsSync(dbPath));
    assert.deepEqual(result.verification.missingTables, []);
  });
});

test('resetDatabase leaves the active database untouched when backup creation fails', () => {
  withActiveTempRoot((tempRoot) => {
    const dbPath = path.join(tempRoot, 'protected.sqlite');
    createLegacyDatabase(dbPath);
    assert.throws(
      () =>
        resetDatabase({
          env: { PORTFOLIO_DB_PATH: dbPath },
          root: tempRoot,
          createBackupFn() {
            throw new Error('simulated backup failure');
          },
        }),
      /simulated backup failure/,
    );
    assert.ok(fs.existsSync(dbPath));
    const db = openDatabase(dbPath);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM pre_reset_data').get().count, 1);
    db.close();
  });
});

test('resetDatabase rejects an unverified backup before deleting the active database', () => {
  withActiveTempRoot((tempRoot) => {
    const dbPath = path.join(tempRoot, 'protected.sqlite');
    createLegacyDatabase(dbPath);
    assert.throws(
      () =>
        resetDatabase({
          env: { PORTFOLIO_DB_PATH: dbPath },
          root: tempRoot,
          createBackupFn() {
            return { path: path.join(tempRoot, 'invalid.sqlite'), verified: false };
          },
        }),
      /automatic backup was not verified/,
    );
    assert.ok(fs.existsSync(dbPath));
  });
});

test('manual and reset backups share the configured backup directory', () => {
  withActiveTempRoot((tempRoot) => {
    const dbPath = path.join(tempRoot, 'desktop-data', 'portfolio.sqlite');
    const backupDir = path.join(tempRoot, 'desktop-backups');
    const env = { PORTFOLIO_DB_PATH: dbPath, VALORGRID_BACKUP_DIR: backupDir };
    createLegacyDatabase(dbPath);

    const manual = createBackupForPath({ dbPath, root: tempRoot, backupDir });
    assert.equal(manual.verified, true);
    assert.equal(path.dirname(manual.path), backupDir);

    const result = resetDatabase({ env, root: tempRoot });
    assert.equal(result.backup.verified, true);
    assert.equal(path.dirname(result.backup.path), backupDir);

    const report = collectDoctorReport({ env, root: tempRoot });
    assert.equal(report.backupDir, backupDir);
    assert.equal(report.backupsCount, 2);
    assert.ok(report.checks.some((check) => check.id === 'backups' && check.status === 'ok'));
  });
});

test('schema tables in DATA_MODEL docs stay synchronized with src/schema.js', () => {
  // parseSchemaTableNames commented out — using inline implementation
  const source = fs.readFileSync(path.join(root, 'apps', 'server', 'src', 'schema.js'), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/\bCREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
    names.add(match[1]);
  }
  const schemaTables = [...names].sort();

  const docsSource = fs.readFileSync(path.join(root, 'docs', 'DATA_MODEL.md'), 'utf8');
  const docTables = new Set(
    [...docsSource.matchAll(/^###\s+`([a-z_][a-z0-9_]*)`/gim)].map((match) => match[1]),
  );

  const missingInDocs = schemaTables.filter((table) => !docTables.has(table));
  const extraInDocs = [...docTables].filter((table) => !schemaTables.includes(table));

  assert.deepEqual(missingInDocs, [], `Tables missing in docs: ${missingInDocs.join(', ')}`);
  assert.deepEqual(extraInDocs, [], `Tables not found in schema: ${extraInDocs.join(', ')}`);
});

test('update 3.15.0 to 3.16.0 allows crypto instrument type without data loss', () => {
  const { openDatabase } = require('../apps/server/src/platform/db');
  const tmpPath = path.join(root, 'local', 'valorgrid', 'data', 'tmp-crypto-test.sqlite');
  try { fs.mkdirSync(path.dirname(tmpPath), { recursive: true }); } catch {}
  try { fs.unlinkSync(tmpPath); } catch {}
  const tmpDb = openDatabase(tmpPath);
  tmpDb.exec(`
    CREATE TABLE instruments (
      symbol TEXT PRIMARY KEY,
      yahoo_symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('etf', 'stock', 'fx')),
      currency TEXT NOT NULL,
      color TEXT NOT NULL,
      base_shares REAL NOT NULL DEFAULT 0,
      fallback_price REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      group_id TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      show_in_distribution INTEGER NOT NULL DEFAULT 1,
      show_in_monthly INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_instruments_type_active ON instruments (type, active);
    CREATE INDEX IF NOT EXISTS idx_instruments_group_active ON instruments (group_id, active);
  `);
  tmpDb.prepare(
    `INSERT INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('OLD', 'OLD.EX', 'Old Stock', 'stock', 'EUR', '#2563eb', 0, 0, 1, 0);

  const sqlPath = path.join(root, 'deploy', 'sql', 'update-3.15.0-to-3.16.0.sql');
  assert.ok(fs.existsSync(sqlPath), 'SQL update file exists');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  tmpDb.exec(sql);

  const oldRow = tmpDb.prepare("SELECT type FROM instruments WHERE symbol = 'OLD'").get();
  assert.equal(oldRow.type, 'stock', 'old instrument preserved after update');

  assert.doesNotThrow(() => {
    tmpDb.prepare(
      `INSERT INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('BTC', 'BTC-EUR', 'Bitcoin', 'crypto', 'EUR', '#f7931a', 0, 0, 1, 1);
  }, 'crypto instrument insert succeeds after update');

  const newRow = tmpDb.prepare("SELECT type FROM instruments WHERE symbol = 'BTC'").get();
  assert.equal(newRow.type, 'crypto', 'crypto instrument stored correctly');

  const indexes = tmpDb.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'instruments'").all().map((row) => row.name);
  assert.ok(indexes.includes('idx_instruments_type_active'), 'idx_instruments_type_active exists after update');
  assert.ok(indexes.includes('idx_instruments_group_active'), 'idx_instruments_group_active exists after update');

  tmpDb.close();
  try { fs.unlinkSync(tmpPath); } catch {}
  try { fs.unlinkSync(tmpPath + '-wal'); } catch {}
  try { fs.unlinkSync(tmpPath + '-shm'); } catch {}
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
  collectFiles('apps/server/src');
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
