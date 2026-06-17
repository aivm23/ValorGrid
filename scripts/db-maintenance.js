const fs = require('node:fs');
const path = require('node:path');
const { createConfig } = require('../apps/server/src/platform/config');
const { openDatabase } = require('../apps/server/src/platform/db');
const { createBackup, listBackups } = require('../apps/server/src/platform/backups');
const attachSchema = require('../apps/server/src/schema');

const DEFAULT_META_KEYS = {
  ledgerVersion: 'ledger_version',
  priceVersion: 'price_version',
};

const DEFAULT_INSTRUMENTS = [
  {
    symbol: 'USDEUR',
    yahooSymbol: 'USDEUR=X',
    name: 'USD/EUR',
    type: 'fx',
    currency: 'EUR',
    color: '#64748b',
    baseShares: 0,
    fallbackPrice: 0.92,
  },
];

const DEFAULT_AUTO_PLANS = [];

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function resolveRuntimeConfig(env = process.env, root = repoRoot()) {
  return createConfig(env, root);
}

function resolveDatabaseArtifacts(dbPath) {
  return {
    dbPath,
    walPath: `${dbPath}-wal`,
    shmPath: `${dbPath}-shm`,
  };
}

function parseSchemaTableNames(schemaSource) {
  const source =
    schemaSource || fs.readFileSync(path.join(repoRoot(), 'apps', 'server', 'src', 'schema.js'), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/\bCREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

function assertResetPathSafety(dbPath, { root, env }) {
  const normalized = path.resolve(dbPath);
  if (path.extname(normalized).toLowerCase() !== '.sqlite') {
    throw new Error(`Refusing reset for non-sqlite target: ${normalized}`);
  }
  const rootNormalized = path.resolve(root);
  const legacy = path.join(rootNormalized, 'portfolio.sqlite');
  const fresh = path.join(rootNormalized, 'data', 'portfolio.sqlite');
  const fromEnv = Boolean(env.PORTFOLIO_DB_PATH);
  if (!fromEnv && normalized !== legacy && normalized !== fresh) {
    throw new Error(`Refusing reset outside managed default targets: ${normalized}`);
  }
}

function withDatabase(dbPath, work) {
  const db = openDatabase(dbPath);
  try {
    return work(db);
  } finally {
    db.close();
  }
}

function createBackupForPath({ dbPath, root, backupDir }) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }
  return withDatabase(dbPath, (db) => createBackup({ db, dbPath, root, backupDir }));
}

function removeDatabaseArtifacts(dbPath) {
  const { dbPath: main, walPath, shmPath } = resolveDatabaseArtifacts(dbPath);
  const removed = [];
  const missing = [];
  for (const target of [main, walPath, shmPath]) {
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      removed.push(target);
    } else {
      missing.push(target);
    }
  }
  return { removed, missing };
}

function initializeFreshSchema(dbPath) {
  return withDatabase(dbPath, (db) => {
    const ctx = {
      db,
      metaKeys: DEFAULT_META_KEYS,
      defaultInstruments: DEFAULT_INSTRUMENTS,
      defaultAutoPlans: DEFAULT_AUTO_PLANS,
    };
    attachSchema(ctx);
    ctx.initDatabase();
  });
}

function inspectDatabase(dbPath) {
  return withDatabase(dbPath, (db) => {
    const expectedTables = parseSchemaTableNames();
    const presentTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name)
      .sort();
    const missingTables = expectedTables.filter((name) => !presentTables.includes(name));
    const metaRows = presentTables.includes('app_meta')
      ? db
          .prepare(
            "SELECT key, value FROM app_meta WHERE key IN ('ledger_version', 'price_version') ORDER BY key",
          )
          .all()
      : [];
    const metaMap = new Map(metaRows.map((row) => [row.key, row.value]));
    const missingMetaKeys = [DEFAULT_META_KEYS.ledgerVersion, DEFAULT_META_KEYS.priceVersion].filter(
      (key) => !metaMap.has(key),
    );

    const pageCount = db.prepare('PRAGMA page_count').get().page_count;
    const pageSize = db.prepare('PRAGMA page_size').get().page_size;
    const journalMode = db.prepare('PRAGMA journal_mode').get().journal_mode;

    return {
      expectedTables,
      presentTables,
      missingTables,
      missingMetaKeys,
      meta: {
        ledgerVersion: metaMap.get(DEFAULT_META_KEYS.ledgerVersion) || null,
        priceVersion: metaMap.get(DEFAULT_META_KEYS.priceVersion) || null,
      },
      pageCount,
      pageSize,
      bytes: pageCount * pageSize,
      journalMode,
    };
  });
}

