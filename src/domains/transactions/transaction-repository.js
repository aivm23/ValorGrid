const { assertCtxDeps } = require('../../ctx-utils');
const { withTransaction } = require('../../db');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'transaction-repository');

  const { db, repositories } = ctx;

  function listTransactions() {
    return db
      .prepare(
        `SELECT id, type, symbol, name, date, market_date AS marketDate, shares,
                value_eur AS valueEur, price, currency, fx_to_eur AS fxToEur,
                commission_eur AS commissionEur, cash_flow_eur AS cashFlowEur,
                color, origin, auto_key AS autoKey, import_batch_id AS importBatchId,
                external_id AS externalId, raw_hash AS rawHash, created_at AS createdAt
         FROM transactions
         ORDER BY date ASC, created_at ASC`,
      )
      .all();
  }

  function listAutoPlans() {
    return db
      .prepare(
        `SELECT symbol, amount_eur AS amountEur, day, enabled, start_date AS startDate,
                frequency, weekday
         FROM auto_plans
         ORDER BY symbol ASC`,
      )
      .all();
  }

  function replaceAutoPlansInStorage(plans) {
    withTransaction(db, () => {
      db.exec('DELETE FROM auto_plans');
      const insert = db.prepare(
        `INSERT INTO auto_plans
          (symbol, amount_eur, day, enabled, start_date, frequency, weekday)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const plan of plans) {
        insert.run(
          plan.symbol,
          plan.amountEur,
          plan.frequency === 'monthly' ? plan.day : 1,
          plan.enabled ? 1 : 0,
          plan.startDate || null,
          plan.frequency,
          plan.weekday || null,
        );
      }
    });
  }

  function transactionExistsByAutoKey(autoKey) {
    return Boolean(db.prepare('SELECT 1 FROM transactions WHERE auto_key = ?').get(autoKey));
  }

  function listTransactionSharesForSymbol(symbol, asOfDate = null) {
    return asOfDate
      ? db.prepare('SELECT type, shares FROM transactions WHERE symbol = ? AND date <= ?').all(symbol, asOfDate)
      : db.prepare('SELECT type, shares FROM transactions WHERE symbol = ?').all(symbol);
  }

  function listStockColors() {
    return db
      .prepare("SELECT color FROM instruments WHERE type = 'stock'")
      .all()
      .map((item) => item.color);
  }

  function insertTransactionRow(row) {
    db.prepare(
      `INSERT INTO transactions
        (id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
          fx_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      row.type,
      row.symbol,
      row.name,
      row.date,
      row.marketDate,
      row.shares,
      row.valueEur,
      row.price,
      row.currency,
      row.fxToEur,
      row.commissionEur,
      row.cashFlowEur,
      row.color,
      row.origin,
      row.autoKey,
    );
  }

  function findTransactionForDelete(id) {
    return db.prepare('SELECT auto_key AS autoKey, date FROM transactions WHERE id = ?').get(id);
  }

  function deleteTransactionById(id) {
    return db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  }

  function insertAutoPlanSkip(autoKey) {
    db.prepare('INSERT OR IGNORE INTO auto_plan_skips (auto_key) VALUES (?)').run(autoKey);
  }

  function autoPlanSkipExists(autoKey) {
    return Boolean(db.prepare('SELECT auto_key FROM auto_plan_skips WHERE auto_key = ?').get(autoKey));
  }

  repositories.transactions = {
    ...(repositories.transactions || {}),
    listTransactions,
    listAutoPlans,
    replaceAutoPlansInStorage,
    transactionExistsByAutoKey,
    listTransactionSharesForSymbol,
    listStockColors,
    insertTransactionRow,
    findTransactionForDelete,
    deleteTransactionById,
    insertAutoPlanSkip,
    autoPlanSkipExists,
  };
};
