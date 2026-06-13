const fs = require('node:fs');
const path = require('node:path');
const { createConfig } = require('../apps/server/src/platform/config');
const attachSchema = require('../apps/server/src/schema');

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function resolveRuntimeConfig(env = process.env, root = repoRoot()) {
  return createConfig(env, root);
}

function withDatabase(dbPath, work) {
  const { openDatabase } = require('../apps/server/src/platform/db');
  const db = openDatabase(dbPath);
  try {
    return work(db);
  } finally {
    db.close();
  }
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

function initializeFreshSchema(dbPath) {
  return withDatabase(dbPath, (db) => {
    const ctx = {
      db,
      metaKeys: { ledgerVersion: 'ledger_version', priceVersion: 'price_version' },
      defaultInstruments: [
        { symbol: 'USDEUR', yahooSymbol: 'USDEUR=X', name: 'USD/EUR', type: 'fx', currency: 'EUR', color: '#64748b', baseShares: 0, fallbackPrice: 0.92 },
      ],
      defaultAutoPlans: [],
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
    const missingMetaKeys = ['ledger_version', 'price_version'].filter(
      (key) => !metaMap.has(key),
    );

    const pageCount = db.prepare('PRAGMA page_count').get().page_count;
    const pageSize = db.prepare('PRAGMA page_size').get().page_size;

    return {
      expectedTables,
      presentTables,
      missingTables,
      missingMetaKeys,
      meta: {
        ledgerVersion: metaMap.get('ledger_version') || null,
        priceVersion: metaMap.get('price_version') || null,
      },
      pageCount,
      pageSize,
      bytes: pageCount * pageSize,
      journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode,
    };
  });
}

function run() {
  const root = repoRoot();
  const config = resolveRuntimeConfig(process.env, root);
  const { dbPath } = config;

  const normalized = path.resolve(dbPath);
  if (path.extname(normalized).toLowerCase() !== '.sqlite') {
    throw new Error(`Refusing reset for non-sqlite target: ${normalized}`);
  }

  const rootNormalized = path.resolve(root);
  const legacy = path.join(rootNormalized, 'portfolio.sqlite');
  const fresh = path.join(rootNormalized, 'data', 'portfolio.sqlite');
  const fromEnv = Boolean(process.env.PORTFOLIO_DB_PATH);
  if (!fromEnv && normalized !== legacy && normalized !== fresh) {
    throw new Error(`Refusing reset outside managed default targets: ${normalized}`);
  }

  const removedArtifacts = [];
  for (const target of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      removedArtifacts.push(target);
    }
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  initializeFreshSchema(dbPath);
  const verification = inspectDatabase(dbPath);

  if (verification.missingTables.length || verification.missingMetaKeys.length) {
    throw new Error(
      `Fresh reset verification failed (missing tables: ${verification.missingTables.join(', ') || 'none'}, missing meta keys: ${
        verification.missingMetaKeys.join(', ') || 'none'
      })`,
    );
  }

  process.stdout.write(
    JSON.stringify(
      {
        dbPath,
        removedArtifacts,
        verification: {
          missingTables: verification.missingTables,
          missingMetaKeys: verification.missingMetaKeys,
          tables: verification.presentTables.length,
          bytes: verification.bytes,
        },
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  run();
} catch (error) {
  console.error(`DB reset failed: ${error.message}`);
  process.exit(1);
}
