const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
  `);
  return db;
}

function verifyDatabaseFile(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') {
      throw new Error(`integrity_check failed: ${integrity?.integrity_check || 'unknown result'}`);
    }
    const foreignKeyErrors = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyErrors.length > 0) {
      throw new Error(`foreign_key_check found ${foreignKeyErrors.length} violation(s)`);
    }
    return {
      integrityCheck: integrity.integrity_check,
      foreignKeyErrors: foreignKeyErrors.length,
    };
  } finally {
    db.close();
  }
}

function withTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Transaction may already have been closed by SQLite.
    }
    throw error;
  }
}

async function withTransactionAsync(db, fn) {
  db.exec('BEGIN');
  try {
    const result = await fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Transaction may already have been closed by SQLite.
    }
    throw error;
  }
}

module.exports = {
  openDatabase,
  verifyDatabaseFile,
  withTransaction,
  withTransactionAsync,
};
