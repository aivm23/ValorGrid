#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

let exitCode = 0;

function check(condition, message) {
  if (!condition) {
    console.log(`FAIL: ${message}`);
    exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

// Read root package.json version
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = rootPkg.version;
const versionTag = `v${version}`;

// Run scripts/update-changelog.js --check via execSync
try {
  execSync('node scripts/update-changelog.js --check', { cwd: ROOT, stdio: 'pipe' });
  console.log('OK: scripts/update-changelog.js --check passes');
} catch (e) {
  console.log(`FAIL: scripts/update-changelog.js --check failed: ${e.stderr?.toString().trim() || e.message}`);
  exitCode = 1;
}

// Read deploy/docker/compose.casaos.yml and verify version
const casaosPath = path.join(ROOT, 'deploy', 'docker', 'compose.casaos.yml');
const casaosContent = fs.readFileSync(casaosPath, 'utf8');

// Check x-casaos.version matches
const versionMatch = casaosContent.match(/^\s+version:\s+"(v\d+\.\d+\.\d+)"/m);
check(
  versionMatch && versionMatch[1] === versionTag,
  `deploy/docker/compose.casaos.yml x-casaos.version is "${versionMatch ? versionMatch[1] : 'NOT FOUND'}" expected "${versionTag}"`
);

// Check image tag matches
const imageMatch = casaosContent.match(/image:\s+ghcr\.io\/[^:]+:(v\d+\.\d+\.\d+)/);
check(
  imageMatch && imageMatch[1] === versionTag,
  `deploy/docker/compose.casaos.yml image tag is "${imageMatch ? imageMatch[1] : 'NOT FOUND'}" expected "${versionTag}"`
);

// Verify release workflow exists
const workflowPath = path.join(ROOT, '.github', 'workflows', 'release.yml');
check(
  fs.existsSync(workflowPath),
  '.github/workflows/release.yml exists'
);

if (fs.existsSync(workflowPath)) {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  for (const requiredReleasePattern of [
    'windows-installer:',
    'linux-installer:',
    'macos-installer:',
    'publish-release:',
    'ValorGrid-Setup-x64.exe',
    'ValorGrid-Linux-x64.AppImage',
    'ValorGrid-Linux-x64.deb',
    'ValorGrid-macOS-x64.dmg',
    'ValorGrid-macOS-arm64.dmg',
  ]) {
    check(
      workflow.includes(requiredReleasePattern),
      `.github/workflows/release.yml includes ${requiredReleasePattern}`
    );
  }
}

if (exitCode === 0) {
  console.log('All release surface checks passed.');
}
process.exit(exitCode);
