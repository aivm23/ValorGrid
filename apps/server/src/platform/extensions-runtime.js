const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['extensions'], 'extensions-runtime');

  ctx.extensions.registerServer(ctx);
};
