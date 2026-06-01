const { assertCtxDeps } = require('../../ctx-utils');
/** @typedef {import('./types').AutoPlan} AutoPlan */
const { withTransactionAsync } = require('../../db');

/**
 * @param {Record<string, unknown>} ctx
 */
module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'onboarding-repository');

  const { db, repositories } = ctx;

  /**
   * @param {string} groupId
   * @returns {boolean}
   */
  function instrumentGroupExistsById(groupId) {
    return Boolean(db.prepare('SELECT id FROM instrument_groups WHERE id = ?').get(groupId));
  }

  /**
   * @param {AutoPlan} plan
   */
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

  /**
   * @template T
   * @param {() => Promise<T>} work
   * @returns {Promise<T>}
   */
  async function runInTransaction(work) {
    return withTransactionAsync(db, work);
  }

  repositories.onboarding = {
    ...(repositories.onboarding || {}),
    instrumentGroupExistsById,
    insertAutoPlan,
    runInTransaction,
  };
};
