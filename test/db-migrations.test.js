const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { openDatabase } = require('../apps/server/src/platform/db');
const migrations = require('../apps/server/src/platform/db-migrations');

const root = path.resolve(__dirname, '..');
const sqlDir = path.join(root, 'deploy', 'sql');

function withTempDb(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-migrations-'));
  const dbPath = path.join(tempDir, 'portfolio.sqlite');
  const backupDir = path.join(tempDir, 'backups');
  try {
    return fn({ tempDir, dbPath, backupDir });
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows may lock WAL/SHM briefly */ }
  }
}

function buildCtx(db, dbPath, backupDir, options = {}) {
  return {
    db,
    dbPath,
    backupDir,
    config: { repoRoot: root, runtime: { mode: options.mode || 'server' } },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
}

function createOldSchema29(db) {
  db.exec(`
    CREATE TABLE instruments (
      symbol TEXT PRIMARY KEY,
      yahoo_symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('etf', 'stock', 'crypto', 'commodity', 'fx', 'cash')),
      currency TEXT NOT NULL,
      color TEXT NOT NULL,
      base_shares REAL NOT NULL DEFAULT 0,
      cash_balance REAL NOT NULL DEFAULT 0,
      cash_balance_updated_at TEXT,
      fallback_price REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      group_id TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      show_in_distribution INTEGER NOT NULL DEFAULT 1,
      show_in_monthly INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO app_meta (key, value) VALUES ('ledger_version', '1');
    INSERT INTO app_meta (key, value) VALUES ('price_version', '1');
    INSERT INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active)
    VALUES ('TEST', 'TEST.EX', 'Test', 'stock', 'EUR', '#000000', 0, 0, 1);
  `);
}

test('migration does not run on an empty database', () => {
  withTempDb(({ dbPath, backupDir }) => {
    const db = openDatabase(dbPath);
    const ctx = buildCtx(db, dbPath, backupDir);
    migrations(ctx);
    const result = ctx.runMigrations();
    assert.equal(result.migrated, false);
    assert.equal(result.reason, 'empty');
    db.close();
  });
});

test('migration creates a backup before applying SQL', () => {
  withTempDb(({ dbPath, backupDir }) => {
    const db = openDatabase(dbPath);
    createOldSchema29(db);
    const ctx = buildCtx(db, dbPath, backupDir);
    migrations(ctx);
    const result = ctx.runMigrations();
    assert.equal(result.migrated, true);
    assert.ok(result.backupPath, 'backup path is returned');
    assert.ok(fs.existsSync(result.backupPath), 'backup file exists on disk');
    db.close();
  });
});

test('migration updates schema_version in app_meta', () => {
  withTempDb(({ dbPath, backupDir }) => {
    const db = openDatabase(dbPath);
    createOldSchema29(db);
    const ctx = buildCtx(db, dbPath, backupDir);
    migrations(ctx);
    const result = ctx.runMigrations();
    assert.equal(result.migrated, true);
    assert.equal(result.toVersion, '3.31.0');

    const schemaVersion = db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get();
    assert.equal(schemaVersion.value, '3.31.0');

    const lastFrom = db.prepare("SELECT value FROM app_meta WHERE key = 'last_migration_from'").get();
    assert.equal(lastFrom.value, '3.29.0');

    const lastTo = db.prepare("SELECT value FROM app_meta WHERE key = 'last_migration_to'").get();
    assert.equal(lastTo.value, '3.31.0');

    const lastAt = db.prepare("SELECT value FROM app_meta WHERE key = 'last_migration_at'").get();
    assert.ok(lastAt, 'last_migration_at is recorded');
    db.close();
  });
});

test('migration infers schema_version from cash_balance column when missing', () => {
  withTempDb(({ dbPath, backupDir }) => {
    const db = openDatabase(dbPath);
    createOldSchema29(db);
    const ctx = buildCtx(db, dbPath, backupDir);
    migrations(ctx);
    const status = ctx.getMigrationStatus();
    assert.equal(status.currentSchemaVersion, '3.29.0');
    assert.ok(status.pending.length > 0, 'pending migrations detected');
    assert.ok(status.pending.some((m) => m.file === 'update-3.29.0-to-3.30.0.sql'));
    db.close();
  });
});

test('migration is idempotent when already up to date', () => {
  withTempDb(({ dbPath, backupDir }) => {
    const db = openDatabase(dbPath);
    createOldSchema29(db);
    db.prepare(
      "INSERT INTO app_meta (key, value) VALUES ('schema_version', '3.31.0')",
    ).run();
    const ctx = buildCtx(db, dbPath, backupDir);
    migrations(ctx);
    const result = ctx.runMigrations();
    assert.equal(result.migrated, false);
    assert.equal(result.reason, 'up-to-date');
    db.close();
  });
});

test('migration error stops and does not mark as migrated', () => {
  withTempDb(({ tempDir, dbPath, backupDir }) => {
    const db = openDatabase(dbPath);
    createOldSchema29(db);
    fs.mkdirSync(backupDir, { recursive: true });
    const ctx = buildCtx(db, dbPath, backupDir);
    ctx.config.repoRoot = path.join(tempDir, 'nonexistent-root');
    migrations(ctx);
    assert.throws(
      () => ctx.runMigrations(),
      /Migration SQL file not found/,
      'migration should throw when SQL file is missing',
    );
    db.close();
  });
});

test('auto-migrate is disabled by default in Docker mode', () => {
  withTempDb(({ dbPath, backupDir }) => {
    const db = openDatabase(dbPath);
    createOldSchema29(db);
    const ctx = buildCtx(db, dbPath, backupDir, { mode: 'docker' });
    migrations(ctx);
    const result = ctx.runMigrations();
    assert.equal(result.migrated, false);
    assert.equal(result.reason, 'disabled');
    assert.ok(result.pending.length > 0, 'pending migrations are listed for manual execution');
    db.close();
  });
});

test('auto-migrate can be enabled in Docker via env var', () => {
  withTempDb(({ dbPath, backupDir }) => {
    const db = openDatabase(dbPath);
    createOldSchema29(db);
    const ctx = buildCtx(db, dbPath, backupDir, { mode: 'docker' });
    process.env.VALORGRID_AUTO_MIGRATE = '1';
    try {
      migrations(ctx);
      const result = ctx.runMigrations();
      assert.equal(result.migrated, true);
      assert.equal(result.toVersion, '3.31.0');
    } finally {
      delete process.env.VALORGRID_AUTO_MIGRATE;
    }
    db.close();
  });
});

test('findPendingMigrations returns only migrations after current version', () => {
  const pending = migrations.findPendingMigrations('3.29.0');
  assert.ok(pending.length > 0);
  assert.ok(pending.every((m) => migrations.compareSemver(m.from, '3.29.0') >= 0));
  assert.ok(pending.some((m) => m.to === '3.30.0'));
  assert.ok(pending.some((m) => m.to === '3.31.0'));
});

test('update-3.30.0-to-3.31.0.sql exists in deploy/sql', () => {
  const sqlPath = path.join(sqlDir, 'update-3.30.0-to-3.31.0.sql');
  assert.ok(fs.existsSync(sqlPath), 'SQL migration file exists');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert.ok(sql.includes('schema_version'), 'SQL registers schema_version');
  assert.ok(sql.includes('3.31.0'), 'SQL targets version 3.31.0');
  assert.ok(sql.includes('corporate_actions'), 'SQL creates corporate_actions');
});

test('CURRENT_SCHEMA_VERSION matches the expected value', () => {
  assert.equal(migrations.CURRENT_SCHEMA_VERSION, '3.31.0');
});
