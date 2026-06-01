/**
 * @param {Record<string, unknown>} ctx
 * @param {string[]} deps
 * @param {string} moduleName
 */
function assertCtxDeps(ctx, deps, moduleName) {
  for (const dep of deps) {
    if (ctx[dep] === undefined || ctx[dep] === null) {
      throw new Error(`${moduleName} requires ctx.${dep}`);
    }
  }
}

/**
 * @template T
 * @param {Record<string, unknown>} ctx
 * @param {string} dep
 * @param {string} moduleName
 * @returns {T}
 */
function getCtxDep(ctx, dep, moduleName) {
  const value = ctx[dep];
  if (value === undefined || value === null) {
    throw new Error(`${moduleName} requires ctx.${dep}`);
  }
  return value;
}

module.exports = {
  assertCtxDeps,
  getCtxDep,
};
