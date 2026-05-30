function assertCtxDeps(ctx, deps, moduleName) {
  for (const dep of deps) {
    if (ctx[dep] === undefined || ctx[dep] === null) {
      throw new Error(`${moduleName} requires ctx.${dep}`);
    }
  }
}

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
