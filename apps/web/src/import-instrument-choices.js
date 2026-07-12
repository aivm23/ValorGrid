import { IMPORTED_GROUP_ID, IMPORTED_GROUP_NAME } from './import-workflow-helpers.js';

export function applyInstrumentChoices(ctx, payload, preview) {
  const choices = ctx.state.importInstrumentChoices || {};
  const rowsByIndex = new Map((preview.rows || []).map((row) => [row.rowIndex, row]));
  const newInstruments = [];
  const newGroups = [];
  const instrumentMappings = { ...(payload.instrumentMappings || {}) };
  const existingSymbols = new Set(
    (ctx.state.instruments || [])
      .filter((item) => item.type !== 'fx' && item.type !== 'cash')
      .map((item) => item.symbol),
  );
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
        type: String(create.type || 'stock')
          .trim()
          .toLowerCase(),
        currency: String(create.currency || 'EUR')
          .trim()
          .toUpperCase(),
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
