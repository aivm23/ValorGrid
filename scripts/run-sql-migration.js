#!/usr/bin/env node
/**
 * run-sql-migration.js
 *
 * Aplica un SQL versionado (deploy/sql/update-X-to-Y.sql) contra la DB activa
 * de ValorGrid.  Crea backup automático antes de ejecutar y verifica integridad
 * después.
 *
 * Funciona en cualquier plataforma con Node ≥ 24:
 *   - Windows local  → node scripts/run-sql-migration.js --sql deploy/sql/...
 *   - Linux / macOS  → ídem
 *   - Docker/CasaOS  → docker exec valorgrid node scripts/run-sql-migration.js --sql deploy/sql/...
 *
 * Opciones:
 *   --sql <path>        Ruta al archivo SQL (obligatorio).
 *   --db <path>         Ruta a la DB.  Por defecto se obtiene de config.js.
 *   --backup-dir <path> Directorio de backup.  Por defecto junto a la DB.
 *   --dry-run           Simula sin modificar nada.
 *   --yes               Omite confirmación interactiva.
 *   --help              Muestra esta ayuda.
 */

const fs = require('node:fs');
const path = require('node:path');

// ── Argumentos ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const help = args.includes('--help');
const dryRun = args.includes('--dry-run');
const autoYes = args.includes('--yes');

let sqlPath, dbPath, backupDir;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sql') sqlPath = args[++i];
  if (args[i] === '--db') dbPath = args[++i];
  if (args[i] === '--backup-dir') backupDir = args[++i];
}

