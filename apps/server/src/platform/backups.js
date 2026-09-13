const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyDatabaseFile } = require('./db');
const { encryptBuffer, decryptBuffer, readPassphrase, isEncryptedBackupName } = require('./backup-crypto');

function ensureBackupDir(root, backupDir = path.join(root, '.backups')) {
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function safeBackupName(name) {
  return /^[\w.-]+\.sqlite(\.enc)?$/.test(name) ? name : null;
}

function pruneOldBackups(backupDir, limit = 6) {
  const all = fs
    .readdirSync(backupDir)
    .filter(safeBackupName)
    .map((file) => {
      try {
        return { file, mtime: fs.statSync(path.join(backupDir, file)).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  for (const old of all.slice(limit)) {
    try {
      fs.unlinkSync(path.join(backupDir, old.file));
    } catch {
      /* skip */
    }
  }
}

function copyVerifiedBackup({ db, dbPath, backupDir, fileName }) {
  try {
    db.exec('PRAGMA wal_checkpoint(FULL)');
  } catch {
    /* skip for in-memory or non-WAL databases */
  }
  const targetPath = path.join(backupDir, fileName);
  fs.copyFileSync(dbPath, targetPath);
  try {
    const verification = verifyDatabaseFile(targetPath);
    pruneOldBackups(backupDir);
    return {
      file: fileName,
      path: targetPath,
      size: fs.statSync(targetPath).size,
      createdAt: new Date().toISOString(),
      verified: true,
      verification,
      encrypted: isEncryptedBackupName(fileName),
    };
  } catch (error) {
    try {
      fs.unlinkSync(targetPath);
    } catch {
      /* best effort cleanup */
    }
    throw new Error(`Backup verification failed: ${error.message}`);
  }
}

function createBackup({ db, dbPath, root, backupDir: configuredBackupDir, encrypted = false, passphrase }) {
  if (encrypted) {
    return createEncryptedBackup({ db, dbPath, root, backupDir: configuredBackupDir, passphrase });
  }
  const backupDir = ensureBackupDir(root, configuredBackupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ns = process.hrtime.bigint();
  const fileName = `portfolio-${stamp}-${ns}.sqlite`;
  return copyVerifiedBackup({ db, dbPath, backupDir, fileName });
}

function createEncryptedBackup({ db, dbPath, root, backupDir: configuredBackupDir, passphrase }) {
  const keyMaterial = readPassphrase(passphrase);
  try {
    db.exec('PRAGMA wal_checkpoint(FULL)');
  } catch {
    /* skip for in-memory or non-WAL databases */
  }
  const backupDir = ensureBackupDir(root, configuredBackupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ns = process.hrtime.bigint();
  const fileName = `portfolio-${stamp}-${ns}.sqlite.enc`;
  const targetPath = path.join(backupDir, fileName);
  let tempPath = null;
  try {
    const plainBuffer = fs.readFileSync(dbPath);
    fs.writeFileSync(targetPath, encryptBuffer(plainBuffer, keyMaterial), { mode: 0o600 });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-backup-verify-'));
    tempPath = path.join(tempDir, 'decrypted.sqlite');
    fs.writeFileSync(tempPath, decryptBuffer(fs.readFileSync(targetPath), keyMaterial));
    const verification = verifyDatabaseFile(tempPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempPath = null;
    pruneOldBackups(backupDir);
    return {
      file: fileName,
      path: targetPath,
      size: fs.statSync(targetPath).size,
      createdAt: new Date().toISOString(),
      verified: true,
      verification,
      encrypted: true,
    };
  } catch (error) {
    try {
      fs.unlinkSync(targetPath);
    } catch {
      /* best effort cleanup */
    }
    if (tempPath) {
      try {
        fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
      } catch {
        /* best effort cleanup */
      }
    }
    if (error.statusCode === 400 && /passphrase|encrypted backup/i.test(error.message)) throw error;
    throw new Error(`Backup verification failed: ${error.message}`);
  }
}

function decryptBackupToPath({ encPath, outPath, passphrase }) {
  if (!isEncryptedBackupName(path.basename(encPath)) || !fs.existsSync(encPath)) {
    const error = new Error('Encrypted backup file not found');
    error.statusCode = 404;
    throw error;
  }
  if (typeof outPath !== 'string' || !outPath.endsWith('.sqlite')) {
    const error = new Error('Decrypted output path must end with .sqlite');
    error.statusCode = 400;
    throw error;
  }
  const keyMaterial = readPassphrase(passphrase);
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, decryptBuffer(fs.readFileSync(encPath), keyMaterial));
    const verification = verifyDatabaseFile(outPath);
    return {
      path: outPath,
      size: fs.statSync(outPath).size,
      verified: true,
      verification,
    };
  } catch (error) {
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* best effort cleanup */
    }
    if (error.statusCode === 400 && /passphrase|encrypted backup/i.test(error.message)) throw error;
    throw new Error(`Backup verification failed: ${error.message}`);
  }
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
        encrypted: isEncryptedBackupName(file),
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
  'before-transaction-update',
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
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ns = process.hrtime.bigint();
  const fileName = `risk-${reason}-${stamp}-${ns}.sqlite`;
  return {
    ...copyVerifiedBackup({ db, dbPath, backupDir, fileName }),
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
  createEncryptedBackup,
  decryptBackupToPath,
  listBackups,
  resolveBackupPath,
  createRiskBackup,
  deleteBackupFile,
};
