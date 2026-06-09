const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const targetFiles = ['README.md', ...collectMarkdown(path.join(repoRoot, 'docs')).map((file) => path.relative(repoRoot, file))];

const replacements = [
  ['aplicacion', 'aplicación'],
  ['automaticamente', 'automáticamente'],
  ['autenticacion', 'autenticación'],
  ['calculos', 'cálculos'],
  ['codigo', 'código'],
  ['comision', 'comisión'],
  ['configuracion', 'configuración'],
  ['contrasena', 'contraseña'],
  ['corrupcion', 'corrupción'],
  ['deduplicacion', 'deduplicación'],
  ['diagnostico', 'diagnóstico'],
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
  ['maquina', 'máquina'],
  ['metricas', 'métricas'],
  ['modulo', 'módulo'],
  ['modulos', 'módulos'],
  ['normalizacion', 'normalización'],
  ['operacion', 'operación'],
  ['pagina', 'página'],
  ['politica', 'política'],
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
  ['validacion', 'validación'],
  ['vacio', 'vacío'],
  ['version', 'versión'],
];

const phraseReplacements = [
  [/\besta\s+(configurado|completo|ignorado|vac[ií]o)\b/iu, 'está $1'],
  [/\bdetras\b/iu, 'detrás'],
  [/\bmas\b/iu, 'más'],
  [/\banaden\b/iu, 'añaden'],
  [/\bdevolvio\b/iu, 'devolvió'],
];

const inlineCodePattern = /`[^`]*`/g;
const markdownLinkTargetPattern = /(\!?\[[^\]]*\])\([^)]+\)/g;
const mojibakePattern = /[ÃÂ�]/;
const replacementQuestionMarkPattern = /[\p{L}]\?[\p{L}]/u;

function collectMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectMarkdown(absolute);
    return entry.isFile() && entry.name.endsWith('.md') ? [absolute] : [];
  });
}

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

function findIssues(relativePath) {
  const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const lines = visibleMarkdownLines(content);
  const issues = [];

  lines.forEach((line, index) => {
    if (mojibakePattern.test(line)) {
      issues.push({
        line: index + 1,
        message: 'Texto con mojibake o carácter de reemplazo; revisa la codificación UTF-8.',
      });
    }
    if (replacementQuestionMarkPattern.test(line)) {
      issues.push({
        line: index + 1,
        message: 'Texto con "?" incrustado en una palabra; revisa una posible tilde perdida.',
      });
    }

    for (const [wrong, expected] of replacements) {
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

const allIssues = targetFiles.flatMap((relativePath) =>
  findIssues(relativePath).map((issue) => ({ file: relativePath, ...issue })),
);

if (allIssues.length) {
  for (const issue of allIssues) {
    process.stdout.write(`${issue.file}:${issue.line} ${issue.message}\n`);
  }
  process.stdout.write(`Spanish docs spellcheck failed: ${allIssues.length} issue(s).\n`);
  process.exit(1);
}

process.stdout.write(`Spanish docs spellcheck passed for ${targetFiles.length} Markdown file(s).\n`);
