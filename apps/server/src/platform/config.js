const path = require('node:path');
const fs = require('node:fs');
const { version: communityVersion } = require('../../../../package.json');

function createConfig(env = process.env, root = path.resolve(__dirname, '../../../../')) {
  const version = env.VALORGRID_PRO_VERSION || communityVersion;
  const localRoot = path.join(root, 'local', 'valorgrid');
  const localDataDir = path.join(localRoot, 'data');
  const localBackupDir = path.join(localRoot, 'backups');
  const localDbPath = path.join(localDataDir, 'portfolio.sqlite');

  const legacyDbPath = path.join(root, 'portfolio.sqlite');
  const legacyDataDbPath = path.join(root, 'data', 'portfolio.sqlite');

  const defaultDbPath = fs.existsSync(legacyDbPath)
    ? legacyDbPath
    : fs.existsSync(legacyDataDbPath)
      ? legacyDataDbPath
      : localDbPath;

  const defaultBackupDir = env.VALORGRID_BACKUP_DIR
    ? env.VALORGRID_BACKUP_DIR
    : fs.existsSync(path.join(root, '.backups'))
      ? path.join(root, '.backups')
      : localBackupDir;

  const edition = String(env.VALORGRID_EDITION || 'community').trim().toLowerCase() === 'professional'
    ? 'professional'
    : 'community';
  const port = env.PORT === undefined || env.PORT === '' ? 1325 : Number(env.PORT);
  const dbPath = env.PORTFOLIO_DB_PATH || defaultDbPath;
  const explicitDbBackupDir = path.join(path.dirname(dbPath), '..', 'backups');
  const backupDir = env.VALORGRID_BACKUP_DIR || (env.PORTFOLIO_DB_PATH ? explicitDbBackupDir : defaultBackupDir);
  const authPassword = String(env.VALORGRID_AUTH_PASSWORD || '');

  return {
    appInfo: { version, edition },
    root,
    localRoot,
    port,
    host: env.HOST || '127.0.0.1',
    dbPath,
    backupDir,
    auth: {
      enabled: authPassword.length > 0,
      user: String(env.VALORGRID_AUTH_USER || 'valorgrid'),
      password: authPassword,
    },
  };
}

module.exports = {
  createConfig,
};
