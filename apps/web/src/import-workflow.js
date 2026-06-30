import {
  IMPORTED_GROUP_ID,
  IMPORTED_GROUP_NAME,
  FIELD_LABELS,
  isXlsxSource,
  canDownloadTemplate,
  suggestSymbol,
  parseMapping,
  rowsForDetected,
  shouldOmitInstrumentByDefault,
  inferInstrumentType,
  renderImportSourceOptions,
  renderImportProBanners,
} from './import-workflow-helpers.js';
import { updateImportFileDisplay } from './import-file-zone.js';

export {
  toBase64,
  isXlsxSource,
  canDownloadTemplate,
  parseMapping,
  getImportSourceDisplayName,
  getImportSourceOptionLabel,
  renderImportSourceOptions,
  renderImportProBanners,
} from './import-workflow-helpers.js';
export { updateImportFileDisplay, clearImportFile } from './import-file-zone.js';
export function resetImportDraft(ctx, options = {}) {
  if (options.resetSource && ctx.elements.importSource) ctx.elements.importSource.value = 'valorgrid-xlsx';
  ctx.state.importPreview = null;
  ctx.state.importRowActions = {};
  ctx.state.importRowMappings = {};
  ctx.state.importRowEdits = {};
  ctx.state.importInstrumentChoices = {};
  ctx.state.importInstrumentChoicesSnapshot = null;
  ctx.state.importConfirmedSteps = {};
  ctx.state.importOperationFilter = 'all';
  ctx.state.importStep = 'file';
  ctx.state.importInstrumentValidationAttempted = false;
  ctx.state.importFileMeta = null;
  ctx.elements.importFile.value = '';
  if (updateImportFileDisplay) updateImportFileDisplay(ctx, null);
  ctx.elements.importSheet.innerHTML = '';
  ctx.elements.importSheetField.hidden = true;
  ctx.elements.importContent.value = '';
  ctx.elements.importMapping.value = '';
  ctx.elements.importFeedback.textContent = '';
  ctx.elements.importPreviewOutput.innerHTML = '';
  ctx.elements.importMappingRequired.hidden = true;
  ctx.elements.importMappingRequired.innerHTML = '';
  ctx.elements.importPreview.hidden = false;
  ctx.elements.importPreview.disabled = true;
  ctx.elements.importCommit.disabled = true;
  ctx.elements.importCommit.hidden = true;
  syncImportMode(ctx);
}

export function invalidateImportAfter(ctx, step) {
  const rank = { file: 0, instruments: 1, operations: 2, confirm: 3 };
  const threshold = rank[step] ?? 0;
  ctx.state.importConfirmedSteps = Object.fromEntries(
    Object.entries(ctx.state.importConfirmedSteps || {}).filter(([key]) => (rank[key] ?? 0) <= threshold),
  );
}

export function syncImportMode(ctx) {
  const source = ctx.elements.importSource.value || 'valorgrid-xlsx';
  const xlsxMode = isXlsxSource(source);
  const canDownload = canDownloadTemplate(source);
  ctx.elements.importContent.closest('.field').hidden = true;
  ctx.elements.importMapping.closest('.import-advanced-options').hidden = true;
  ctx.elements.importTemplateDownload.hidden = !canDownload;
  ctx.elements.importFile.accept = xlsxMode ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (!xlsxMode) {
    ctx.elements.importSheetField.hidden = true;
    ctx.elements.importSheet.innerHTML = '';
  }
}



export function snapshotInstrumentChoices(ctx) {
  ctx.state.importInstrumentChoicesSnapshot = JSON.parse(JSON.stringify(ctx.state.importInstrumentChoices || {}));
}

