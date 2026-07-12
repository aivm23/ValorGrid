const path = require('node:path');
const { createBackupForPath, resolveRuntimeConfig } = require('./db-maintenance');

function run() {
  const root = path.resolve(__dirname, '..');
  const config = resolveRuntimeConfig(process.env, root);
  const { dbPath, backupDir } = config;
  const backup = createBackupForPath({ dbPath, root, backupDir });

  process.stdout.write(
    JSON.stringify(
      {
        dbPath,
        backupDir,
        backupFile: backup.file,
        backupPath: backup.path,
        size: backup.size,
        createdAt: backup.createdAt,
        verified: backup.verified,
        verification: backup.verification,
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
