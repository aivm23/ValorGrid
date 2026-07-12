const { assertCtxDeps } = require('../../platform/ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'portfolio-repository');

  const { db, repositories } = ctx;

  function findInstrumentBySymbol(symbol) {
    return db.prepare('SELECT * FROM instruments WHERE symbol = ?').get(symbol);
  }

  function countVisibleInstruments() {
    return db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE type NOT IN ('fx', 'cash') AND active = 1").get()
      .count;
  }

  function countActiveInstrumentGroups() {
    return db.prepare('SELECT COUNT(*) AS count FROM instrument_groups WHERE active = 1').get().count;
  }

  function countTransactions() {
    return db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;
  }

  function countAutoPlans() {
    return db.prepare('SELECT COUNT(*) AS count FROM auto_plans').get().count;
  }

  repositories.portfolio = {
    ...(repositories.portfolio || {}),
    findInstrumentBySymbol,
    countVisibleInstruments,
    countActiveInstrumentGroups,
    countTransactions,
    countAutoPlans,
  };
};