function resetDatabase({ env = process.env, root = repoRoot() } = {}) {
  const config = resolveRuntimeConfig(env, root);
  const { dbPath, backupDir } = config;
  assertResetPathSafety(dbPath, { root, env });
  const backup = fs.existsSync(dbPath) ? createBackupForPath({ dbPath, root, backupDir }) : null;
  const removedArtifacts = removeDatabaseArtifacts(dbPath);
  initializeFreshSchema(dbPath);
  const verification = inspectDatabase(dbPath);
  if (verification.missingTables.length || verification.missingMetaKeys.length) {
    throw new Error(
      `Fresh reset verification failed (missing tables: ${verification.missingTables.join(', ') || 'none'}, missing meta keys: ${
        verification.missingMetaKeys.join(', ') || 'none'
      })`,
    );
  }
  return {
    dbPath,
    backup,
    removedArtifacts,
    verification,
  };
}

function collectDoctorReport({ env = process.env, root = repoRoot() } = {}) {
  const config = resolveRuntimeConfig(env, root);
  const { dbPath, backupDir } = config;
  const checks = [];
  const addCheck = (status, id, message, details = null) => {
    checks.push({ status, id, message, details });
  };

  addCheck('ok', 'active-db-path', `Active database path: ${dbPath}`);

  const artifacts = resolveDatabaseArtifacts(dbPath);
  if (!fs.existsSync(artifacts.dbPath)) {
    addCheck('fail', 'db-file-missing', `Database file is missing: ${artifacts.dbPath}`);
  } else {
    addCheck('ok', 'db-file-exists', `Database file exists: ${artifacts.dbPath}`);
    try {
      fs.accessSync(artifacts.dbPath, fs.constants.R_OK | fs.constants.W_OK);
      addCheck('ok', 'db-file-permissions', 'Database file is readable and writable.');
    } catch (error) {
      addCheck('fail', 'db-file-permissions', 'Database file is not writable/readable.', error.message);
    }
  }

  if (fs.existsSync(artifacts.walPath)) {
    addCheck('warn', 'wal-present', `WAL sidecar present: ${artifacts.walPath}`);
  } else {
    addCheck('ok', 'wal-absent', 'No WAL sidecar file detected.');
  }

  if (fs.existsSync(artifacts.shmPath)) {
    addCheck('warn', 'shm-present', `SHM sidecar present: ${artifacts.shmPath}`);
  } else {
    addCheck('ok', 'shm-absent', 'No SHM sidecar file detected.');
  }

  if (fs.existsSync(artifacts.dbPath)) {
    try {
      const inspection = inspectDatabase(artifacts.dbPath);
      if (inspection.missingTables.length) {
        addCheck(
          'fail',
          'schema-missing-tables',
          'Schema mismatch: required tables are missing.',
          inspection.missingTables,
        );
      } else {
        addCheck('ok', 'schema-tables', `Schema tables verified (${inspection.presentTables.length}).`);
      }

      if (inspection.missingMetaKeys.length) {
        addCheck(
          'fail',
          'meta-keys-missing',
          'Missing app_meta keys required for history invalidation.',
          inspection.missingMetaKeys,
        );
      } else {
        addCheck(
          'ok',
          'meta-keys',
          `app_meta keys present (ledger_version=${inspection.meta.ledgerVersion}, price_version=${inspection.meta.priceVersion}).`,
        );
      }
    } catch (error) {
      addCheck('fail', 'db-open-error', 'Failed to inspect database.', error.message);
    }
  }

  const backups = listBackups(root, backupDir);
  if (!backups.length) {
    addCheck('warn', 'no-backups', `No backups found in ${backupDir}.`);
  } else {
    addCheck('ok', 'backups', `Backups available: ${backups.length}.`);
  }

  const rootPrivateSqlite = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.sqlite(?:-wal|-shm)?$/i.test(name));
  const allowedRootSqlite = new Set([
    'portfolio.sqlite',
    ['portfolio.sqlite', 'wal'].join('-'),
    ['portfolio.sqlite', 'shm'].join('-'),
    'portfolio.loadtest.sqlite',
    ['portfolio.loadtest.sqlite', 'wal'].join('-'),
    ['portfolio.loadtest.sqlite', 'shm'].join('-'),
  ]);
  const unexpectedRootSqlite = rootPrivateSqlite.filter((name) => !allowedRootSqlite.has(name));
  if (unexpectedRootSqlite.length) {
    addCheck(
      'warn',
      'root-private-artifacts',
      'Unexpected SQLite artifacts found at repository root.',
      unexpectedRootSqlite,
    );
  } else {
    addCheck('ok', 'root-private-artifacts', 'No unexpected SQLite artifacts at repository root.');
  }

  if (fs.existsSync(path.join(root, 'portfolio.loadtest.sqlite'))) {
    addCheck(
      'warn',
      'demo-dataset-present',
      'Demo/loadtest SQLite file exists at repository root. Keep it out of commits.',
    );
  }

  const summary = {
    ok: checks.filter((check) => check.status === 'ok').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
  };

  return {
    root,
    dbPath,
    backupDir,
    backupsCount: backups.length,
    checks,
    summary,
  };
}

module.exports = {
  repoRoot,
  resolveRuntimeConfig,
  resolveDatabaseArtifacts,
  parseSchemaTableNames,
  createBackupForPath,
  removeDatabaseArtifacts,
  initializeFreshSchema,
  inspectDatabase,
  resetDatabase,
  collectDoctorReport,
};
