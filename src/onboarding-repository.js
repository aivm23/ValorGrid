const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'onboarding-repository');

  const { db, repositories } = ctx;

  function instrumentGroupExistsById(groupId) {
    return Boolean(db.prepare('SELECT id FROM instrument_groups WHERE id = ?').get(groupId));
  }

  function insertAutoPlan(plan) {
    db.prepare(
      `INSERT INTO auto_plans
        (symbol, amount_eur, day, enabled, start_date, frequency, weekday)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      plan.symbol,
      plan.amountEur,
      plan.frequency === 'monthly' ? plan.day : 1,
      plan.enabled ? 1 : 0,
      plan.startDate || null,
      plan.frequency,
      plan.weekday || null,
    );
  }

  async function runInTransaction(work) {
    db.exec('BEGIN');
    try {
      const result = await work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Transaction may already have been closed by SQLite.
      }
      throw error;
    }
  }

  repositories.onboarding = {
    ...(repositories.onboarding || {}),
    instrumentGroupExistsById,
    insertAutoPlan,
    runInTransaction,
  };
};
