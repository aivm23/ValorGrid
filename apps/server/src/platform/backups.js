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
    .map((file) => {
      try { return { file, mtime: fs.statSync(path.join(backupDir, file)).mtimeMs }; }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  for (const old of all.slice(limit)) {
    try { fs.unlinkSync(path.join(backupDir, old.file)); } catch { /* skip */ }
  }
}

function createBackup({ db, dbPath, root, backupDir: configuredBackupDir }) {
  const backupDir = ensureBackupDir(root, configuredBackupDir);
  try { db.exec('PRAGMA wal_checkpoint(FULL)'); } catch { /* skip for in-memory or non-WAL databases */ }
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

const ALLOWED_RISK_REASONS = new Set([
  'before-import-commit',
  'before-import-rollback',
  'before-bulk-transaction-delete',
  'before-instrument-delete',
  'before-group-delete',
  'before-auto-plans-replace',
]);

function createRiskBackup({ db, dbPath, root, backupDir: configuredBackupDir, reason, metadata }) {
  if (!ALLOWED_RISK_REASONS.has(reason)) {
    const error = new Error('Invalid risk backup reason');
    error.statusCode = 400;
    throw error;
  }
  const backupDir = ensureBackupDir(root, configuredBackupDir);
  db.exec('PRAGMA wal_checkpoint(FULL)');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `risk-${reason}-${stamp}.sqlite`;
  const targetPath = path.join(backupDir, fileName);
  fs.copyFileSync(dbPath, targetPath);
  pruneOldBackups(backupDir);
  return {
    file: fileName,
    path: targetPath,
    size: fs.statSync(targetPath).size,
    createdAt: new Date().toISOString(),
    reason,
    metadata,
  };
}

function deleteBackupFile(root, file, configuredBackupDir) {
  const safeName = safeBackupName(file);
  if (!safeName) {
    const error = new Error('Invalid backup file name');
    error.statusCode = 400;
    throw error;
  }
  const backupDir = ensureBackupDir(root, configuredBackupDir);
  const fullPath = path.resolve(backupDir, safeName);
  if (!fullPath.startsWith(backupDir + path.sep)) {
    const error = new Error('Backup file not found');
    error.statusCode = 404;
    throw error;
  }
  if (!fs.existsSync(fullPath)) {
    const error = new Error('Backup file not found');
    error.statusCode = 404;
    throw error;
  }
  fs.unlinkSync(fullPath);
  return { deleted: safeName };
}

module.exports = {
  createBackup,
  listBackups,
  resolveBackupPath,
  createRiskBackup,
  deleteBackupFile,
};
