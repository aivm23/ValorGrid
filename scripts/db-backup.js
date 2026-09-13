const path = require('node:path');
const { decryptBackupToPath } = require('../apps/server/src/platform/backups');
const { createBackupForPath, resolveRuntimeConfig } = require('./db-maintenance');

function printHelp() {
  process.stdout.write(
    [
      'Usage:',
      '  npm run db:backup [-- --encrypted]              create a backup (encrypted with VALORGRID_BACKUP_PASSPHRASE when --encrypted or VALORGRID_BACKUP_ENCRYPT=1)',
      '  npm run db:backup -- --decrypt <file> --out <restored.sqlite>',
      '',
      'Encrypted backups use scrypt + AES-256-GCM via node:crypto and are stored as .sqlite.enc.',
      'The passphrase is only read from VALORGRID_BACKUP_PASSPHRASE (min 8 chars) and never from argv.',
      '',
    ].join('\n'),
  );
}

function readArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function run() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  const root = path.resolve(__dirname, '..');
  const config = resolveRuntimeConfig(process.env, root);
  const { dbPath, backupDir } = config;

  if (args.includes('--decrypt')) {
    const file = readArg(args, '--decrypt');
    const out = readArg(args, '--out');
    if (!file || !out)
      throw new Error('Usage: npm run db:backup -- --decrypt <backup.sqlite.enc> --out <restored.sqlite>');
    const encPath = path.isAbsolute(file) ? file : path.join(backupDir, file);
    const outPath = path.isAbsolute(out) ? out : path.resolve(root, out);
    const result = decryptBackupToPath({ encPath, outPath });
    process.stdout.write(
      JSON.stringify(
        { mode: 'decrypt', encPath, outPath: result.path, size: result.size, verified: result.verified },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const encrypted = args.includes('--encrypted') || process.env.VALORGRID_BACKUP_ENCRYPT === '1';
  const backup = createBackupForPath({ dbPath, root, backupDir, encrypted });

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
        encrypted: Boolean(backup.encrypted),
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
