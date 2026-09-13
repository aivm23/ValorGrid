const crypto = require('node:crypto');

const MAGIC = Buffer.from('VG01', 'utf8');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const MIN_PASSPHRASE_LENGTH = 8;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const ENCRYPTED_SUFFIX = '.sqlite.enc';

function isEncryptedBackupName(name) {
  return typeof name === 'string' && name.endsWith(ENCRYPTED_SUFFIX);
}

function isBackupName(name) {
  return typeof name === 'string' && /^[\w.-]+\.sqlite(\.enc)?$/.test(name);
}

function readPassphrase(explicitPassphrase) {
  const value = String(explicitPassphrase || process.env.VALORGRID_BACKUP_PASSPHRASE || '');
  if (!value) {
    const error = new Error('Backup passphrase is not configured (set VALORGRID_BACKUP_PASSPHRASE)');
    error.statusCode = 400;
    throw error;
  }
  if (value.length < MIN_PASSPHRASE_LENGTH) {
    const error = new Error(`Backup passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(String(passphrase), salt, KEY_BYTES, SCRYPT_OPTIONS);
}

function encryptBuffer(plainBuffer, passphrase) {
  const input = Buffer.isBuffer(plainBuffer) ? plainBuffer : Buffer.from(plainBuffer);
  const keyMaterial = readPassphrase(passphrase);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(keyMaterial, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, ciphertext, cipher.getAuthTag()]);
}

function decryptBuffer(encBuffer, passphrase) {
  const input = Buffer.isBuffer(encBuffer) ? encBuffer : Buffer.from(encBuffer);
  const headerLength = MAGIC.length + SALT_BYTES + IV_BYTES;
  if (input.length < headerLength + TAG_BYTES || !input.subarray(0, MAGIC.length).equals(MAGIC)) {
    const error = new Error('Not a ValorGrid encrypted backup');
    error.statusCode = 400;
    throw error;
  }
  const keyMaterial = readPassphrase(passphrase);
  const salt = input.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = input.subarray(MAGIC.length + SALT_BYTES, headerLength);
  const tag = input.subarray(input.length - TAG_BYTES);
  const ciphertext = input.subarray(headerLength, input.length - TAG_BYTES);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(keyMaterial, salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    const error = new Error('Invalid backup passphrase or corrupted encrypted backup');
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  ENCRYPTED_SUFFIX,
  MIN_PASSPHRASE_LENGTH,
  isEncryptedBackupName,
  isBackupName,
  readPassphrase,
  encryptBuffer,
  decryptBuffer,
};
