export function attach(ctx) {
  const SKIP_GROUP_IDS = new Set(['general', 'importados']);
  const BRAND_PALETTE_COLORS = [
    '#06b6d4', '#8b5cf6', '#4989e5', '#27a0dd', '#6a73ee',
    '#17abd8', '#3894e1', '#597ee9', '#7a67f2', '#0eb0d6',
    '#1fa5da', '#309adf', '#408fe3', '#5183e7', '#6178eb',
    '#726df0', '#8362f4', '#0ab3d5', '#12aed7', '#1ba8d9',
  ];

  function computeBrandColor(index) {
    return BRAND_PALETTE_COLORS[index % BRAND_PALETTE_COLORS.length];
  }

  function countPaletteGroups() {
    return (ctx.state.groups || []).filter((g) => !SKIP_GROUP_IDS.has(g.id)).length;
  }

  function countPaletteInstruments() {
    return (ctx.state.instruments || []).filter((i) => i.type !== 'fx').length;
  }

  function syncBrandPaletteUi() {
    const enabled = ctx.state.brandPaletteEnabled === true;
    if (ctx.elements.brandPaletteEnabled) {
      ctx.elements.brandPaletteEnabled.checked = enabled;
    }
    document.body.classList.toggle('brand-palette-locked', enabled);

    const colorInputs = document.querySelectorAll(
      '#new-group-color, #new-instrument-color, ' +
      '#wizard-group-color, #wizard-instrument-color, ' +
      'input[data-field="color"], input[data-group-field="color"]'
    );
    colorInputs.forEach((input) => {
      input.disabled = enabled;
    });

    if (enabled) {
      const groupColor = computeBrandColor(countPaletteGroups());
      const instrumentColor = computeBrandColor(countPaletteInstruments());
      if (ctx.elements.newGroupColor) ctx.elements.newGroupColor.value = groupColor;
      if (ctx.elements.newInstrumentColor) ctx.elements.newInstrumentColor.value = instrumentColor;
      if (ctx.elements.wizardGroupColor) ctx.elements.wizardGroupColor.value = groupColor;
      if (ctx.elements.wizardInstrumentColor) ctx.elements.wizardInstrumentColor.value = instrumentColor;
    }
  }

  function colorInputsDisabledAttr() {
    return ctx.state.brandPaletteEnabled ? 'disabled' : '';
  }

  async function handleBrandPaletteToggle(ctx) {
    const checkbox = ctx.elements.brandPaletteEnabled;
    if (!checkbox) return;
    const enabled = checkbox.checked;
    checkbox.disabled = true;
    try {
      const result = await ctx.sendJson('/api/instruments/brand-palette', 'PUT', { enabled });
      ctx.state.brandPaletteEnabled = result.brandPaletteEnabled === true;

      if (enabled) {
        let msg = '';
        if (result.snapshotCreated) {
          msg = 'Colores actuales guardados. ';
        } else if (result.snapshotReused) {
          msg = 'Paleta corporativa aplicada usando la copia de colores anterior como punto de restauraci\u00f3n. ';
        }
        msg += `Paleta corporativa aplicada a ${result.updatedGroups || 0} grupos y ${result.updatedInstruments || 0} valores.`;
        ctx.elements.priceStatus.textContent = msg;
      } else {
        if (result.snapshotCleared) {
          ctx.elements.priceStatus.textContent = 'Paleta autom\u00e1tica desactivada. Se han restaurado los colores anteriores.';
        } else {
          ctx.elements.priceStatus.textContent = 'Paleta autom\u00e1tica desactivada. No hab\u00eda copia previa de colores.';
        }
      }

      ctx.state.historyCache = {};
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
      syncBrandPaletteUi();
    } catch (error) {
      checkbox.checked = !enabled;
      ctx.elements.priceStatus.textContent = ctx.normalizeErrorMessage(error);
    } finally {
      checkbox.disabled = false;
    }
  }

  Object.assign(ctx, {
    syncBrandPaletteUi,
    colorInputsDisabledAttr,
    handleBrandPaletteToggle,
  });
}