const fs = require('fs');
const c = fs.readFileSync('apps/server/src/domains/instruments/instrument-service.js', 'utf8');

// Split by conflict markers and reconstruct
function resolveConflicts(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('<<<<<<< ')) {
      const ours = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('=======')) {
        ours.push(lines[i]);
        i++;
      }
      i++; // skip =======
      const theirs = [];
      while (i < lines.length && lines[i].startsWith('>>>>>>> ')) {
        // This is the last line of the conflict
        i++;
        break;
      }
      // Actually, read lines until >>>>>>>
      while (i < lines.length && !lines[i].startsWith('>>>>>>> ')) {
        theirs.push(lines[i]);
        i++;
      }
      i++; // skip >>>>>>>
      // Keep both (Ours from HEAD, Theirs from our branch)
      result.push(...ours);
      result.push(...theirs);
    } else {
      result.push(line);
    }
    i++; // move past current line
  }
  return result.join('\n');
}

// Simple approach: just use string replacement
const markers = [
  ["const { assertCtxDeps, getCtxDep } = require('../../platform/ctx-utils');\n<<<<<<< HEAD\n=======\nconst { brandPaletteColor } = require('../../shared/brand-palette');\nconst { attachBrandPalette } = require('./instrument-brand-palette');\n\n>>>>>>> 32b9eec (feat: add automatic corporate brand palette for groups and instruments)",
   "const { assertCtxDeps, getCtxDep } = require('../../platform/ctx-utils');\nconst { brandPaletteColor } = require('../../shared/brand-palette');\nconst { attachBrandPalette } = require('./instrument-brand-palette');"]
];

let result = c;

// Conflict 1: imports
const conflict1_start = result.indexOf("<<<<<<< HEAD\n=======\nconst { brandPaletteColor } = require('../../shared/brand-palette');\nconst { attachBrandPalette } = require('./instrument-brand-palette');\n\n>>>>>>> 32b9eec");
if (conflict1_start >= 0) {
  const before = result.substring(0, conflict1_start - "const { assertCtxDeps, getCtxDep } = require('../../platform/ctx-utils');".length - 1);
  const after = result.substring(conflict1_start + " <<<<<<< HEAD\n=======\nconst { brandPaletteColor } = require('../../shared/brand-palette');\nconst { attachBrandPalette } = require('./instrument-brand-palette');\n\n>>>>>>> 32b9eec (feat: add automatic corporate brand palette for groups and instruments)".length);
  result = before + "\nconst { brandPaletteColor } = require('../../shared/brand-palette');\nconst { attachBrandPalette } = require('./instrument-brand-palette');" + after;
}

fs.writeFileSync('apps/server/src/domains/instruments/instrument-service.js', result);
console.log('Phase 1 done, conflict count:', (result.match(/<<<<<<</g) || []).length);