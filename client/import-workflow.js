export function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function isXlsxSource(source) {
  return source === 'generic-xlsx';
}

function suggestSymbol(label = '') {
  const cleaned = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('')
    .toUpperCase();
  return cleaned.slice(0, 10) || 'NEW01';
}

export function resetImportDraft(ctx) {
  ctx.state.importPreview = null;
  ctx.state.importRowActions = {};
  ctx.state.importRowMappings = {};
  ctx.state.importRowEdits = {};
  ctx.state.importInstrumentChoices = {};
  ctx.state.importConfirmedSteps = {};
  ctx.state.importOperationFilter = 'all';
  ctx.state.importStep = 'file';
  ctx.state.importInstrumentValidationAttempted = false;
  ctx.state.importFileMeta = null;
  ctx.elements.importFile.value = '';
  ctx.elements.importSheet.innerHTML = '';
  ctx.elements.importSheetField.hidden = true;
  ctx.elements.importContent.value = '';
  ctx.elements.importMapping.value = '';
  ctx.elements.importFeedback.textContent = '';
  ctx.elements.importPreviewOutput.innerHTML = '';
  ctx.elements.importMappingRequired.hidden = true;
  ctx.elements.importMappingRequired.innerHTML = '';
  ctx.elements.importCommit.disabled = true;
  ctx.elements.importCommit.hidden = true;
}

export function invalidateImportAfter(ctx, step) {
  const rank = { file: 0, instruments: 1, operations: 2, confirm: 3 };
  const threshold = rank[step] ?? 0;
  ctx.state.importConfirmedSteps = Object.fromEntries(
    Object.entries(ctx.state.importConfirmedSteps || {}).filter(([key]) => (rank[key] ?? 0) <= threshold),
  );
}

export function syncImportMode(ctx) {
  const source = ctx.elements.importSource.value || 'generic-csv';
  const xlsxMode = isXlsxSource(source);
  ctx.elements.importContent.closest('.field').hidden = true;
  ctx.elements.importMapping.closest('.import-advanced-options').hidden = true;
  if (!xlsxMode) {
    ctx.elements.importSheetField.hidden = true;
    ctx.elements.importSheet.innerHTML = '';
  }
}

export function parseMapping(rawText = '') {
  const raw = String(rawText || '').trim();
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El mapping debe ser un JSON válido');
  }
  return value;
}

function rowsForDetected(preview, item) {
  const indexes = new Set(item.rowIndexes || []);
  return (preview.rows || []).filter((row) => indexes.has(row.rowIndex));
}

function shouldOmitInstrumentByDefault(preview, item) {
  const rows = rowsForDetected(preview, item);
  if (!rows.length) return false;
  const productText = `${item.label || ''} ${item.isin || ''}`.toUpperCase();
  const hasCorporateActionHint = /\b(RTS?|RIGHTS?|NON\s*TRADEABLE)\b/.test(productText);
  const allIgnored = rows.every((row) => row.status === 'ignored' || row.rowKind === 'corporate_action_ignored');
  if (hasCorporateActionHint || allIgnored) return true;
  const unresolvedSellOnly = item.resolutionStatus === 'needs_mapping' && Number(item.sells || 0) > 0 && Number(item.buys || 0) === 0;
  return unresolvedSellOnly;
}

export function ensureInstrumentChoices(ctx, preview) {
  const detected = preview?.detectedInstruments || [];
  const existingSymbols = new Set((ctx.state.instruments || []).filter((item) => item.type !== 'fx').map((item) => item.symbol));
  for (const item of detected) {
    if (ctx.state.importInstrumentChoices[item.key]) continue;
    const resolvedSymbol = existingSymbols.has(item.symbol) ? item.symbol : '';
    const omitByDefault = shouldOmitInstrumentByDefault(preview, item);
    ctx.state.importInstrumentChoices[item.key] = {
      action: omitByDefault ? 'omit' : resolvedSymbol ? 'map' : 'create',
      symbol: resolvedSymbol,
      create: {
        symbol: suggestSymbol(item.label),
        yahooSymbol: item.tickerSuggestions?.[0]?.yahooSymbol || '',
        name: item.label || '',
        type: 'stock',
        currency: item.currency || 'EUR',
        groupId: (ctx.state.groups || [])[0]?.id || '',
        color: '#2563eb',
      },
    };
  }
}

