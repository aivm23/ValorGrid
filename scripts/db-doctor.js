const { repoRoot, collectDoctorReport } = require('./db-maintenance');

function statusLabel(status) {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'WARN';
  return 'FAIL';
}

function run() {
  const root = repoRoot();
  const report = collectDoctorReport({ env: process.env, root });
  for (const check of report.checks) {
    const line = `[${statusLabel(check.status)}] ${check.message}`;
    if (check.details) {
      process.stdout.write(`${line}\n${JSON.stringify(check.details, null, 2)}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
  process.stdout.write(
    `Summary: ${report.summary.ok} OK, ${report.summary.warn} WARN, ${report.summary.fail} FAIL\n`,
  );
  process.stdout.write(`${JSON.stringify({ dbPath: report.dbPath, backups: report.backupsCount }, null, 2)}\n`);
  if (report.summary.fail > 0) {
    process.exit(1);
  }
}

try {
  run();
} catch (error) {
  console.error(`DB doctor failed: ${error.message}`);
  process.exit(1);
}
