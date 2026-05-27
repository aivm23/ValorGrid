module.exports = function attach(ctx) {
  with (ctx) {
const migrations = [
  {
    id: '2026-05-22-import-batches',
    run() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS import_batches (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          filename TEXT,
          file_hash TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('previewed', 'committed', 'rolled_back', 'failed')),
          mapping_json TEXT NOT NULL DEFAULT '{}',
          summary_json TEXT NOT NULL DEFAULT '{}',
          row_count INTEGER NOT NULL DEFAULT 0,
          error_count INTEGER NOT NULL DEFAULT 0,
          first_date TEXT,
          last_date TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          committed_at TEXT,
          rolled_back_at TEXT
        );

        CREATE TABLE IF NOT EXISTS import_rows (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          row_index INTEGER NOT NULL,
          raw_json TEXT NOT NULL,
          normalized_json TEXT,
          status TEXT NOT NULL CHECK (status IN ('valid', 'error', 'duplicate', 'committed', 'rolled_back')),
          error TEXT,
          row_hash TEXT NOT NULL,
          transaction_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_file_hash
          ON import_batches (source, file_hash);
        CREATE INDEX IF NOT EXISTS idx_import_rows_batch_index
          ON import_rows (batch_id, row_index);
        CREATE INDEX IF NOT EXISTS idx_import_rows_row_hash
          ON import_rows (row_hash);
      `);
    },
  },
  {
    id: '2026-05-22-transaction-import-links',
    run() {
      addColumnIfMissingLocal('transactions', 'import_batch_id', 'TEXT');
      addColumnIfMissingLocal('transactions', 'external_id', 'TEXT');
      addColumnIfMissingLocal('transactions', 'raw_hash', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_transactions_import_batch
          ON transactions (import_batch_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_raw_hash_import
          ON transactions (raw_hash)
          WHERE raw_hash IS NOT NULL AND origin = 'import';
      `);
    },
  },
  {
    id: '2026-05-27-import-rollback-log',
    run() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS import_rollback_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id TEXT NOT NULL,
          source TEXT,
          filename TEXT,
          row_count INTEGER,
          error_count INTEGER,
          first_date TEXT,
          last_date TEXT,
          rolled_back_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_rollback_log_batch_id
          ON import_rollback_log (batch_id);
        CREATE INDEX IF NOT EXISTS idx_rollback_log_rolled_back_at
          ON import_rollback_log (rolled_back_at DESC);
      `);
    },
  },
  {
    id: '2026-05-22-legacy-history-tables',
    run() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS legacy_tables (
          name TEXT PRIMARY KEY,
          reason TEXT NOT NULL,
          marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      const mark = db.prepare('INSERT OR IGNORE INTO legacy_tables (name, reason) VALUES (?, ?)');
      mark.run('portfolio_history_cache', 'Legacy JSON cache superseded by materialized daily and weekly history tables');
      mark.run('portfolio_snapshots', 'Legacy range snapshots superseded by portfolio_positions_daily and portfolio_value_daily');
    },
  },
];

function addColumnIfMissingLocal(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrationApplied(id) {
  return Boolean(db.prepare('SELECT id FROM migrations WHERE id = ?').get(id));
}

function recordMigration(id) {
  db.prepare('INSERT OR IGNORE INTO migrations (id) VALUES (?)').run(id);
}

function runMigrations() {
  for (const migration of migrations) {
    if (migrationApplied(migration.id)) continue;
    db.exec('BEGIN');
    try {
      migration.run();
      recordMigration(migration.id);
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback errors; the original migration error is more useful.
      }
      throw error;
    }
  }
}

    Object.assign(ctx, { runMigrations });
  }
};
