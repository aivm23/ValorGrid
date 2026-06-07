const { repoRoot, resolveRuntimeConfig, createBackupForPath } = require('./db-maintenance');

function run() {
  const root = repoRoot();
  const { dbPath, backupDir } = resolveRuntimeConfig(process.env, root);
  const backup = createBackupForPath({ dbPath, root, backupDir });
  process.stdout.write(
    `${JSON.stringify(
      {
        dbPath,
        backupDir,
        backup,
      },
      null,
      2,
    )}\n`,
  );
}

try {
  run();
} catch (error) {
  console.error(`DB backup failed: ${error.message}`);
  process.exit(1);
}
