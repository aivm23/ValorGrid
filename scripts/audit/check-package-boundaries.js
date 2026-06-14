#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const CHECKS = [
  {
    dir: path.join(ROOT, 'apps', 'web', 'src'),
    name: 'apps/web/src',
    patterns: [
      /require\(['"]\.\.\/server\//,
      /import\(['"]\.\.\/server\//,
      /from\s+['"]\.\.\/server\//,
    ],
    label: 'cross-boundary require/import to server',
  },
  {
    dir: path.join(ROOT, 'apps', 'server', 'src'),
    name: 'apps/server/src',
    patterns: [
      /require\(['"]\.\.\/web\//,
      /import\(['"]\.\.\/web\//,
      /from\s+['"]\.\.\/web\//,
    ],
    label: 'cross-boundary require/import to web',
  },
];

let exitCode = 0;

for (const check of CHECKS) {
  if (!fs.existsSync(check.dir)) {
    console.log(`SKIP: ${check.name} does not exist`);
    continue;
  }

  const entries = fs.readdirSync(check.dir, { recursive: true });
  for (const entry of entries) {
    const full = path.join(check.dir, entry);
    if (!fs.statSync(full).isFile() || !full.endsWith('.js')) continue;

    const content = fs.readFileSync(full, 'utf8');
    for (const pattern of check.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        const rel = path.relative(ROOT, full);
        console.log(`FAIL: ${rel} — ${check.label}`);
        exitCode = 1;
      }
    }
  }
}

if (exitCode === 0) {
  console.log('OK: No cross-boundary imports detected.');
}
process.exit(exitCode);