export function unresolvedInstrumentItems(ctx, preview) {
  const choices = ctx.state.importInstrumentChoices || {};
  const existingSymbols = new Set((ctx.state.instruments || []).filter((item) => item.type !== 'fx').map((item) => item.symbol));
  return (preview?.detectedInstruments || []).filter((item) => {
    const choice = choices[item.key] || {};
    if (choice.action === 'omit') return false;
    if (choice.action === 'map') return !choice.symbol || !existingSymbols.has(choice.symbol);
    if (choice.action === 'create') {
      const create = choice.create || {};
      return !create.symbol || !create.yahooSymbol || !create.name || !create.groupId || !create.type || !create.currency;
    }
    const rows = rowsForDetected(preview, item);
    const relevant = rows.filter((row) => !['ignored', 'duplicate', 'skipped'].includes(row.status));
    if (!relevant.length) return false;
    return item.resolutionStatus === 'needs_mapping';
  });
}

export function isInstrumentChoiceComplete(ctx, item, choice = {}) {
  const existingSymbols = new Set((ctx.state.instruments || []).filter((entry) => entry.type !== 'fx').map((entry) => entry.symbol));
  if (choice.action === 'omit') return true;
  if (choice.action === 'map') return Boolean(String(choice.symbol || '').trim() && existingSymbols.has(String(choice.symbol || '').trim().toUpperCase()));
  if (choice.action === 'create') {
    const create = choice.create || {};
    return ['symbol', 'yahooSymbol', 'name', 'groupId', 'type', 'currency'].every((field) => String(create[field] || '').trim());
  }
  return item.resolutionStatus !== 'needs_mapping';
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

function applyInstrumentChoices(ctx, payload, preview) {
  const choices = ctx.state.importInstrumentChoices || {};
  const rowsByIndex = new Map((preview.rows || []).map((row) => [row.rowIndex, row]));
  const newInstruments = [];
  const instrumentMappings = { ...(payload.instrumentMappings || {}) };
  const existingSymbols = new Set((ctx.state.instruments || []).filter((item) => item.type !== 'fx').map((item) => item.symbol));
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
      if (!create.symbol || !create.yahooSymbol || !create.name || !create.groupId || !create.type || !create.currency) continue;
      const symbol = String(create.symbol).trim().toUpperCase();
      instrumentMappings[item.key] = symbol;
      newInstruments.push({
        symbol,
        yahooSymbol: String(create.yahooSymbol || symbol).trim(),
        name: String(create.name || symbol).trim(),
        type: String(create.type || 'stock').trim().toLowerCase(),
        currency: String(create.currency || 'EUR').trim().toUpperCase(),
        groupId: String(create.groupId || '').trim(),
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
  payload.newGroups = [];
}

export function buildImportPayload(ctx) {
  const source = ctx.elements.importSource.value || 'generic-csv';
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
  choice.action = 'create';
  choice.create = {
    ...(choice.create || {}),
    yahooSymbol: String(suggestion.yahooSymbol || '').trim().toUpperCase(),
    symbol: String(suggestion.yahooSymbol || choice.create?.symbol || '')
      .trim()
      .toUpperCase()
      .replace(/\.[A-Z]+$/, '')
      .slice(0, 10),
    name: String(suggestion.displayName || choice.create?.name || '').trim(),
    currency: String(suggestion.currency || choice.create?.currency || 'EUR').trim().toUpperCase(),
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
  ctx.elements.importCommit.textContent = 'Importar operaciones seleccionadas';
}
