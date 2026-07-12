const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

// ── File discovery ───────────────────────────────────────────────────────────

function collectMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectMarkdown(absolute);
    return entry.isFile() && entry.name.endsWith('.md') ? [absolute] : [];
  });
}

function collectSourceFiles() {
  const dirsToScan = [
    { dir: 'apps/web/src', filter: '.js' },
    { dir: 'apps/server/src', filter: '.js' },
    { dir: 'test', filter: '.js' },
    { dir: 'scripts', filter: '.js' },
  ];
  const singleFiles = ['apps/web/index.html'];
  const result = [...singleFiles];

  for (const { dir, filter } of dirsToScan) {
    const basePath = path.join(repoRoot, dir);
    if (!fs.existsSync(basePath)) continue;
    const walkDir = (dirPath, relativeDir) => {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walkDir(fullPath, relative);
        } else if (entry.isFile() && entry.name.endsWith(filter)) {
          result.push(relative);
        }
      }
    };
    walkDir(basePath, dir);
  }
  return result;
}

const targetFiles = [
  'README.md',
  ...collectMarkdown(path.join(repoRoot, 'docs'))
    .map((file) => path.relative(repoRoot, file))
    .filter((file) => !file.replace(/\\/g, '/').startsWith('docs/en/')),
  ...collectSourceFiles(),
];

// ── Orthography patterns ─────────────────────────────────────────────────────

const replacements = [
  ['aplicacion', 'aplicación'],
  ['aportacion', 'aportación'],
  ['automatica', 'automática'],
  ['automaticamente', 'automáticamente'],
  ['automatico', 'automático'],
  ['Automatico', 'Automático'],
  ['autenticacion', 'autenticación'],
  ['calculos', 'cálculos'],
  ['codigo', 'código'],
  ['comision', 'comisión'],
  ['Comision', 'Comisión'],
  ['conciliacion', 'conciliación'],
  ['configuracion', 'configuración'],
  ['contrasena', 'contraseña'],
  ['corrupcion', 'corrupción'],
  ['deduplicacion', 'deduplicación'],
  ['diagnostico', 'diagnóstico'],
  ['distribucion', 'distribución'],
  ['documentacion', 'documentación'],
  ['edicion', 'edición'],
  ['efimero', 'efímero'],
  ['envio', 'envío'],
  ['fisica', 'física'],
  ['historico', 'histórico'],
  ['identica', 'idéntica'],
  ['importacion', 'importación'],
  ['instalacion', 'instalación'],
  ['integracion', 'integración'],
  ['invalida', 'inválida'],
  ['invalido', 'inválido'],
  ['maquina', 'máquina'],
  ['metricas', 'métricas'],
  ['modulo', 'módulo'],
  ['modulos', 'módulos'],
  ['normalizacion', 'normalización'],
  ['operacion', 'operación'],
  ['organizacion', 'organización'],
  ['pagina', 'página'],
  ['politica', 'política'],
  ['posicion', 'posición'],
  ['Posicion', 'Posición'],
  ['Previsualizacion', 'Previsualización'],
  ['publicacion', 'publicación'],
  ['publico', 'público'],
  ['publicos', 'públicos'],
  ['rapido', 'rápido'],
  ['raiz', 'raíz'],
  ['relacion', 'relación'],
  ['revision', 'revisión'],
  ['semantica', 'semántica'],
  ['simbolo', 'símbolo'],
  ['tambien', 'también'],
  ['tecnica', 'técnica'],
  ['tecnicas', 'técnicas'],
  ['tecnico', 'técnico'],
  ['tecnicos', 'técnicos'],
  ['todavia', 'todavía'],
  ['ultima', 'última'],
  ['vacio', 'vacío'],
  ['validacion', 'validación'],
  ['version', 'versión'],
];

const phraseReplacements = [
  [/\besta\s+(configurado|completo|ignorado|vac[ií]o)\b/iu, 'está $1'],
  [/\bdetras\b/iu, 'detrás'],
  [/\bmas\b/iu, 'más'],
  [/\banaden\b/iu, 'añaden'],
  [/\bdevolvio\b/iu, 'devolvió'],
  [/\bpodria\b/iu, 'podría'],
  [/\bproxima\b/iu, 'próxima'],
  [/\bproximo\b/iu, 'próximo'],
  [/\brecalcularan\b/iu, 'recalcularán'],
  [/\bsera\b/iu, 'será'],
  [/\binvalidara\b/iu, 'invalidará'],
];

/**
 * Patterns to skip in source (.js/.html) files because they match
 * English programming terms (variable/property names).
 */
