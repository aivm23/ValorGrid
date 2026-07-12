#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

let exitCode = 0;

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function check(condition, message) {
  if (!condition) {
    console.log(`FAIL: ${message}`);
    exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

// apps/server/package.json: must have exceljs in dependencies
const serverPkg = readJSON(path.join(ROOT, 'apps', 'server', 'package.json'));
check(serverPkg.dependencies && serverPkg.dependencies.exceljs, 'apps/server/package.json has exceljs in dependencies');

// apps/desktop/package.json: must have electron and electron-builder in devDependencies
const desktopPkg = readJSON(path.join(ROOT, 'apps', 'desktop', 'package.json'));
check(
  desktopPkg.devDependencies && desktopPkg.devDependencies.electron,
  'apps/desktop/package.json has electron in devDependencies',
);
check(
  desktopPkg.devDependencies && desktopPkg.devDependencies['electron-builder'],
  'apps/desktop/package.json has electron-builder in devDependencies',
);

// root package.json: must NOT have exceljs, electron, or electron-builder
const rootPkg = readJSON(path.join(ROOT, 'package.json'));
for (const dep of ['exceljs', 'electron', 'electron-builder']) {
  const inDeps = rootPkg.dependencies && rootPkg.dependencies[dep];
  const inDevDeps = rootPkg.devDependencies && rootPkg.devDependencies[dep];
  check(!inDeps && !inDevDeps, `root package.json does NOT contain ${dep}`);
}

if (exitCode === 0) {
  console.log('All dependency policy checks passed.');
}
process.exit(exitCode);