if (help) {
  process.stdout.write(fs.readFileSync(__filename, 'utf8').match(/\/\*\*[\s\S]*?\*\//)[0].trim() + '\n');
  process.exit(0);
}

// Helper: pretty-print icon labels sin depender del emoji en terminal
const LABEL = { info: '[INFO]', ok: '[OK]', fail: '[FAIL]', warn: '[WARN]' };

// ── 1. Resolver sqlPath ────────────────────────────────────────────────────
sqlPath = sqlPath ? path.resolve(sqlPath) : null;
if (!sqlPath) {
  console.error(`${LABEL.fail} --sql <file> es obligatorio.`);
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error(`${LABEL.fail} No existe: ${sqlPath}`);
  process.exit(1);
}
console.log(`${LABEL.info} SQL:  ${sqlPath}`);

// ── 2. Resolver dbPath ─────────────────────────────────────────────────────
if (!dbPath) {
  const { createConfig } = require('../apps/server/src/platform/config');
  const root = path.resolve(__dirname, '..');
  const config = createConfig(process.env, root);
  dbPath = config.dbPath;
  console.log(`${LABEL.info} DB detectada desde config.js`);
}
dbPath = path.resolve(dbPath);
if (!fs.existsSync(dbPath)) {
  console.error(`${LABEL.fail} DB no encontrada: ${dbPath}`);
  process.exit(1);
}
console.log(`${LABEL.info} DB:   ${dbPath}`);

// ── 3. Resolver backupDir ──────────────────────────────────────────────────
if (!backupDir) {
  const dbParent = path.dirname(dbPath);
  const grandParent = path.dirname(dbParent);
  const alongside = path.join(grandParent, 'backups');
  backupDir = fs.existsSync(alongside) ? alongside : path.join(dbParent, 'backups');
}
fs.mkdirSync(backupDir, { recursive: true });
console.log(`${LABEL.info} Backup dir: ${backupDir}`);

// ── Resumen ────────────────────────────────────────────────────────────────
const mode = dryRun ? 'SIMULACION (dry-run)' : 'MIGRACION';
console.log(`\n${'='.repeat(45)}`);
console.log(` ${mode}`);
console.log(`${'='.repeat(45)}`);
console.log(` sql   : ${sqlPath}`);
console.log(` db    : ${dbPath}`);
console.log(` backup: ${backupDir}`);
console.log(` dry-run: ${dryRun}`);
console.log(`${'='.repeat(45)}\n`);

// Helper: pregunta interactiva (solo funciona con TTY real)
function awaitQuestion(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// ── 4. Confirmación ────────────────────────────────────────────────────────
if (!autoYes && !dryRun) {
  if (!process.stdin.isTTY) {
    console.log(`${LABEL.fail} No hay terminal interactiva. Usa --yes para omitir la confirmación.`);
    process.exit(1);
  }
  const readline = require('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = awaitQuestion(rl, '¿Ejecutar migración contra la DB activa? (s/N): ');
  if (!['s', 'S', 'si', 'SI', 'sí', 'SÍ'].includes(answer)) {
    console.log(`${LABEL.warn} Cancelado por el usuario.`);
    process.exit(0);
  }
}

// ── 5. Backup ──────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bakFile = `portfolio-backup-${stamp}.sqlite`;
const bakPath = path.join(backupDir, bakFile);

if (!dryRun) {
  const { openDatabase } = require('../apps/server/src/platform/db');
  process.stdout.write(`${LABEL.info} Backup → ${bakPath} ... `);
  try {
    const db = openDatabase(dbPath);
    db.exec(`VACUUM INTO '${bakPath.replace(/\\/g, '\\\\')}'`);
    db.close();
    const sizeMb = (fs.statSync(bakPath).size / 1024 / 1024).toFixed(2);
    console.log(`${sizeMb} MB`);
  } catch (err) {
    console.log(`${LABEL.fail} ERROR`);
    console.error(err.message);
    process.exit(1);
  }
} else {
  console.log(`${LABEL.info} Backup simulado → ${bakPath}`);
}

// ── 6. Estado pre-migración ────────────────────────────────────────────────
const { openDatabase } = require('../apps/server/src/platform/db');
let srcDb;
try {
  srcDb = openDatabase(dbPath);
} catch (err) {
  console.error(`${LABEL.fail} No se pudo abrir la DB: ${err.message}`);
  process.exit(1);
}

console.log(`\n${LABEL.info} Estado PRE-migración:`);
try {
  const preRow = srcDb.prepare('SELECT COUNT(*) AS cnt FROM instruments').get();
  console.log(`  Instrumentos: ${preRow.cnt}`);
  const preTypes = srcDb.prepare('SELECT DISTINCT type FROM instruments ORDER BY type').all().map(r => r.type);
  console.log(`  Tipos: ${preTypes.join(', ')}`);
} catch {
  // tabla instruments puede no existir aún
}

// ── 7. Ejecutar SQL ────────────────────────────────────────────────────────
const sql = fs.readFileSync(sqlPath, 'utf8');

if (!dryRun) {
  process.stdout.write(`\n${LABEL.info} Ejecutando migración ... `);
  try {
    srcDb.exec(sql);
    console.log(`${LABEL.ok}`);
  } catch (err) {
    console.log(`${LABEL.fail} ERROR`);
    console.error(`\n${err.message}`);
    console.log(`\n${LABEL.warn} La DB NO se modificó (rollback automático).`);
    console.log(`${LABEL.warn} Backup disponible: ${bakPath}`);
    srcDb.close();
    process.exit(1);
  }
} else {
  console.log(`\n${LABEL.info} (dry-run) SQL NO aplicado.`);
}

// ── 8. Estado post-migración + verificación ────────────────────────────────
console.log(`\n${LABEL.info} Estado POST-migración:`);

if (!dryRun) {
  try {
    const postRow = srcDb.prepare('SELECT COUNT(*) AS cnt FROM instruments').get();
    console.log(`  Instrumentos: ${postRow.cnt}`);
    const postTypes = srcDb.prepare('SELECT DISTINCT type FROM instruments ORDER BY type').all().map(r => r.type);
    console.log(`  Tipos: ${postTypes.join(', ')}`);
  } catch {}

  // ── Integridad ───────────────────────────────────────────────────────────
  let fkOk = false;
  let integrityOk = false;

  try {
    const fkRows = srcDb.prepare('PRAGMA foreign_key_check').all();
    fkOk = fkRows.length === 0;
    console.log(`  ${fkOk ? '[PASS]' : '[FAIL]'} PRAGMA foreign_key_check: ${fkOk ? 'ok (0 filas)' : `${fkRows.length} violaciones`}`);
  } catch (err) {
    console.log(`  [FAIL] PRAGMA foreign_key_check: ${err.message}`);
  }

  try {
    const integrity = srcDb.prepare('PRAGMA integrity_check').all();
    integrityOk = integrity.length === 1 && integrity[0].integrity_check === 'ok';
    console.log(`  ${integrityOk ? '[PASS]' : '[FAIL]'} PRAGMA integrity_check: ${integrityOk ? 'ok' : integrity.map(r => r.integrity_check).join('; ')}`);
  } catch (err) {
    console.log(`  [FAIL] PRAGMA integrity_check: ${err.message}`);
  }

  // Schema
  try {
    const schemaRow = srcDb.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='instruments'").get();
    if (schemaRow) {
      const oneLine = schemaRow.sql.replace(/\n\s*/g, ' ').substring(0, 120);
      console.log(`  Schema: ${oneLine}...`);
    }
  } catch {}

  if (!fkOk || !integrityOk) {
    console.log(`\n${LABEL.warn} Migración completada pero hay problemas de integridad.`);
    console.log(`${LABEL.warn} Restaura con: ${bakPath}`);
    console.log(`${LABEL.warn} Ejecuta: npm run db:doctor`);
    process.exit(1);
  }
} else {
  console.log(`  (dry-run — verificación omitida)`);
}

srcDb.close();

// ── 9. Resumen final ───────────────────────────────────────────────────────
console.log(`\n${'='.repeat(45)}`);
console.log(` ${dryRun ? '[DONE] SIMULACION COMPLETADA (sin cambios)' : '[DONE] MIGRACION COMPLETADA EXITOSAMENTE'}`);
console.log(`${'='.repeat(45)}`);
console.log(`\n  Backup:  ${bakPath}`);
console.log(`  DB:      ${dbPath}`);
console.log(`  SQL:     ${sqlPath}\n`);
if (!dryRun) {
  console.log(`  Siguiente paso: npm run db:doctor`);
  console.log(`  Arranca la app y verifica /api/health\n`);
}