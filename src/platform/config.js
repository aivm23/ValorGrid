const path = require('node:path');
const fs = require('node:fs');
const { version } = require('../../package.json');

function createConfig(env = process.env, root = path.resolve(__dirname, '../..')) {
  const legacyDbPath = path.join(root, 'portfolio.sqlite');
  const defaultDbPath = fs.existsSync(legacyDbPath)
    ? legacyDbPath
    : path.join(root, 'data', 'portfolio.sqlite');

  return {
    appInfo: { version },
    root,
    port: Number(env.PORT || 5173),
    host: env.HOST || '127.0.0.1',
    dbPath: env.PORTFOLIO_DB_PATH || defaultDbPath,
  };
}

module.exports = {
  createConfig,
};
