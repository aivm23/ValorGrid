#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');

const releaseDir = path.resolve(process.argv[2] || 'local/artifacts/desktop');
const platform = process.argv[3] || process.env.VALORGRID_DESKTOP_PLATFORM || process.platform;

const stableArtifacts = {
  win32: [
    {
      label: 'Windows installer',
      stableName: 'ValorGrid-Setup-x64.exe',
      test: (name) => name.endsWith('.exe') && name.includes(`-${version}-`) && name.includes('-x64'),
    },
  ],
  linux: [
    {
      label: 'Linux AppImage',
      stableName: 'ValorGrid-Linux-x64.AppImage',
      test: (name) => name.endsWith('.AppImage') && name.includes(version) && /x64|amd64/.test(name),
    },
    {
      label: 'Linux deb package',
      stableName: 'ValorGrid-Linux-x64.deb',
      test: (name) => name.endsWith('.deb') && name.includes(version) && /x64|amd64/.test(name),
    },
  ],
  darwin: [
    {
      label: 'macOS x64 DMG',
      stableName: 'ValorGrid-macOS-x64.dmg',
      test: (name) => name.endsWith('.dmg') && name.includes(version) && name.includes('x64'),
    },
    {
      label: 'macOS arm64 DMG',
      stableName: 'ValorGrid-macOS-arm64.dmg',
      test: (name) => name.endsWith('.dmg') && name.includes(version) && name.includes('arm64'),
    },
  ],
};

function listFiles() {
  if (!fs.existsSync(releaseDir)) {
    throw new Error(`Release directory does not exist: ${releaseDir}`);
  }
  return fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !Object.values(stableArtifacts).flat().some((artifact) => artifact.stableName === name));
}

function createStableArtifacts() {
  const artifacts = stableArtifacts[platform];
  if (!artifacts) {
    throw new Error(`Unsupported desktop release platform: ${platform}`);
  }

  const files = listFiles();
  for (const artifact of artifacts) {
    const sourceName = files.find(artifact.test);
    if (!sourceName) {
      throw new Error(`${artifact.label} not found in ${releaseDir}`);
    }

    const sourcePath = path.join(releaseDir, sourceName);
    const stablePath = path.join(releaseDir, artifact.stableName);
    fs.copyFileSync(sourcePath, stablePath);
    console.log(`Created ${artifact.stableName} from ${sourceName}`);
  }
}

if (require.main === module) {
  createStableArtifacts();
}

module.exports = {
  createStableArtifacts,
  stableArtifacts,
};
