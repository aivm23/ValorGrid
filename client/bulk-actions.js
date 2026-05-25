export function attach(ctx) {
  function updateInstrumentSelection(event) {
    const checkbox = event.target.closest('[data-select-instrument]');
    if (!checkbox) return;
    const selected = new Set(ctx.state.selectedInstrumentSymbols || []);
    if (checkbox.checked) selected.add(checkbox.dataset.selectInstrument);
    else selected.delete(checkbox.dataset.selectInstrument);
    ctx.state.selectedInstrumentSymbols = [...selected];
    ctx.renderInstruments();
  }

  function updateTransactionSelection(event) {
    const checkbox = event.target.closest('[data-select-transaction]');
    if (!checkbox) return;
    const selected = new Set(ctx.state.selectedTransactionIds || []);
    if (checkbox.checked) selected.add(checkbox.dataset.selectTransaction);
    else selected.delete(checkbox.dataset.selectTransaction);
    ctx.state.selectedTransactionIds = [...selected];
    ctx.renderLedger();
  }

  function updateGroupSelection(event) {
    const checkbox = event.target.closest('[data-select-group]');
    if (!checkbox) return;
    const selected = new Set(ctx.state.selectedGroupIds || []);
    if (checkbox.checked) selected.add(checkbox.dataset.selectGroup);
    else selected.delete(checkbox.dataset.selectGroup);
    ctx.state.selectedGroupIds = [...selected];
    ctx.renderGroupRows();
  }

  function selectVisibleTransactions() {
    ctx.state.selectedTransactionIds = [
      ...new Set([...(ctx.state.selectedTransactionIds || []), ...(ctx.state.visibleTransactionIds || [])]),
    ];
    ctx.renderLedger();
  }

  function selectVisibleInstruments() {
    ctx.state.selectedInstrumentSymbols = [
      ...new Set([...(ctx.state.selectedInstrumentSymbols || []), ...(ctx.state.visibleInstrumentSymbols || [])]),
    ];
    ctx.renderInstruments();
  }

  function selectVisibleGroups() {
    ctx.state.selectedGroupIds = [...new Set([...(ctx.state.selectedGroupIds || []), ...(ctx.state.visibleGroupIds || [])])];
    ctx.renderGroupRows();
  }

  async function deleteSelectedTransactions() {
    const ids = ctx.state.selectedTransactionIds || [];
    if (!ids.length) return;
    if (!ctx.window.confirm(`Eliminar ${ids.length} movimiento(s) seleccionado(s)?`)) return;
    try {
      await Promise.all(
        ids.map(async (id) => {
          const response = await fetch('/api/transactions/' + encodeURIComponent(id), { method: 'DELETE', cache: 'no-store' });
          if (!response.ok) throw new Error(`No se pudo eliminar ${id}`);
        }),
      );
      ctx.state.selectedTransactionIds = [];
      ctx.state.historyCache = {};
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
    } catch (error) {
      ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
    }
  }

  async function deleteSelectedInstruments() {
    const symbols = ctx.state.selectedInstrumentSymbols || [];
    if (!symbols.length) return;
    if (!ctx.window.confirm(`Eliminar ${symbols.length} instrumento(s) seleccionado(s)?`)) return;
    try {
      await ctx.sendJson('/api/instruments', 'DELETE', { symbols });
      ctx.state.selectedInstrumentSymbols = [];
      ctx.state.historyCache = {};
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
    } catch (error) {
      ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
    }
  }

  async function deleteSelectedGroups() {
    const ids = ctx.state.selectedGroupIds || [];
    if (!ids.length) return;
    if (!ctx.window.confirm(`Eliminar ${ids.length} grupo(s) seleccionado(s)?`)) return;
    try {
      await ctx.sendJson('/api/instrument-groups', 'DELETE', { ids });
      ctx.state.selectedGroupIds = [];
      ctx.state.historyCache = {};
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
    } catch (error) {
      ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
    }
  }

  Object.assign(ctx, {
    updateInstrumentSelection,
    updateTransactionSelection,
    updateGroupSelection,
    selectVisibleTransactions,
    selectVisibleInstruments,
    selectVisibleGroups,
    deleteSelectedTransactions,
    deleteSelectedInstruments,
    deleteSelectedGroups,
  });
}
