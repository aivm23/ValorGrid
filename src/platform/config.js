const path = require('node:path');
const fs = require('node:fs');
const { version } = require('../../package.json');

function createConfig(env = process.env, root = path.resolve(__dirname, '../..')) {
  const legacyDbPath = path.join(root, 'portfolio.sqlite');
  const defaultDbPath = fs.existsSync(legacyDbPath)
    ? legacyDbPath
    : path.join(root, 'data', 'portfolio.sqlite');
  const defaultBackupDir = path.join(root, '.backups');
  const edition = String(env.VALORGRID_EDITION || 'community').trim().toLowerCase() === 'professional'
    ? 'professional'
    : 'community';
  const port = env.PORT === undefined || env.PORT === '' ? 5173 : Number(env.PORT);

  return {
    appInfo: { version, edition },
    root,
    port,
    host: env.HOST || '127.0.0.1',
    dbPath: env.PORTFOLIO_DB_PATH || defaultDbPath,
    backupDir: env.VALORGRID_BACKUP_DIR || defaultBackupDir,
  };
}

module.exports = {
  createConfig,
};
