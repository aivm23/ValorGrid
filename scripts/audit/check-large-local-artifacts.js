#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const CHECKS = [
  { dir: 'local',      label: 'local/' },
  { dir: 'data',        label: 'data/ (legacy)' },
  { dir: '.backups',    label: '.backups/ (legacy)' },
  { dir: 'dist',        label: 'dist/ (legacy build output)' },
];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function listDirContents(dirPath, label) {
  const full = path.join(ROOT, dirPath);
  if (!fs.existsSync(full)) {
    console.log(`\n[${label}] — NOT FOUND`);
    return;
  }

  const entries = fs.readdirSync(full, { withFileTypes: true });
  if (entries.length === 0) {
    console.log(`\n[${label}] — EMPTY`);
    return;
  }

  console.log(`\n[${label}] — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
  for (const entry of entries) {
    const entryPath = path.join(full, entry.name);
    let size = '';
    try {
      if (entry.isFile()) {
        size = ` (${formatSize(fs.statSync(entryPath).size)})`;
      } else if (entry.isDirectory()) {
        size = ' (dir)';
      }
    } catch {
      size = ' (?)';
    }
    console.log(`  ${entry.name}${size}`);
  }
}

console.log('=== Large/Local Artifacts Scan (read-only) ===');

for (const check of CHECKS) {
  listDirContents(check.dir, check.label);
}

// Check for *.sqlite* files in root (not in local/)
console.log('\n[Root *.sqlite* files (outside local/)]');
const rootEntries = fs.readdirSync(ROOT, { withFileTypes: true });
const sqliteFiles = rootEntries.filter(e => e.isFile() && /\.sqlite/.test(e.name));

if (sqliteFiles.length === 0) {
  console.log('  None found');
} else {
  for (const entry of sqliteFiles) {
    const entryPath = path.join(ROOT, entry.name);
    const size = formatSize(fs.statSync(entryPath).size);
    console.log(`  ${entry.name} (${size})`);
  }
}

console.log('\nScan complete.');
process.exit(0);