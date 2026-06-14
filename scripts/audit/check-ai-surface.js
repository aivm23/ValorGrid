#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const sources = [
  path.join(ROOT, '.opencode', 'commands'),
  path.join(ROOT, '.opencode', 'skills'),
  path.join(ROOT, '.agents', 'skills'),
  path.join(ROOT, 'AGENTS.md'),
];

const OLD_PATH_PATTERNS = [
  { regex: /(?<![a-z/])src\//g,     label: 'src/ (without apps/server/ prefix)', skipPrefix: 'apps/server/' },
  { regex: /(?<![a-z/])client\//g,  label: 'client/ (without apps/web/ prefix)',  skipPrefix: 'apps/web/'   },
  { regex: /(?<![a-z/])desktop\//g, label: 'desktop/ (without apps/desktop/ prefix)', skipPrefix: 'apps/desktop/' },
];

function collectMdFiles(dirs, file) {
  const files = [];
  if (file && fs.statSync(file).isFile()) {
    files.push(file);
  }
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectMdFiles([], full));
      } else if (entry.name.endsWith('.md')) {
        files.push(full);
      }
    }
  }
  return files;
}

const mdFiles = [];
const sourcesNormalized = sources.map(s => path.resolve(s));
mdFiles.push(...collectMdFiles(
  sourcesNormalized.filter(s => fs.statSync(s).isDirectory()),
  sourcesNormalized.find(s => fs.statSync(s).isFile())
));

let exitCode = 0;

for (const file of mdFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of OLD_PATH_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        const before = line.slice(0, match.index);
        if (before.endsWith(pattern.skipPrefix)) continue;
        console.log(`FAIL: ${path.relative(ROOT, file)}:${i + 1} — old path reference "${match[0]}" (${pattern.label})`);
        exitCode = 1;
      }
    }
  }
}

if (exitCode === 0) {
  console.log('OK: No old AI surface path references found.');
}
process.exit(exitCode);