const fs = require('node:fs');
const path = require('node:path');
const backups = require('./backups');
const { withTransaction } = require('./db');

const CURRENT_SCHEMA_VERSION = '3.32.0';
const SCHEMA_VERSION_KEY = 'schema_version';
const LAST_MIGRATION_AT_KEY = 'last_migration_at';
const LAST_MIGRATION_FROM_KEY = 'last_migration_from';
const LAST_MIGRATION_TO_KEY = 'last_migration_to';

const MIGRATIONS = [
  { from: '3.15.0', to: '3.16.0', file: 'update-3.15.0-to-3.16.0.sql' },
  { from: '3.16.0', to: '3.17.0', file: 'update-3.16.0-to-3.17.0.sql' },
  { from: '3.17.0', to: '3.18.0', file: 'update-3.17.0-to-3.18.0.sql' },
  { from: '3.20.0', to: '3.21.0', file: 'update-3.20.0-to-3.21.0.sql' },
  { from: '3.26.1', to: '3.27.0', file: 'update-3.26.1-to-3.27.0.sql' },
  { from: '3.28.12', to: '3.28.13', file: 'update-3.28.12-to-3.28.13.sql' },
  { from: '3.29.0', to: '3.30.0', file: 'update-3.29.0-to-3.30.0.sql' },
  { from: '3.30.0', to: '3.31.0', file: 'update-3.30.0-to-3.31.0.sql' },
  { from: '3.31.4', to: '3.32.0', file: 'update-3.31.4-to-3.32.0.sql' },
];

function compareSemver(a, b) {
  const parse = (v) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  };
  const [aM, am, ap] = parse(a);
  const [bM, bm, bp] = parse(b);
  if (aM !== bM) return aM - bM;
  if (am !== bm) return am - bm;
  return ap - bp;
}

function tableExists(db, table) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return Boolean(row);
}

function columnExists(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function inferSchemaVersion(db) {
  if (columnExists(db, 'transactions', 'note')) return '3.32.0';
  if (tableExists(db, 'corporate_actions')) return '3.31.0';
  if (columnExists(db, 'instruments', 'cash_balance')) return '3.29.0';
  if (tableExists(db, 'dividend_events')) return '3.27.0';
  if (tableExists(db, 'instrument_identifiers')) return '3.21.0';
  if (tableExists(db, 'instrument_groups')) return '3.16.0';
  return null;
}

function getMetaValue(db, key) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row?.value;
}

function setMetaValue(db, key, value) {
  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
  ).run(key, String(value));
}

function findPendingMigrations(currentVersion) {
  return MIGRATIONS.filter(
    (m) => compareSemver(m.from, currentVersion) >= 0 && compareSemver(m.to, CURRENT_SCHEMA_VERSION) <= 0,
  ).sort((a, b) => compareSemver(a.from, b.from));
}

function runIntegrityCheck(db) {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity && integrity.integrity_check !== 'ok') {
    throw new Error(`integrity_check failed: ${integrity.integrity_check}`);
  }
  const fkErrors = db.prepare('PRAGMA foreign_key_check').all();
  if (fkErrors.length > 0) {
    throw new Error(`foreign_key_check found ${fkErrors.length} violation(s)`);
  }
}

function isAutoMigrateEnabled(ctx) {
  const envFlag = process.env.VALORGRID_AUTO_MIGRATE;
  if (envFlag === '1') return true;
  if (envFlag === '0') return false;
  const mode = String(ctx.config?.runtime?.mode || process.env.VALORGRID_RUNTIME_MODE || 'server').toLowerCase();
  if (mode === 'docker') return false;
  return true;
}

