const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'metaKeys', 'defaultInstruments', 'defaultAutoPlans'], 'schema');

  const { db, metaKeys, defaultInstruments, defaultAutoPlans } = ctx;

  function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS instruments (
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

    CREATE TABLE IF NOT EXISTS instrument_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      show_in_distribution INTEGER NOT NULL DEFAULT 1,
      show_in_monthly INTEGER NOT NULL DEFAULT 1,
      is_expandable INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS instrument_identifiers (
      id TEXT PRIMARY KEY,
      instrument_symbol TEXT NOT NULL,
      provider TEXT NOT NULL,
      identifier_type TEXT NOT NULL,
      identifier_value TEXT NOT NULL,
      display_name TEXT,
      currency TEXT,
      exchange TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, identifier_type, identifier_value)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('add', 'remove')),
      symbol TEXT NOT NULL,
      name TEXT,
      date TEXT NOT NULL,
      market_date TEXT,
      shares REAL NOT NULL,
      value_eur REAL NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      fx_to_eur REAL NOT NULL,
      commission_eur REAL NOT NULL DEFAULT 0,
      cash_flow_eur REAL NOT NULL DEFAULT 0,
      color TEXT,
      origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'auto', 'import')),
      auto_key TEXT UNIQUE,
      import_batch_id TEXT,
      external_id TEXT,
      raw_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auto_plans (
      symbol TEXT PRIMARY KEY,
      amount_eur REAL NOT NULL,
      day INTEGER NOT NULL,
      enabled INTEGER NOT NULL,
      start_date TEXT,
      frequency TEXT NOT NULL DEFAULT 'monthly',
      weekday INTEGER
    );

    CREATE TABLE IF NOT EXISTS price_cache (
      yahoo_symbol TEXT NOT NULL,
      requested_date TEXT NOT NULL,
      market_date TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (yahoo_symbol, requested_date)
    );

    CREATE TABLE IF NOT EXISTS auto_plan_skips (
      auto_key TEXT PRIMARY KEY,
      skipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_price_cache (
      yahoo_symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (yahoo_symbol, date)
    );

    CREATE TABLE IF NOT EXISTS daily_price_cache_ranges (
      yahoo_symbol TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (yahoo_symbol, from_date, to_date)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS market_prices_daily (
      symbol TEXT NOT NULL,
      yahoo_symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (symbol, date)
    );

    CREATE TABLE IF NOT EXISTS fx_rates_daily (
      pair TEXT NOT NULL,
      date TEXT NOT NULL,
      rate REAL NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (pair, date)
    );

    CREATE TABLE IF NOT EXISTS portfolio_positions_daily (
      date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      shares REAL NOT NULL,
      price_eur REAL NOT NULL,
      value_eur REAL NOT NULL,
      data_quality TEXT NOT NULL DEFAULT 'ok',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (date, symbol)
    );

    CREATE TABLE IF NOT EXISTS portfolio_value_daily (
      date TEXT PRIMARY KEY,
      value_eur REAL NOT NULL,
      data_quality TEXT NOT NULL DEFAULT 'ok',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portfolio_value_weekly (
      week_start TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      value_eur REAL NOT NULL,
      data_quality TEXT NOT NULL DEFAULT 'ok',
      ledger_version INTEGER NOT NULL,
      price_version INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portfolio_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT,
      date TEXT NOT NULL,
      market_date TEXT,
      plot_date TEXT NOT NULL,
      shares REAL NOT NULL,
      value_eur REAL NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      origin TEXT NOT NULL,
      color TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history_builds (
      build_key TEXT PRIMARY KEY,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      ledger_version INTEGER NOT NULL,
      price_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS history_invalidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

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
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_symbol_date_created
      ON transactions (symbol, date, created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_date_created
      ON transactions (date, created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_origin_auto_key
      ON transactions (origin, auto_key);
    CREATE INDEX IF NOT EXISTS idx_instruments_type_active
      ON instruments (type, active);
    CREATE INDEX IF NOT EXISTS idx_instruments_group_active
      ON instruments (group_id, active);
    CREATE INDEX IF NOT EXISTS idx_instrument_identifiers_symbol
      ON instrument_identifiers (instrument_symbol);
    CREATE INDEX IF NOT EXISTS idx_instrument_identifiers_lookup
      ON instrument_identifiers (provider, identifier_type, identifier_value);
    CREATE INDEX IF NOT EXISTS idx_instrument_groups_order
      ON instrument_groups (display_order, active);
    CREATE INDEX IF NOT EXISTS idx_market_prices_symbol_date
      ON market_prices_daily (symbol, date);
    CREATE INDEX IF NOT EXISTS idx_fx_rates_pair_date
      ON fx_rates_daily (pair, date);
    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_symbol_date
      ON portfolio_positions_daily (symbol, date);
    CREATE INDEX IF NOT EXISTS idx_portfolio_value_date
      ON portfolio_value_daily (date);
    CREATE INDEX IF NOT EXISTS idx_portfolio_value_weekly_date
      ON portfolio_value_weekly (date);
    CREATE INDEX IF NOT EXISTS idx_portfolio_events_plot_date
      ON portfolio_events (plot_date, created_at);
    CREATE INDEX IF NOT EXISTS idx_history_invalidations_from_date
      ON history_invalidations (from_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_file_hash
      ON import_batches (source, file_hash);
    CREATE INDEX IF NOT EXISTS idx_import_rows_batch_index
      ON import_rows (batch_id, row_index);
    CREATE INDEX IF NOT EXISTS idx_import_rows_row_hash
      ON import_rows (row_hash);
    CREATE INDEX IF NOT EXISTS idx_transactions_import_batch
      ON transactions (import_batch_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_raw_hash_import
      ON transactions (raw_hash)
      WHERE raw_hash IS NOT NULL AND origin = 'import';
    CREATE INDEX IF NOT EXISTS idx_rollback_log_batch_id
      ON import_rollback_log (batch_id);
    CREATE INDEX IF NOT EXISTS idx_rollback_log_rolled_back_at
      ON import_rollback_log (rolled_back_at DESC);
  `);
  ensureMetaKey(metaKeys.ledgerVersion, 1);
  ensureMetaKey(metaKeys.priceVersion, 1);

  const instrumentInsert = db.prepare(`
    INSERT OR IGNORE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const instrument of defaultInstruments) {
    instrumentInsert.run(
      instrument.symbol,
      instrument.yahooSymbol,
      instrument.name,
      instrument.type,
      instrument.currency,
      instrument.color,
      instrument.baseShares,
      instrument.fallbackPrice,
    );
    db.prepare(
      `INSERT OR IGNORE INTO instrument_identifiers
        (id, instrument_symbol, provider, identifier_type, identifier_value, display_name, currency, exchange, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `ident:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
      instrument.symbol,
      'manual',
      'ticker',
      instrument.symbol,
      instrument.name,
      instrument.currency,
      null,
      null,
    );
    if (instrument.yahooSymbol) {
      db.prepare(
        `INSERT OR IGNORE INTO instrument_identifiers
          (id, instrument_symbol, provider, identifier_type, identifier_value, display_name, currency, exchange, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `ident:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
        instrument.symbol,
        'yahoo',
        'yahoo_symbol',
        String(instrument.yahooSymbol).toUpperCase(),
        instrument.name,
        instrument.currency,
        null,
        null,
      );
    }
  }

  const planCount = db.prepare('SELECT COUNT(*) AS count FROM auto_plans').get().count;
  if (planCount === 0) {
    const planInsert = db.prepare(
      'INSERT INTO auto_plans (symbol, amount_eur, day, enabled, start_date, frequency, weekday) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const plan of defaultAutoPlans) {
      planInsert.run(
        plan.symbol,
        plan.amountEur,
        plan.day,
        plan.enabled ? 1 : 0,
        plan.startDate || null,
        plan.frequency || 'monthly',
        plan.weekday || null,
      );
    }
  }
  }

  function ensureMetaKey(key, value) {
    db.prepare('INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)').run(key, String(value));
  }

  Object.assign(ctx, { initDatabase, ensureMetaKey });
};
