const fs = require('node:fs');
const path = require('node:path');

function secretsFilePath(baseDir) {
  const resolvedDir = path.resolve(baseDir);
  const dirName = path.basename(resolvedDir);
  if (dirName === 'backups' || dirName === '.backups') {
    return path.resolve(resolvedDir, '..', 'secrets.json');
  }
  return path.join(resolvedDir, 'secrets.json');
}

function readSecrets(baseDir) {
  try {
    const raw = fs.readFileSync(secretsFilePath(baseDir), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSecrets(baseDir, secrets) {
  const filePath = secretsFilePath(baseDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(secrets, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* Windows: chmodSync not supported */
  }
}

function readAlphaVantageKey(baseDir) {
  return readSecrets(baseDir).alphaVantageApiKey || '';
}

function saveAlphaVantageKey(baseDir, key) {
  const secrets = readSecrets(baseDir);
  secrets.alphaVantageApiKey = key;
  writeSecrets(baseDir, secrets);
}

function deleteAlphaVantageKey(baseDir) {
  const secrets = readSecrets(baseDir);
  delete secrets.alphaVantageApiKey;
  writeSecrets(baseDir, secrets);
}

module.exports = { readAlphaVantageKey, saveAlphaVantageKey, deleteAlphaVantageKey, readSecrets };
