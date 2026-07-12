const { brandPaletteColor } = require('../../shared/brand-palette');

function attachBrandPalette(ctx) {
  const { repositories, invalidateLedger, getToday } = ctx;
  const instrumentRepository = repositories.instruments;
  const metaRepository = repositories.meta;

  const {
    listActiveInstruments,
    listActiveInstrumentGroups,
    findGroupById,
    findInstrumentBySymbol,
    countTransactionsBySymbol,
    updateInstrumentColor,
    updateGroupColor,
    updateTransactionColorBySymbol,
    getOldestTransactionDateForSymbols,
  } = instrumentRepository;

  function isBrandPaletteEnabled() {
    const value = metaRepository?.getMetaValueByKey?.('brand_palette_enabled');
    return value === '1';
  }

  function buildBrandPaletteColorSnapshot() {
    const groups = listActiveInstrumentGroups().filter((g) => !SKIP_GROUP_IDS.has(g.id));
    const instruments = listActiveInstruments().filter((i) => i.type !== 'fx');

    const groupColors = {};
    for (const group of groups) {
      groupColors[group.id] = group.color;
    }

    const instrumentColors = {};
    for (const inst of instruments) {
      instrumentColors[inst.symbol] = inst.color;
    }

    return {
      createdAt: new Date().toISOString(),
      version: 1,
      groups: groupColors,
      instruments: instrumentColors,
    };
  }

  function getBrandPaletteColorSnapshot() {
    const raw = metaRepository?.getMetaValueByKey?.('brand_palette_previous_colors');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveBrandPaletteColorSnapshot(snapshot) {
    metaRepository.setMetaValueByKey('brand_palette_previous_colors', snapshot);
  }

  function clearBrandPaletteColorSnapshot() {
    metaRepository.setMetaValueByKey('brand_palette_previous_colors', '');
  }

  const SKIP_GROUP_IDS = new Set(['general', 'importados']);

  function applyBrandPaletteToGroups() {
    const groups = listActiveInstrumentGroups().filter((g) => !SKIP_GROUP_IDS.has(g.id));
    groups.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.id.localeCompare(b.id);
    });

    let updatedCount = 0;
    for (let i = 0; i < groups.length; i++) {
      updateGroupColor(groups[i].id, brandPaletteColor(i));
      updatedCount++;
    }

    return updatedCount;
  }

  function applyBrandPaletteToInstruments() {
    const instruments = listActiveInstruments().filter((i) => i.type !== 'fx');
    instruments.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.symbol.localeCompare(b.symbol);
    });

    let updatedCount = 0;
    for (let i = 0; i < instruments.length; i++) {
      const color = brandPaletteColor(i);
      updateInstrumentColor(instruments[i].symbol, color);
      updateTransactionColorBySymbol(instruments[i].symbol, color);
      updatedCount++;
    }

    return updatedCount;
  }

  function applyBrandPalette() {
    const updatedGroups = applyBrandPaletteToGroups();
    const updatedInstruments = applyBrandPaletteToInstruments();

    const symbols = (listActiveInstruments() || []).filter((i) => i.type !== 'fx').map((i) => i.symbol);
    const oldestDate = getOldestTransactionDateForSymbols(symbols);
    invalidateLedger(oldestDate || getToday(), 'brand-palette');

    const updatedTransactions = symbols.reduce((sum, sym) => sum + countTransactionsBySymbol(sym), 0);

    return { updatedGroups, updatedInstruments, updatedTransactions };
  }

  function restoreBrandPaletteColorSnapshot(snapshot) {
    let restoredGroups = 0;
    let restoredInstruments = 0;
    const updatedSymbols = [];

    if (snapshot?.groups) {
      for (const [id, color] of Object.entries(snapshot.groups)) {
        const group = findGroupById(id);
        if (group) {
          updateGroupColor(id, color);
          restoredGroups++;
        }
      }
    }

    if (snapshot?.instruments) {
      for (const [symbol, color] of Object.entries(snapshot.instruments)) {
        const inst = findInstrumentBySymbol(symbol);
        if (inst) {
          updateInstrumentColor(symbol, color);
          updateTransactionColorBySymbol(symbol, color);
          restoredInstruments++;
          updatedSymbols.push(symbol);
        }
      }
    }

    const oldestDate = getOldestTransactionDateForSymbols(updatedSymbols);
    if (oldestDate) {
      invalidateLedger(oldestDate, 'brand-palette-restore');
    } else if (updatedSymbols.length > 0) {
      invalidateLedger(getToday(), 'brand-palette-restore');
    }

    const updatedTransactions = updatedSymbols.reduce((sum, sym) => sum + countTransactionsBySymbol(sym), 0);

    return { restoredGroups, restoredInstruments, updatedTransactions };
  }

  function setBrandPaletteEnabled(enabled) {
    if (enabled) {
      const existingSnapshot = getBrandPaletteColorSnapshot();
      let snapshotCreated = false;
      let snapshotReused = false;

      if (!existingSnapshot) {
        saveBrandPaletteColorSnapshot(buildBrandPaletteColorSnapshot());
        snapshotCreated = true;
      } else {
        snapshotReused = true;
      }

      const result = applyBrandPalette();
      metaRepository.setMetaValueByKey('brand_palette_enabled', '1');

      return { brandPaletteEnabled: true, snapshotCreated, snapshotReused, ...result };
    }

    const snapshot = getBrandPaletteColorSnapshot();

    if (snapshot) {
      const restoreResult = restoreBrandPaletteColorSnapshot(snapshot);
      clearBrandPaletteColorSnapshot();
      metaRepository.setMetaValueByKey('brand_palette_enabled', '0');
      return { brandPaletteEnabled: false, ...restoreResult, snapshotCleared: true };
    }

    metaRepository.setMetaValueByKey('brand_palette_enabled', '0');
    return {
      brandPaletteEnabled: false,
      restoredGroups: 0,
      restoredInstruments: 0,
      updatedTransactions: 0,
      snapshotCleared: false,
      warning: 'No previous color snapshot was available',
    };
  }

  return {
    isBrandPaletteEnabled,
    setBrandPaletteEnabled,
    applyBrandPalette,
    applyBrandPaletteToGroups,
    applyBrandPaletteToInstruments,
    buildBrandPaletteColorSnapshot,
    getBrandPaletteColorSnapshot,
    saveBrandPaletteColorSnapshot,
    clearBrandPaletteColorSnapshot,
    restoreBrandPaletteColorSnapshot,
  };
}

module.exports = { attachBrandPalette };
