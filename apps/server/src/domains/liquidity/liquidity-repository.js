const { assertCtxDeps } = require('../../platform/ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'liquidity-repository');

  const { db, repositories } = ctx;
  const liquidityGroupId = 'liquidez';

  function rowToGroup(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      displayOrder: row.displayOrder,
      showInDistribution: Boolean(row.showInDistribution),
      showInMonthly: Boolean(row.showInMonthly),
      isExpandable: Boolean(row.isExpandable),
      active: Boolean(row.active),
    };
  }

  function rowToAccount(row) {
    if (!row) return null;
    return {
      symbol: row.symbol,
      yahooSymbol: row.yahooSymbol,
      name: row.name,
      type: row.type,
      currency: row.currency,
      color: row.color,
      cashBalance: Number(row.cashBalance || 0),
      cashBalanceUpdatedAt: row.cashBalanceUpdatedAt,
      groupId: row.groupId,
      displayOrder: row.displayOrder,
      showInDistribution: Boolean(row.showInDistribution),
      showInMonthly: Boolean(row.showInMonthly),
      active: Boolean(row.active),
    };
  }

  function findLiquidityGroup() {
    return rowToGroup(
      db
        .prepare(
          `SELECT id, name, color, display_order AS displayOrder,
                  show_in_distribution AS showInDistribution,
                  show_in_monthly AS showInMonthly,
                  is_expandable AS isExpandable,
                  active
           FROM instrument_groups
           WHERE id = ?`,
        )
        .get(liquidityGroupId),
    );
  }

  function ensureLiquidityGroup() {
    db.prepare(
      `INSERT OR IGNORE INTO instrument_groups
        (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
       VALUES (?, 'Liquidez', '#06b6d4', 95, 1, 0, 0, 1)`,
    ).run(liquidityGroupId);
    db.prepare(
      `UPDATE instrument_groups
       SET active = 1, show_in_distribution = 1, show_in_monthly = 0
       WHERE id = ?`,
    ).run(liquidityGroupId);
    return findLiquidityGroup();
  }

  function listLiquidityAccounts() {
    return db
      .prepare(
        `SELECT symbol, yahoo_symbol AS yahooSymbol, name, type, currency, color,
                cash_balance AS cashBalance, cash_balance_updated_at AS cashBalanceUpdatedAt,
                group_id AS groupId, display_order AS displayOrder,
                show_in_distribution AS showInDistribution, show_in_monthly AS showInMonthly,
                active
         FROM instruments
         WHERE active = 1 AND type = 'cash'
         ORDER BY display_order ASC, name ASC`,
      )
      .all()
      .map(rowToAccount);
  }

  function findLiquidityAccount(symbol) {
    return rowToAccount(
      db
        .prepare(
          `SELECT symbol, yahoo_symbol AS yahooSymbol, name, type, currency, color,
                  cash_balance AS cashBalance, cash_balance_updated_at AS cashBalanceUpdatedAt,
                  group_id AS groupId, display_order AS displayOrder,
                  show_in_distribution AS showInDistribution, show_in_monthly AS showInMonthly,
                  active
           FROM instruments
           WHERE symbol = ? AND type = 'cash'`,
        )
        .get(symbol),
    );
  }

  function symbolExists(symbol) {
    return Boolean(db.prepare('SELECT symbol FROM instruments WHERE symbol = ?').get(symbol));
  }

  function countLiquidityAccounts() {
    return db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE type = 'cash' AND active = 1").get().count;
  }

  function insertLiquidityAccount(account) {
    db.prepare(
      `INSERT INTO instruments
        (symbol, yahoo_symbol, name, type, currency, color, base_shares, cash_balance,
         cash_balance_updated_at, fallback_price, active, group_id, display_order,
         show_in_distribution, show_in_monthly)
       VALUES (?, ?, ?, 'cash', ?, ?, 0, ?, CURRENT_TIMESTAMP, 0, 1, ?, ?, ?, 0)`,
    ).run(
      account.symbol,
      account.symbol,
      account.name,
      account.currency,
      account.color,
      account.cashBalance,
      liquidityGroupId,
      account.displayOrder,
      account.showInDistribution ? 1 : 0,
    );
    return findLiquidityAccount(account.symbol);
  }

  function updateLiquidityAccount(symbol, next) {
    db.prepare(
      `UPDATE instruments
       SET name = ?, currency = ?, color = ?, cash_balance = ?, cash_balance_updated_at = CURRENT_TIMESTAMP,
           group_id = ?, display_order = ?, show_in_distribution = ?, show_in_monthly = 0, active = 1
       WHERE symbol = ? AND type = 'cash'`,
    ).run(
      next.name,
      next.currency,
      next.color,
      next.cashBalance,
      liquidityGroupId,
      next.displayOrder,
      next.showInDistribution ? 1 : 0,
      symbol,
    );
    return findLiquidityAccount(symbol);
  }

  function deactivateLiquidityAccount(symbol) {
    return db
      .prepare(
        `UPDATE instruments
         SET active = 0, cash_balance = 0, cash_balance_updated_at = CURRENT_TIMESTAMP,
             show_in_distribution = 0, show_in_monthly = 0
         WHERE symbol = ? AND type = 'cash'`,
      )
      .run(symbol).changes;
  }

  repositories.liquidity = {
    ...(repositories.liquidity || {}),
    liquidityGroupId,
    findLiquidityGroup,
    ensureLiquidityGroup,
    listLiquidityAccounts,
    findLiquidityAccount,
    symbolExists,
    countLiquidityAccounts,
    insertLiquidityAccount,
    updateLiquidityAccount,
    deactivateLiquidityAccount,
  };
};
