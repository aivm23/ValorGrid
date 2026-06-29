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
  'ValorGrid is a local-first portfolio dashboard for desktop and self-hosted use. It is designed to help you record, import, visualize and back up your portfolio without uploading your ledger to a cloud portfolio platform.',
  '',
  '> ValorGrid is not financial advice and does not provide buy/sell recommendations.',
  '',
  '## Changelog',
  '',
  changelogBody,
  '',
  '## Desktop installers',
  '',
  `- Windows x64: download \`ValorGrid-Setup-${version}-x64.exe\` or the stable \`ValorGrid-Setup-x64.exe\` asset.`,
  `- Linux x64: download \`ValorGrid-Linux-x64.AppImage\` or \`ValorGrid-Linux-x64.deb\`.`,
  `- macOS x64/arm64: download \`ValorGrid-macOS-x64.dmg\` or \`ValorGrid-macOS-arm64.dmg\`.`,
  '- Download `SHA256SUMS.txt` and verify the installer hash if you want to check an artifact.',
  '- ValorGrid stores portfolio data locally in the user application data folder.',
  '- Windows SmartScreen may warn for new unsigned apps while reputation builds; use only this official release page as the download source.',
  '- macOS builds are unsigned in this release line, so Gatekeeper may require manual approval on first open.',
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
  '## Useful links',
  '',
  '- First steps: `docs/FIRST_STEPS.md`',
  '- Excel import guide: `docs/IMPORT_EXCEL.md`',
  '- FAQ: `docs/FAQ.md`',
  '- Legal notice: `docs/LEGAL_NOTICE.md`',
  '- Financial disclaimer: `docs/FINANCIAL_DISCLAIMER.md`',
  '',
  'See `docs/GITHUB_RELEASE.md` for the full release checklist.',
];

fs.writeFileSync('release-notes.md', `${notes.join('\n')}\n`);
