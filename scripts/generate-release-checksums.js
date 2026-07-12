const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');

const releaseDir = path.resolve(process.argv[2] || 'dist');
const outputPath = path.join(releaseDir, 'SHA256SUMS.txt');
const allowedNames = new Set([
  'ValorGrid-Setup-x64.exe',
  'ValorGrid-Linux-x64.AppImage',
  'ValorGrid-Linux-x64.deb',
  'ValorGrid-macOS-x64.dmg',
  'ValorGrid-macOS-arm64.dmg',
]);
const allowedExtensions = new Set(['.exe', '.dmg', '.appimage', '.deb', '.blockmap']);
const versionArtifactPattern = new RegExp(`-${version.replace(/\./g, '\\.')}-`);

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

if (!fs.existsSync(releaseDir)) {
  throw new Error(`Release directory does not exist: ${releaseDir}`);
}

const files = fs
  .readdirSync(releaseDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(releaseDir, entry.name))
  .filter((filePath) => {
    const basename = path.basename(filePath);
    return (
      allowedNames.has(basename) ||
      basename.startsWith('latest') ||
      allowedExtensions.has(path.extname(filePath).toLowerCase())
    );
  })
  .filter((filePath) => {
    const basename = path.basename(filePath);
    return (
      allowedNames.has(basename) ||
      basename.startsWith('latest') ||
      versionArtifactPattern.test(basename) ||
      basename.includes(version)
    );
  })
  .filter((filePath) => path.basename(filePath) !== 'SHA256SUMS.txt')
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  throw new Error(`No release artifacts found in ${releaseDir}`);
}

const lines = files.map((filePath) => {
  const relative = path.relative(releaseDir, filePath).replace(/\\/g, '/');
  return `${sha256(filePath)}  ${relative}`;
});

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${outputPath}`);
