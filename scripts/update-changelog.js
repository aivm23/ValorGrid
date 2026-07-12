const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { version } = require('../package.json');

const changelogPath = 'CHANGELOG.md';
const checkOnly = process.argv.includes('--check');

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function findLatestChangelogVersion(lines) {
  for (const line of lines) {
    const match = line.match(/^##\s+(\d+\.\d+\.\d+)\s*$/);
    if (match) return match[1];
  }
  return null;
}

function formatCommit(line) {
  const match = line.match(/^([a-f0-9]+)\s+(.+)$/);
  if (!match) return null;

  const subject = match[2];
  const conventional = subject.match(/^([a-z]+)(?:\([^)]+\))?!?:\s+(.+)$/);
  if (conventional) {
    const type = conventional[1];
    const summary = conventional[2];
    return `- ${type}: ${summary}.`;
  }

  return `- ${subject.replace(/\.$/, '')}.`;
}

function buildEntry(previousVersion) {
  const range = previousVersion ? `v${previousVersion}..HEAD` : 'HEAD';
  let commits = '';

  try {
    commits = runGit(['log', '--oneline', '--no-merges', range]);
  } catch {
    commits = runGit(['log', '--oneline', '--no-merges', '-12']);
  }

  const bullets = commits
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(formatCommit)
    .filter(Boolean);

  if (bullets.length === 0) {
    bullets.push('- Update repository maintenance tooling.');
  }

  return [`## ${version}`, '', ...bullets, ''].join('\n');
}

const packageLock = readJson('package-lock.json');
const lockVersion = packageLock.version || packageLock.packages?.['']?.version;
if (lockVersion !== version) {
  throw new Error(`package-lock.json version (${lockVersion}) does not match package.json (${version})`);
}

const lines = fs.readFileSync(changelogPath, 'utf8').split(/\r?\n/);
const heading = `## ${version}`;

if (lines.some((line) => line.trim() === heading)) {
  process.exit(0);
}

if (checkOnly) {
  throw new Error(`CHANGELOG.md does not contain a section for ${version}. Run npm run changelog:update.`);
}

const latestVersion = findLatestChangelogVersion(lines);
const insertAt = lines.findIndex((line) => /^##\s+\d+\.\d+\.\d+\s*$/.test(line));
if (insertAt === -1) {
  throw new Error('CHANGELOG.md does not contain any version section.');
}

const entry = buildEntry(latestVersion);
const nextLines = [...lines.slice(0, insertAt), entry, ...lines.slice(insertAt)];
fs.writeFileSync(
  changelogPath,
  `${nextLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`,
);
