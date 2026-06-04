const fs = require('node:fs');
const { version } = require('../package.json');

const lines = fs.readFileSync('CHANGELOG.md', 'utf8').split(/\r?\n/);
const heading = `## ${version}`;
const start = lines.findIndex((line) => line.trim() === heading);

if (start === -1) {
  throw new Error(`CHANGELOG.md does not contain a section for ${version}`);
}

let end = lines.length;
for (let index = start + 1; index < lines.length; index += 1) {
  if (/^##\s+\d+\.\d+\.\d+\s*$/.test(lines[index])) {
    end = index;
    break;
  }
}

const tag = `v${version}`;
const changelogBody = lines.slice(start + 1, end).join('\n').trim();
const notes = [
  `# ValorGrid ${tag}`,
  '',
  '## Changelog',
  '',
  changelogBody,
  '',
  '## Windows',
  '',
  `- Download \`ValorGrid-Setup-${version}-x64.exe\` from this release.`,
  '- Verify the installer with `SHA256SUMS.txt` before installing.',
  '- ValorGrid stores portfolio data locally in the user application data folder.',
  '',
  '## Docker image',
  '',
  `- The Docker workflow publishes \`ghcr.io/aivm23/valorgrid:${tag}\` for the same tag.`,
  '- Wait for the Docker workflow to finish before announcing the release.',
  '',
  '## Upgrade and rollback',
  '',
  '- Create a backup from the app before upgrading.',
  '- Roll back by uninstalling this version and installing the previous release.',
  '- If needed, restore the SQLite backup manually as documented in `docs/DB_OPERATIONS.md`.',
  '',
  'See `docs/GITHUB_RELEASE.md` for the full release checklist.',
];

fs.writeFileSync('release-notes.md', `${notes.join('\n')}\n`);
