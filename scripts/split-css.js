const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'apps', 'web', 'src', 'styles.css');
const outputDir = path.join(root, 'apps', 'web', 'src', 'styles');
const sections = [
  ['foundation', null],
  ['components', '/* valorgrid-split:components */'],
  ['dialogs', '/* valorgrid-split:dialogs */'],
  ['admin', '/* valorgrid-split:admin */'],
  ['responsive', '/* valorgrid-split:responsive */'],
  ['import-overrides', '/* valorgrid-split:import-overrides */'],
];

function verifySplitFiles() {
  for (const [name] of sections) {
    const filePath = path.join(outputDir, `${name}.css`);
    if (!fs.existsSync(filePath)) throw new Error(`Missing split stylesheet: ${filePath}`);
  }
}

function splitStyles() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (source.startsWith("@import url('./styles/")) {
    verifySplitFiles();
    return;
  }
  if (process.argv.includes('--check')) throw new Error('styles.css is not the ordered split stylesheet entrypoint');

  const offsets = sections.map(([name, marker]) => {
    const offset = marker === null ? 0 : source.indexOf(marker);
    if (offset < 0) throw new Error(`Missing CSS split marker: ${name}`);
    return offset;
  });
  fs.mkdirSync(outputDir, { recursive: true });
  sections.forEach(([name], index) => {
    const content = source.slice(offsets[index], offsets[index + 1] ?? source.length).trimStart();
    fs.writeFileSync(path.join(outputDir, `${name}.css`), `${content.trimEnd()}\n`);
  });
  const imports = sections.map(([name]) => `@import url('./styles/${name}.css');`).join('\n');
  fs.writeFileSync(sourcePath, `${imports}\n`);
}

splitStyles();
