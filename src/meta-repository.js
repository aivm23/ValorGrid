const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'meta-repository');

  const { db, repositories } = ctx;

  function getMetaNumberByKey(key) {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
    return Number(row?.value || 0);
  }

  function setMetaNumberByKey(key, value) {
    db.prepare(
      `INSERT INTO app_meta (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    ).run(key, String(value));
  }

  function insertHistoryInvalidation(fromDate, reason) {
    db.prepare('INSERT INTO history_invalidations (from_date, reason) VALUES (?, ?)').run(fromDate, reason);
  }

  repositories.meta = {
    ...(repositories.meta || {}),
    getMetaNumberByKey,
    setMetaNumberByKey,
    insertHistoryInvalidation,
  };
};
