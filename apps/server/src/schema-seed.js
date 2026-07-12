const { assertCtxDeps } = require('./platform/ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db'], 'schema-seed');

  const { db } = ctx;

  function groupIdFromName(name) {
    return (
      String(name || 'general')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'general'
    );
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

  Object.assign(ctx, { groupIdFromName, ensureGroup });
};
