const fs = require('node:fs');
const path = require('node:path');

function ensureBackupDir(root, backupDir = path.join(root, '.backups')) {
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function safeBackupName(name) {
  return /^[\w.-]+\.sqlite$/.test(name) ? name : null;
}

function pruneOldBackups(backupDir, limit = 6) {
  const all = fs
    .readdirSync(backupDir)
    .filter(safeBackupName)
    .map((file) => ({ file, mtime: fs.statSync(path.join(backupDir, file)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const old of all.slice(limit)) {
    fs.unlinkSync(path.join(backupDir, old.file));
  }
}

function createBackup({ db, dbPath, root, backupDir: configuredBackupDir }) {
  const backupDir = ensureBackupDir(root, configuredBackupDir);
  db.exec('PRAGMA wal_checkpoint(FULL)');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `portfolio-${stamp}.sqlite`;
  const targetPath = path.join(backupDir, fileName);
  fs.copyFileSync(dbPath, targetPath);
  pruneOldBackups(backupDir);
  return {
    file: fileName,
    path: targetPath,
    size: fs.statSync(targetPath).size,
    createdAt: new Date().toISOString(),
  };
}

function listBackups(root, configuredBackupDir) {
  const backupDir = ensureBackupDir(root, configuredBackupDir);
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

function resolveBackupPath(root, file, configuredBackupDir) {
  const safeName = safeBackupName(file);
  if (!safeName) return null;
  const backupDir = ensureBackupDir(root, configuredBackupDir);
  const fullPath = path.resolve(backupDir, safeName);
  return fullPath.startsWith(backupDir + path.sep) && fs.existsSync(fullPath) ? fullPath : null;
}

function restoreBackup({ db, dbPath, root, backupDir: configuredBackupDir, targetFile }) {
  const backupDir = ensureBackupDir(root, configuredBackupDir);
  const safeName = safeBackupName(targetFile);
  if (!safeName) {
    const error = new Error('Invalid backup file name');
    error.statusCode = 400;
    throw error;
  }
  const backupPath = path.resolve(backupDir, safeName);
  if (!backupPath.startsWith(backupDir + path.sep)) {
    const error = new Error('Backup file not found');
    error.statusCode = 404;
    throw error;
  }
  if (!fs.existsSync(backupPath)) {
    const error = new Error('Backup file not found');
    error.statusCode = 404;
    throw error;
  }
  db.exec('PRAGMA wal_checkpoint(FULL)');
  const preRestoreStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preRestoreName = `pre-restore-${preRestoreStamp}.sqlite`;
  const preRestorePath = path.join(backupDir, preRestoreName);
  fs.copyFileSync(dbPath, preRestorePath);
  fs.copyFileSync(backupPath, dbPath);
  return {
    restoredFile: safeName,
    preRestoreBackup: preRestoreName,
  };
}

module.exports = {
  createBackup,
  listBackups,
  resolveBackupPath,
  restoreBackup,
};