export function ensureInstrumentChoices(ctx, preview) {
  const detected = preview?.detectedInstruments || [];
  const existingSymbols = new Set((ctx.state.instruments || []).filter((item) => item.type !== 'fx' && item.type !== 'cash').map((item) => item.symbol));
  const snapshot = ctx.state.importInstrumentChoicesSnapshot;
  if (snapshot) {
    const snapshotByIsin = new Map();
    for (const [key, choice] of Object.entries(snapshot)) {
      const isin = key.startsWith('isin:') ? key.slice(5) : null;
      if (isin) snapshotByIsin.set(isin.toUpperCase(), choice);
    }
    for (const item of detected) {
      if (ctx.state.importInstrumentChoices[item.key]) continue;
      const isin = item.isin?.toUpperCase();
      const orphanedChoice = isin ? snapshotByIsin.get(isin) : null;
      if (orphanedChoice) {
        ctx.state.importInstrumentChoices[item.key] = JSON.parse(JSON.stringify(orphanedChoice));
        if (ctx.state.importInstrumentChoices[item.key].action === 'create' && ctx.state.importInstrumentChoices[item.key].create) {
          ctx.state.importInstrumentChoices[item.key].create.tickerSuggestions = item.tickerSuggestions || [];
        }
      }
    }
  }
  for (const item of detected) {
    const existing = ctx.state.importInstrumentChoices[item.key];
    if (existing) {
      if (existing.action === 'create' && existing.create) {
        existing.create.tickerSuggestions = item.tickerSuggestions || existing.create.tickerSuggestions || [];
      }
      continue;
    }
    const omitByDefault = shouldOmitInstrumentByDefault(preview, item);
    const resolvedSymbol = existingSymbols.has(item.symbol) ? item.symbol : '';
    const autoSuggestion = item.tickerSuggestions?.[0]?.yahooSymbol || '';
    ctx.state.importInstrumentChoices[item.key] = {
      action: omitByDefault ? 'omit' : resolvedSymbol ? 'map' : 'create',
      symbol: resolvedSymbol,
      create: {
        symbol: autoSuggestion ? String(autoSuggestion).replace(/\.[A-Z]+$/, '').slice(0, 10) : suggestSymbol(item.label),
        yahooSymbol: autoSuggestion,
        name: item.tickerSuggestions?.[0]?.displayName || item.label || '',
        type: inferInstrumentType(item),
        currency: item.tickerSuggestions?.[0]?.currency || item.currency || 'EUR',
        groupId: IMPORTED_GROUP_ID,
        color: '#2563eb',
        tickerSuggestions: item.tickerSuggestions || [],
      },
    };
  }
}

export function unresolvedInstrumentItems(ctx, preview) {
  const choices = ctx.state.importInstrumentChoices || {};
  const existingSymbols = new Set((ctx.state.instruments || []).filter((item) => item.type !== 'fx' && item.type !== 'cash').map((item) => item.symbol));
  return (preview?.detectedInstruments || []).filter((item) => {
    const choice = choices[item.key] || {};
    if (choice.action === 'omit') return false;
    if (choice.action === 'map') return !choice.symbol || !existingSymbols.has(choice.symbol);
    if (choice.action === 'create') {
      const create = choice.create || {};
      return !create.symbol || !create.yahooSymbol || !create.name || !create.type || !create.currency;
    }
    const rows = rowsForDetected(preview, item);
    const relevant = rows.filter((row) => !['ignored', 'duplicate', 'skipped'].includes(row.status));
    if (!relevant.length) return false;
    return item.resolutionStatus === 'needs_mapping';
  });
}

export function isInstrumentChoiceComplete(ctx, item, choice = {}) {
  const existingSymbols = new Set((ctx.state.instruments || []).filter((entry) => entry.type !== 'fx' && entry.type !== 'cash').map((entry) => entry.symbol));
  if (choice.action === 'omit') return true;
  if (choice.action === 'map') return Boolean(String(choice.symbol || '').trim() && existingSymbols.has(String(choice.symbol || '').trim().toUpperCase()));
  if (choice.action === 'create') {
    const create = choice.create || {};
    return ['symbol', 'yahooSymbol', 'name', 'type', 'currency'].every((field) => String(create[field] || '').trim());
  }
  return item.resolutionStatus !== 'needs_mapping';
}



export function unresolvedInstrumentDetails(ctx, preview) {
  const choices = ctx.state.importInstrumentChoices || {};
  const existingSymbols = new Set((ctx.state.instruments || []).filter((item) => item.type !== 'fx' && item.type !== 'cash').map((item) => item.symbol));
  const details = [];
  for (const item of preview?.detectedInstruments || []) {
    const choice = choices[item.key] || {};
    if (choice.action === 'omit') continue;
    if (choice.action === 'map') {
      if (!choice.symbol || !existingSymbols.has(choice.symbol)) {
        details.push({ label: item.label || item.key, missing: ['instrumento destino'] });
      }
      continue;
    }
    if (choice.action === 'create') {
      const create = choice.create || {};
      const missing = ['symbol', 'yahooSymbol', 'name', 'type', 'currency']
        .filter((field) => !String(create[field] || '').trim())
        .map((field) => FIELD_LABELS[field] || field);
      if (missing.length) details.push({ label: item.label || item.key, missing });
      continue;
    }
    const rows = rowsForDetected(preview, item);
    const relevant = rows.filter((row) => !['ignored', 'duplicate', 'skipped'].includes(row.status));
    if (relevant.length && item.resolutionStatus === 'needs_mapping') {
      details.push({ label: item.label || item.key, missing: ['asignar instrumento'] });
    }
  }
  return details;
}

