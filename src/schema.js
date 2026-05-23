module.exports = function attach(ctx) { with (ctx) {
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
      usd_to_eur REAL NOT NULL,
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

    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS portfolio_history_cache (
      range TEXT PRIMARY KEY,
      granularity TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      data_json TEXT NOT NULL,
      ledger_version INTEGER NOT NULL,
      price_version INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      range TEXT NOT NULL,
      granularity TEXT NOT NULL,
      date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      shares REAL NOT NULL,
      price_eur REAL NOT NULL,
      value_eur REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (range, date, symbol)
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
  `);

  addColumnIfMissing('transactions', 'market_date', 'TEXT');
  addColumnIfMissing('transactions', 'origin', "TEXT NOT NULL DEFAULT 'manual'");
  addColumnIfMissing('transactions', 'commission_eur', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('transactions', 'cash_flow_eur', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('transactions', 'import_batch_id', 'TEXT');
  addColumnIfMissing('transactions', 'external_id', 'TEXT');
  addColumnIfMissing('transactions', 'raw_hash', 'TEXT');
  addColumnIfMissing('auto_plans', 'start_date', 'TEXT');
  addColumnIfMissing('auto_plans', 'frequency', "TEXT NOT NULL DEFAULT 'monthly'");
  addColumnIfMissing('auto_plans', 'weekday', 'INTEGER');
  addColumnIfMissing('instruments', 'group_id', 'TEXT');
  addColumnIfMissing('instruments', 'display_order', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('instruments', 'show_in_distribution', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('instruments', 'show_in_monthly', 'INTEGER NOT NULL DEFAULT 1');

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
    CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_range_date
      ON portfolio_snapshots (range, date);
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
  `);
  runMigrations();
  ensureTransactionsAllowImportOrigin();
  backfillTransactionCashFlows();
  db.prepare("UPDATE transactions SET origin = 'auto' WHERE auto_key IS NOT NULL").run();
  db.prepare('DELETE FROM daily_price_cache WHERE price <= 0').run();
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
  }

  migrateInstrumentGroups();
  backfillInstrumentIdentifiers();

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

function groupIdFromName(name) {
  return String(name || 'general')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general';
}

function ensureGroup(id, name, color, options = {}) {
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(
    id,
    name,
    color,
    Number(options.displayOrder || 0),
    options.showInDistribution === false ? 0 : 1,
    options.showInMonthly === false ? 0 : 1,
    options.isExpandable ? 1 : 0,
  );
}

function migrateInstrumentGroups() {
  const instruments = db.prepare("SELECT symbol, type, color, group_id FROM instruments WHERE type != 'fx'").all();
  if (!instruments.length) return;

  const hasGroups = db.prepare('SELECT COUNT(*) AS count FROM instrument_groups').get().count > 0;
  if (!hasGroups) {
    ensureGroup('etf', 'ETF', '#a855f7', { displayOrder: 10 });
    ensureGroup('stock', 'Acciones', '#16a34a', { displayOrder: 20, isExpandable: true });
    ensureGroup('general', 'General', '#64748b', { displayOrder: 90 });
  }

  const assign = db.prepare('UPDATE instruments SET group_id = ?, display_order = ? WHERE symbol = ? AND group_id IS NULL');
  for (const instrument of instruments) {
    let groupId = 'general';
    if (instrument.type === 'stock') groupId = hasGroups ? findFirstGroupId(['stock-picking', 'stock', 'general']) : 'stock';
    else if (instrument.type === 'etf') groupId = hasGroups ? findFirstGroupId(['core', 'etf', 'general']) : 'etf';
    assign.run(groupId, instruments.indexOf(instrument) + 1, instrument.symbol);
  }
}

function findFirstGroupId(ids) {
  for (const id of ids) {
    if (db.prepare('SELECT id FROM instrument_groups WHERE id = ?').get(id)) return id;
  }
  return 'general';
}

function nextIdentifierId() {
  return `ident:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function backfillInstrumentIdentifiers() {
  const instruments = db
    .prepare("SELECT symbol, yahoo_symbol, name, currency FROM instruments WHERE active = 1")
    .all();
  if (!instruments.length) return;
  const insertIdentifier = db.prepare(
    `INSERT OR IGNORE INTO instrument_identifiers
      (id, instrument_symbol, provider, identifier_type, identifier_value, display_name, currency, exchange, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const instrument of instruments) {
    insertIdentifier.run(
      nextIdentifierId(),
      instrument.symbol,
      'manual',
      'ticker',
      instrument.symbol,
      instrument.name,
      instrument.currency,
      null,
      null,
    );
    if (instrument.yahoo_symbol) {
      insertIdentifier.run(
        nextIdentifierId(),
        instrument.symbol,
        'yahoo',
        'yahoo_symbol',
        String(instrument.yahoo_symbol).toUpperCase(),
        instrument.name,
        instrument.currency,
        null,
        null,
      );
    }
  }
}

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureMetaKey(key, value) {
  db.prepare('INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)').run(key, String(value));
}

function ensureTransactionsAllowImportOrigin() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'").get();
  if (!table?.sql || table.sql.includes("'import'")) return;

  db.exec(`
    ALTER TABLE transactions RENAME TO transactions_old;
    CREATE TABLE transactions (
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
      usd_to_eur REAL NOT NULL,
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
    INSERT INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
       usd_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key, import_batch_id,
       external_id, raw_hash, created_at)
    SELECT id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
       usd_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key, import_batch_id,
       external_id, raw_hash, created_at
    FROM transactions_old;
    DROP TABLE transactions_old;
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_symbol_date_created
      ON transactions (symbol, date, created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_date_created
      ON transactions (date, created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_origin_auto_key
      ON transactions (origin, auto_key);
  `);
}

function backfillTransactionCashFlows() {
  db.prepare(
    `UPDATE transactions
     SET commission_eur = ABS(COALESCE(commission_eur, 0)),
         cash_flow_eur = CASE
           WHEN COALESCE(cash_flow_eur, 0) != 0 THEN cash_flow_eur
           WHEN type = 'remove' THEN value_eur - ABS(COALESCE(commission_eur, 0))
           ELSE -(value_eur + ABS(COALESCE(commission_eur, 0)))
         END`,
  ).run();
}

    Object.assign(ctx, { initDatabase, addColumnIfMissing, ensureMetaKey, ensureTransactionsAllowImportOrigin, backfillTransactionCashFlows, groupIdFromName, ensureGroup, migrateInstrumentGroups });
  }
};
