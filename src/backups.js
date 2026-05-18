const fs = require('node:fs');
const path = require('node:path');

function ensureBackupDir(root) {
  const backupDir = path.join(root, '.backups');
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function safeBackupName(name) {
  return /^[\w.-]+\.sqlite$/.test(name) ? name : null;
}

function createBackup({ db, dbPath, root }) {
  const backupDir = ensureBackupDir(root);
  db.exec('PRAGMA wal_checkpoint(FULL)');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `portfolio-${stamp}.sqlite`;
  const targetPath = path.join(backupDir, fileName);
  fs.copyFileSync(dbPath, targetPath);
  return {
    file: fileName,
    path: targetPath,
    size: fs.statSync(targetPath).size,
    createdAt: new Date().toISOString(),
  };
}

function listBackups(root) {
  const backupDir = ensureBackupDir(root);
  return fs
    .readdirSync(backupDir)
    .filter((file) => safeBackupName(file))
    .map((file) => {
      const fullPath = path.join(backupDir, file);
      const stat = fs.statSync(fullPath);
      return {
        file,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function resolveBackupPath(root, file) {
  const safeName = safeBackupName(file);
  if (!safeName) return null;
  const backupDir = ensureBackupDir(root);
  const fullPath = path.resolve(backupDir, safeName);
  return fullPath.startsWith(backupDir + path.sep) && fs.existsSync(fullPath) ? fullPath : null;
}

module.exports = {
  createBackup,
  listBackups,
  resolveBackupPath,
};
