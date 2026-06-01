const { repoRoot, resetDatabase } = require('./db-maintenance');

function run() {
  const root = repoRoot();
  const result = resetDatabase({ env: process.env, root });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  run();
} catch (error) {
  console.error(`DB reset failed: ${error.message}`);
  process.exit(1);
}