export function canAdvanceImportStep(ctx, step) {
  const preview = ctx.state.importPreview;
  if (step === 'file') return !!preview;
  if (step === 'instruments') return !!preview && unresolvedInstrumentItems(ctx, preview).length === 0;
  if (step === 'operations') {
    const rows = preview?.rows || [];
    return rows.some((row) => row.status === 'valid' || ['duplicate', 'ignored', 'skipped'].includes(row.status));
  }
  return !!preview?.canCommit;
}

export function ensureDefaultRowActions(ctx, preview = ctx.state.importPreview) {
  for (const row of preview?.rows || []) {
    if (ctx.state.importRowActions?.[row.rowIndex]) continue;
    ctx.state.importRowActions[row.rowIndex] = row.status === 'valid' ? 'import' : 'skip';
  }
}

export function applyImportGroupAction(ctx, groupAction) {
  if (!['import', 'skip'].includes(groupAction.value)) return;
  const wantsImport = groupAction.value === 'import';
  const rowIndexes = String(groupAction.dataset.importGroupAction || '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  for (const rowIndex of rowIndexes) {
    ctx.state.importRowActions[rowIndex] = wantsImport ? 'import' : 'skip';
  }
}

function applyInstrumentChoices(ctx, payload, preview) {
  const choices = ctx.state.importInstrumentChoices || {};
  const rowsByIndex = new Map((preview.rows || []).map((row) => [row.rowIndex, row]));
  const newInstruments = [];
  const newGroups = [];
  const instrumentMappings = { ...(payload.instrumentMappings || {}) };
  const existingSymbols = new Set((ctx.state.instruments || []).filter((item) => item.type !== 'fx' && item.type !== 'cash').map((item) => item.symbol));
  const existingGroups = new Set((ctx.state.groups || []).map((item) => item.id));
  for (const item of preview.detectedInstruments || []) {
    const choice = choices[item.key];
    if (!choice) continue;
    const rowIndexes = item.rowIndexes || [];
    if (choice.action === 'omit') {
      rowIndexes.forEach((rowIndex) => {
        payload.rowActions[rowIndex] = 'skip';
      });
      continue;
    }
    if (choice.action === 'map' && choice.symbol && existingSymbols.has(choice.symbol)) {
      instrumentMappings[item.key] = choice.symbol;
      rowIndexes.forEach((rowIndex) => {
        payload.rowMappings[rowIndex] = { symbol: choice.symbol };
        const row = rowsByIndex.get(rowIndex);
        if (row?.status === 'needs_mapping') payload.rowActions[rowIndex] = 'import';
      });
      continue;
    }
    if (choice.action === 'create') {
      const create = choice.create || {};
      if (!create.symbol || !create.yahooSymbol || !create.name || !create.type || !create.currency) continue;
      const symbol = String(create.symbol).trim().toUpperCase();
      if (!existingGroups.has(IMPORTED_GROUP_ID) && !newGroups.some((group) => group.id === IMPORTED_GROUP_ID)) {
        newGroups.push({ id: IMPORTED_GROUP_ID, name: IMPORTED_GROUP_NAME, color: '#64748b' });
      }
      instrumentMappings[item.key] = symbol;
      newInstruments.push({
        symbol,
        yahooSymbol: String(create.yahooSymbol || symbol).trim(),
        name: String(create.name || symbol).trim(),
        type: String(create.type || 'stock').trim().toLowerCase(),
        currency: String(create.currency || 'EUR').trim().toUpperCase(),
        groupId: IMPORTED_GROUP_ID,
        color: String(create.color || '#2563eb').trim(),
      });
      rowIndexes.forEach((rowIndex) => {
        payload.rowMappings[rowIndex] = { symbol };
        const row = rowsByIndex.get(rowIndex);
        if (row?.status === 'needs_mapping') payload.rowActions[rowIndex] = 'import';
      });
    }
  }
  payload.instrumentMappings = instrumentMappings;
  payload.newInstruments = newInstruments;
  payload.newGroups = newGroups;
}