function attach(ctx) {
  assertCtx(ctx);

  function getSchemaVersion() {
    const { db } = ctx;
    if (!tableExists(db, 'app_meta')) return null;
    return getMetaValue(db, SCHEMA_VERSION_KEY) || null;
  }

  function getMigrationStatus() {
    const { db } = ctx;
    if (!tableExists(db, 'app_meta')) {
      return { currentSchemaVersion: null, targetSchemaVersion: CURRENT_SCHEMA_VERSION, pending: [], empty: true };
    }
    let current = getMetaValue(db, SCHEMA_VERSION_KEY);
    if (!current) {
      const inferred = inferSchemaVersion(db);
      if (!inferred) {
        return {
          currentSchemaVersion: null,
          targetSchemaVersion: CURRENT_SCHEMA_VERSION,
          pending: [],
          canInfer: false,
        };
      }
      current = inferred;
    }
    const inferred = inferSchemaVersion(db);
    const metadataReconciliationRequired = Boolean(inferred && compareSemver(inferred, current) > 0);
    if (metadataReconciliationRequired) current = inferred;
    const pending = findPendingMigrations(current);
    return {
      currentSchemaVersion: current,
      targetSchemaVersion: CURRENT_SCHEMA_VERSION,
      metadataReconciliationRequired,
      pending: pending.map((m) => ({ from: m.from, to: m.to, file: m.file })),
    };
  }

  function runMigrations() {
    const { db, dbPath, config, logger } = ctx;
    const repoRoot = config?.repoRoot || config?.root || ctx.repoRoot;
    const backupDir = ctx.backupDir || config?.backupDir;
    const sqlDir = path.join(repoRoot, 'deploy', 'sql');

    if (!tableExists(db, 'app_meta')) {
      logger?.info?.('db-migrations: fresh database, skipping migrations');
      return { migrated: false, reason: 'empty', targetSchemaVersion: CURRENT_SCHEMA_VERSION };
    }

    let currentVersion = getMetaValue(db, SCHEMA_VERSION_KEY);
    if (!currentVersion) {
      const inferred = inferSchemaVersion(db);
      if (!inferred) {
        const error = new Error(
          'No se pudo determinar la versión del schema de la base de datos existente. ' +
            'Crea un backup y ejecuta las migraciones manualmente con scripts/run-sql-migration.',
        );
        error.code = 'SCHEMA_VERSION_UNKNOWN';
        throw error;
      }
      currentVersion = inferred;
      logger?.warn?.(`db-migrations: schema_version missing, inferred ${inferred}`);
    }

    const inferredVersion = inferSchemaVersion(db);
    if (inferredVersion && compareSemver(inferredVersion, currentVersion) > 0) {
      if (compareSemver(inferredVersion, CURRENT_SCHEMA_VERSION) > 0) {
        const error = new Error(
          `El schema fisico (${inferredVersion}) es posterior a la version soportada (${CURRENT_SCHEMA_VERSION}).`,
        );
        error.code = 'SCHEMA_VERSION_AHEAD';
        throw error;
      }
      const backup = backups.createBackup({ db, dbPath, root: repoRoot, backupDir });
      runIntegrityCheck(db);
      const now = new Date().toISOString();
      withTransaction(db, () => {
        setMetaValue(db, SCHEMA_VERSION_KEY, inferredVersion);
        setMetaValue(db, LAST_MIGRATION_AT_KEY, now);
        setMetaValue(db, LAST_MIGRATION_FROM_KEY, currentVersion);
        setMetaValue(db, LAST_MIGRATION_TO_KEY, inferredVersion);
      });
      logger?.warn?.(`db-migrations: reconciled metadata ${currentVersion} -> ${inferredVersion}`);
      return {
        migrated: false,
        reconciled: true,
        reason: 'metadata-reconciled',
        fromVersion: currentVersion,
        toVersion: inferredVersion,
        backupPath: backup.path,
      };
    }

    const pending = findPendingMigrations(currentVersion);
    if (pending.length === 0) {
      setMetaValue(db, SCHEMA_VERSION_KEY, currentVersion);
      return { migrated: false, reason: 'up-to-date', currentSchemaVersion: currentVersion };
    }

    const autoMigrate = isAutoMigrateEnabled(ctx);
    if (!autoMigrate) {
      logger?.warn?.('db-migrations: auto-migrate disabled, showing pending migrations only');
      return {
        migrated: false,
        reason: 'disabled',
        currentSchemaVersion: currentVersion,
        targetSchemaVersion: CURRENT_SCHEMA_VERSION,
        pending: pending.map((m) => ({ from: m.from, to: m.to, file: m.file })),
      };
    }

    const backup = backups.createBackup({ db, dbPath, root: repoRoot, backupDir });
    logger?.info?.(`db-migrations: backup created at ${backup.path}`);

    const applied = [];
    const fromVersion = currentVersion;
    try {
      for (const migration of pending) {
        const sqlPath = path.join(sqlDir, migration.file);
        if (!fs.existsSync(sqlPath)) {
          throw new Error(`Migration SQL file not found: ${migration.file}`);
        }
        const sql = fs.readFileSync(sqlPath, 'utf8');
        logger?.info?.(`db-migrations: applying ${migration.from} -> ${migration.to} (${migration.file})`);
        db.exec(sql);
        applied.push({ from: migration.from, to: migration.to, file: migration.file });
        setMetaValue(db, SCHEMA_VERSION_KEY, migration.to);
      }

      runIntegrityCheck(db);

      const now = new Date().toISOString();
      withTransaction(db, () => {
        setMetaValue(db, SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
        setMetaValue(db, LAST_MIGRATION_AT_KEY, now);
        setMetaValue(db, LAST_MIGRATION_FROM_KEY, fromVersion);
        setMetaValue(db, LAST_MIGRATION_TO_KEY, CURRENT_SCHEMA_VERSION);
      });

      logger?.info?.(
        `db-migrations: migrated ${fromVersion} -> ${CURRENT_SCHEMA_VERSION}, ${applied.length} migration(s) applied`,
      );
      return {
        migrated: true,
        fromVersion,
        toVersion: CURRENT_SCHEMA_VERSION,
        applied,
        backupPath: backup.path,
      };
    } catch (error) {
      error.message = `db-migrations: migration failed at ${fromVersion} -> ${CURRENT_SCHEMA_VERSION}: ${error.message}`;
      error.backupPath = backup?.path;
      error.fromVersion = fromVersion;
      error.toVersion = CURRENT_SCHEMA_VERSION;
      error.dbPath = dbPath;
      throw error;
    }
  }

  Object.assign(ctx, {
    runMigrations,
    getMigrationStatus,
    getSchemaVersion,
    CURRENT_SCHEMA_VERSION,
  });
}

function assertCtx(ctx) {
  if (!ctx) throw new Error('db-migrations requires ctx');
  if (!ctx.db) throw new Error('db-migrations requires ctx.db');
  if (!ctx.config) throw new Error('db-migrations requires ctx.config');
}

module.exports = attach;
module.exports.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
module.exports.MIGRATIONS = MIGRATIONS;
module.exports.compareSemver = compareSemver;
module.exports.findPendingMigrations = findPendingMigrations;
module.exports.inferSchemaVersion = inferSchemaVersion;
module.exports.isAutoMigrateEnabled = isAutoMigrateEnabled;
