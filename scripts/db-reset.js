const { resetDatabase } = require('./db-maintenance');

function run() {
  const result = resetDatabase();
  process.stdout.write(
    JSON.stringify(
      {
        dbPath: result.dbPath,
        backup: result.backup,
        removedArtifacts: result.removedArtifacts,
        verification: {
          missingTables: result.verification.missingTables,
          missingMetaKeys: result.verification.missingMetaKeys,
          tables: result.verification.presentTables.length,
          bytes: result.verification.bytes,
        },
      },
      null,
      2,
    ) + '\n',
  );
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`DB reset failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { run };
