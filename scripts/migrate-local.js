/**
 * Script de migración: copia datos legacy a local/valorgrid/
 * Uso: node scripts/migrate-local.js [--copy] [--verify]
 *
 * --copy   Copia data/ y .backups/ a local/valorgrid/ (no destructivo)
 * --verify Verifica que local/valorgrid/ tiene los datos esperados
 */

const { createConfig } = require('../apps/server/src/platform/config');
const fs = require('node:fs');
const path = require('node:path');

const config = createConfig();
const root = config.root;
const localDataDir = path.join(config.localRoot, 'data');
const localBackupDir = path.join(config.localRoot, 'backups');

const args = process.argv.slice(2);
let action = args.includes('--copy') ? 'copy' : args.includes('--verify') ? 'verify' : 'status';

if (action === 'status') {
  console.log('=== Estado de migración a local/valorgrid/ ===');
  console.log('');

  const legacySources = [
    { path: path.join(root, 'portfolio.sqlite'), label: 'portfolio.sqlite (raíz)' },
    { path: path.join(root, 'data', 'portfolio.sqlite'), label: 'data/portfolio.sqlite' },
    { path: path.join(root, '.backups'), label: '.backups/' },
  ];

  for (const source of legacySources) {
    const exists = fs.existsSync(source.path);
    console.log(`  ${exists ? '◉' : '○'} ${source.label} ${exists ? '(existe)' : '(no existe)'}`);
  }

  console.log('');

  const localTargets = [
    { path: localDataDir, label: 'local/valorgrid/data/' },
    { path: localBackupDir, label: 'local/valorgrid/backups/' },
  ];

  for (const target of localTargets) {
    const exists = fs.existsSync(target.path);
    const files = exists ? fs.readdirSync(target.path).length : 0;
    console.log(`  ${exists ? '◉' : '○'} ${target.label} ${exists ? `(${files} archivos)` : '(no existe)'}`);
  }

  console.log('');
  console.log(`DB activa: ${config.dbPath}`);
  console.log(`Backup dir activo: ${config.backupDir}`);
  console.log('');
  console.log('Ejecuta con --copy para migrar datos legacy a local/valorgrid/');
}

if (action === 'copy') {
  console.log('=== Migrando datos a local/valorgrid/ ===');

  fs.mkdirSync(localDataDir, { recursive: true });
  fs.mkdirSync(localBackupDir, { recursive: true });

  const legacyDb = path.join(root, 'data', 'portfolio.sqlite');
  if (fs.existsSync(legacyDb) && !fs.existsSync(path.join(localDataDir, 'portfolio.sqlite'))) {
    fs.copyFileSync(legacyDb, path.join(localDataDir, 'portfolio.sqlite'));
    console.log('  Copiado: data/portfolio.sqlite → local/valorgrid/data/portfolio.sqlite');

    for (const ext of ['-wal', '-shm']) {
      const src = legacyDb + ext;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(localDataDir, 'portfolio.sqlite' + ext));
        console.log(`  Copiado: data/portfolio.sqlite${ext} → local/valorgrid/data/`);
      }
    }
  }

  const legacyBackupDir = path.join(root, '.backups');
  if (fs.existsSync(legacyBackupDir)) {
    const files = fs.readdirSync(legacyBackupDir).filter((f) => f.endsWith('.sqlite'));
    for (const file of files) {
      const src = path.join(legacyBackupDir, file);
      const dst = path.join(localBackupDir, file);
      if (!fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
        console.log(`  Copiado: .backups/${file} → local/valorgrid/backups/`);
      }
    }
  }

  console.log('Migración completada. Los datos originales no se han eliminado.');
  console.log('Para usar los nuevos paths por defecto, elimina o renombra data/ y .backups/ antiguos.');
}

if (action === 'verify') {
  console.log('=== Verificando migración a local/valorgrid/ ===');
  const checks = [
    { path: path.join(localDataDir, 'portfolio.sqlite'), label: 'DB en local/valorgrid/data/' },
    { path: localBackupDir, label: 'Backup dir en local/valorgrid/backups/' },
  ];
  let ok = true;
  for (const check of checks) {
    const exists = fs.existsSync(check.path);
    console.log(`  ${exists ? 'OK' : 'FAIL'} ${check.label}`);
    if (!exists) ok = false;
  }
  if (ok) {
    console.log('Migración verificada correctamente.');
  } else {
    console.log('Migración incompleta. Revisa los fallos.');
    process.exit(1);
  }
}