const sourceSkippedWords = new Set(['version', 'comision', 'Comision']);

// ── Text extraction ──────────────────────────────────────────────────────────

const inlineCodePattern = /`[^`]*`/g;
const markdownLinkTargetPattern = /(\!?\[[^\]]*\])\([^)]+\)/g;
const mojibakePattern = /[ÃÂ�]/;
const replacementQuestionMarkPattern = /[\p{L}]\?[\p{L}]/u;
const urlPattern = /https?:\/\//i;

function stripInlineCode(line) {
  return line
    .replace(markdownLinkTargetPattern, (match, label) => `${label}${' '.repeat(match.length - label.length)}`)
    .replace(inlineCodePattern, (match) => ' '.repeat(match.length));
}

function visibleMarkdownLines(content) {
  let inFence = false;
  return content.split(/\r?\n/).map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return '';
    }
    if (inFence) return '';
    return stripInlineCode(line);
  });
}

/**
 * Extract translatable Spanish text from JS/HTML source lines.
 * Keeps content inside string literals (single, double, template) and comments.
 */
function extractSourceSpanishText(line) {
  const parts = [];
  // Match: single-quoted, double-quoted, template-literal strings, and // comments
  const pattern = /(?:'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`|\/\/.*$)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const content = match[1] ?? match[2] ?? match[3] ?? match[0].replace(/^\/\//, '');
    if (content) parts.push(content);
  }
  return parts.join(' ');
}

function visibleSourceLines(content) {
  let inBlockComment = false;
  return content.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    // Skip empty lines
    if (!trimmed) return '';
    // Skip lines that are pure code (no strings or comments)
    const hasStringOrComment = /['"`\/]/.test(line);
    if (!hasStringOrComment) return '';
    // Track block comments
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      return extractSourceSpanishText(line);
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      return extractSourceSpanishText(line);
    }
    return extractSourceSpanishText(line);
  });
}

// ── Issue finder ─────────────────────────────────────────────────────────────

function findIssuesInLines(lines, fileExtension) {
  const isMarkdown = fileExtension === '.md';
  const issues = [];
  lines.forEach((line, index) => {
    if (mojibakePattern.test(line)) {
      issues.push({
        line: index + 1,
        message: 'Texto con mojibake o carácter de reemplazo; revisa la codificación UTF-8.',
      });
    }
    // Only check for embedded ? in prose (markdown); JS template literals contain URL query strings
    if (isMarkdown && !urlPattern.test(line) && replacementQuestionMarkPattern.test(line)) {
      issues.push({
        line: index + 1,
        message: 'Texto con "?" incrustado en una palabra; revisa una posible tilde perdida.',
      });
    }

    for (const [wrong, expected] of replacements) {
      // In source files, skip English programming terms that match Spanish patterns
      if (!isMarkdown && sourceSkippedWords.has(wrong)) continue;
      const pattern = new RegExp(`\\b${wrong}\\b`, 'iu');
      if (pattern.test(line)) {
        issues.push({
          line: index + 1,
          message: `Posible falta de tilde: "${wrong}" -> "${expected}".`,
        });
      }
    }
    for (const [pattern, expected] of phraseReplacements) {
      if (pattern.test(line)) {
        issues.push({
          line: index + 1,
          message: `Posible falta de tilde: usa "${expected}".`,
        });
      }
    }
  });
  return issues;
}

function findIssues(relativePath) {
  const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const ext = path.extname(relativePath);

  let lines;
  if (ext === '.md') {
    lines = visibleMarkdownLines(content);
  } else {
    lines = visibleSourceLines(content);
  }

  return findIssuesInLines(lines, ext);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const allIssues = targetFiles
  .filter((f) => !f.replace(/\\/g, '/').startsWith('scripts/check-spanish-docs')) // skip self
  .flatMap((relativePath) => findIssues(relativePath).map((issue) => ({ file: relativePath, ...issue })));

if (allIssues.length) {
  for (const issue of allIssues) {
    process.stdout.write(`${issue.file}:${issue.line} ${issue.message}\n`);
  }
  process.stdout.write(`Spanish docs spellcheck failed: ${allIssues.length} issue(s).\n`);
  process.exit(1);
}

const mdCount = targetFiles.filter((f) => f.endsWith('.md')).length;
const srcCount = targetFiles.filter((f) => !f.endsWith('.md')).length;
process.stdout.write(
  `Spanish docs spellcheck passed for ${targetFiles.length} file(s) (${mdCount} Markdown, ${srcCount} source).\n`,
);
