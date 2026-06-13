const fs = require('node:fs');
const path = require('node:path');
const { createConfig } = require('../apps/server/src/platform/config');

function run() {
  const root = path.resolve(__dirname, '..');
  const config = createConfig(process.env, root);
  const { dbPath } = config;

  if (!fs.existsSync(dbPath)) {
    throw new Error(`No database found at: ${dbPath}`);
  }

  const backupDir = path.join(root, '.backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `portfolio-backup-${stamp}.sqlite`;
  const targetPath = path.join(backupDir, backupName);
  fs.copyFileSync(dbPath, targetPath);

  process.stdout.write(
    JSON.stringify(
      {
        dbPath,
        backupDir,
        backupFile: backupName,
        backupPath: targetPath,
        size: fs.statSync(targetPath).size,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
}

try {
  run();
} catch (error) {
  console.error(`DB backup failed: ${error.message}`);
  process.exit(1);
}
