const fs = require('node:fs');
const path = require('node:path');
const { createConfig } = require('../src/platform/config');

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function resolveRuntimeConfig(env = process.env, root = repoRoot()) {
  return createConfig(env, root);
}

function withDatabase(dbPath, work) {
  const { openDatabase } = require('../src/platform/db');
  const db = openDatabase(dbPath);
  try {
    return work(db);
  } finally {
    db.close();
  }
}

function parseSchemaTableNames(schemaSource) {
  const source =
    schemaSource || fs.readFileSync(path.join(repoRoot(), 'src', 'schema.js'), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/\bCREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

function statusLabel(status) {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'WARN';
  return 'FAIL';
}

function run() {
  const root = repoRoot();
  const config = resolveRuntimeConfig(process.env, root);
  const { dbPath } = config;

  const checks = [];
  const addCheck = (status, id, message, details = null) => {
    checks.push({ status, id, message, details });
  };

  addCheck('ok', 'active-db-path', `Active database path: ${dbPath}`);

  const artifacts = { dbPath, walPath: `${dbPath}-wal`, shmPath: `${dbPath}-shm` };
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
      const inspection = withDatabase(artifacts.dbPath, (db) => {
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
        const missingMetaKeys = ['ledger_version', 'price_version'].filter(
          (key) => !metaMap.has(key),
        );
        return { missingTables, missingMetaKeys, presentTables };
      });

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
          'app_meta keys present (ledger_version and price_version).',
        );
      }
    } catch (error) {
      addCheck('fail', 'db-open-error', 'Failed to inspect database.', error.message);
    }
  }

  const summary = {
    ok: checks.filter((check) => check.status === 'ok').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
  };

  for (const check of checks) {
    const line = `[${statusLabel(check.status)}] ${check.message}`;
    if (check.details) {
      process.stdout.write(`${line}\n${JSON.stringify(check.details, null, 2)}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
  process.stdout.write(
    `Summary: ${summary.ok} OK, ${summary.warn} WARN, ${summary.fail} FAIL\n`,
  );
  process.stdout.write(`${JSON.stringify({ dbPath }, null, 2)}\n`);
  if (summary.fail > 0) {
    process.exit(1);
  }
}

try {
  run();
} catch (error) {
  console.error(`DB doctor failed: ${error.message}`);
  process.exit(1);
}