export function buildImportPayload(ctx) {
  const source = ctx.elements.importSource.value || 'valorgrid-xlsx';
  const payload = {
    source,
    filename: ctx.state.importFileMeta?.name || ctx.elements.importFile.files?.[0]?.name || null,
    mapping: parseMapping(ctx.elements.importMapping.value),
    rowActions: { ...(ctx.state.importRowActions || {}) },
    rowMappings: { ...(ctx.state.importRowMappings || {}) },
    rowEdits: { ...(ctx.state.importRowEdits || {}) },
  };
  if (isXlsxSource(source)) {
    payload.contentBase64 = ctx.state.importFileMeta?.contentBase64 || '';
    payload.sheetName = ctx.elements.importSheet.value || null;
  } else {
    payload.content = ctx.elements.importContent.value;
  }
  if (ctx.state.importPreview) applyInstrumentChoices(ctx, payload, ctx.state.importPreview);
  return payload;
}

export function applySuggestionToChoice(ctx, key, suggestion) {
  const choice = ctx.state.importInstrumentChoices?.[key];
  if (!choice || !suggestion) return;
  const prev = choice.create || {};
  choice.action = 'create';
  choice.create = {
    ...prev,
    yahooSymbol: String(suggestion.yahooSymbol || prev.yahooSymbol || '').trim().toUpperCase(),
    symbol: String(suggestion.yahooSymbol || prev.symbol || '')
      .trim()
      .toUpperCase()
      .replace(/\.[A-Z]+$/, '')
      .slice(0, 10),
    name: String(suggestion.displayName || prev.name || '').trim(),
    currency: String(suggestion.currency || prev.currency || 'EUR').trim().toUpperCase(),
    color: prev.color || '#2563eb',
    type: prev.type || 'stock',
    groupId: prev.groupId || IMPORTED_GROUP_ID,
  };
}

export function updateSheetSelector(ctx, preview) {
  const sheets = preview?.sheets || [];
  const show = sheets.length > 0;
  ctx.elements.importSheetField.hidden = !show;
  if (!show) {
    ctx.elements.importSheet.innerHTML = '';
    return;
  }
  const selected = preview.selectedSheet || preview.sheetName || sheets[0];
  ctx.elements.importSheet.innerHTML = sheets
    .map((sheet) => `<option value="${ctx.escapeHtml(sheet)}"${sheet === selected ? ' selected' : ''}>${ctx.escapeHtml(sheet)}</option>`)
    .join('');
}

export function updateCommitButton(ctx) {
  ctx.elements.importCommit.disabled = true;
  ctx.elements.importCommit.hidden = true;
  ctx.elements.importCommit.textContent = ctx.t('import.actions.next.default');
}

export async function downloadImportTemplate(ctx) {
  try {
    const response = await fetch('/api/import/template.xlsx');
    if (!response.ok) throw new Error('No se pudo descargar la plantilla');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ValorGrid_Plantilla_Importación.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch (error) {
    ctx.elements.importFeedback.textContent = ctx.normalizeErrorMessage(error);
  }
}

export async function loadImportSources(ctx) {
  try {
    const { sources = [] } = await ctx.fetchJson('/api/import/sources');
    const select = ctx.elements.importSource;
    const bannersContainer = ctx.elements.importProBanners;
    if (!select) return;
    const edition = ctx.state?.edition || 'community';

    select.innerHTML = renderImportSourceOptions(sources, edition, ctx.escapeHtml, ctx.t);
    const selectedOption = select.options[select.selectedIndex];
    if (select.querySelector('option[value="valorgrid-xlsx"]') && (!select.value || selectedOption?.disabled)) {
      select.value = 'valorgrid-xlsx';
    }

    if (bannersContainer) {
      const html = renderImportProBanners(sources, edition, ctx.escapeHtml, ctx.t);
      if (html) {
        bannersContainer.innerHTML = html;
        bannersContainer.hidden = false;
      } else {
        bannersContainer.innerHTML = '';
        bannersContainer.hidden = true;
      }
    }
  } catch {
    if (ctx.elements.importProBanners) {
      ctx.elements.importProBanners.innerHTML = '';
      ctx.elements.importProBanners.hidden = true;
    }
  }
}
