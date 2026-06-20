const fs = require('node:fs');
const path = require('node:path');

function secretsFilePath(backupDir) {
  return path.resolve(backupDir, '..', 'secrets.json');
}

function readSecrets(backupDir) {
  try {
    const raw = fs.readFileSync(secretsFilePath(backupDir), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSecrets(backupDir, secrets) {
  const filePath = secretsFilePath(backupDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(secrets, null, 2), 'utf-8');
}

function readAlphaVantageKey(backupDir) {
  return readSecrets(backupDir).alphaVantageApiKey || '';
}

function saveAlphaVantageKey(backupDir, key) {
  const secrets = readSecrets(backupDir);
  secrets.alphaVantageApiKey = key;
  writeSecrets(backupDir, secrets);
}

function deleteAlphaVantageKey(backupDir) {
  const secrets = readSecrets(backupDir);
  delete secrets.alphaVantageApiKey;
  writeSecrets(backupDir, secrets);
}

module.exports = { readAlphaVantageKey, saveAlphaVantageKey, deleteAlphaVantageKey, readSecrets };