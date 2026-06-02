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

  function toggleTransactionRow(event) {
    const row = event.target.closest('tr[data-transaction-id]');
    if (!row || event.target.closest('[data-select-transaction]')) return;
    const id = row.dataset.transactionId;
    const selected = new Set(ctx.state.selectedTransactionIds || []);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
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

  function deselectAllTransactions() {
    ctx.state.selectedTransactionIds = [];
    ctx.renderLedger();
  }

  function deselectAllInstruments() {
    ctx.state.selectedInstrumentSymbols = [];
    ctx.renderInstruments();
  }

  function deselectAllGroups() {
    ctx.state.selectedGroupIds = [];
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

    try {
      const response = await fetch('/api/instruments/preview-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('No se pudo obtener la vista previa de eliminación');
      const data = await response.json();
      showInstrumentDeletePreview(data.results || []);
    } catch (error) {
      ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
    }
  }

  function showInstrumentDeletePreview(results) {
    const blocked = results.filter((r) => r.blocked);
    const allowed = results.filter((r) => !r.blocked);

    let html = '';
    if (blocked.length) {
      html += '<div class="delete-preview-section"><h3>Bloqueados</h3>';
      html += '<ul class="delete-preview-list">';
      for (const item of blocked) {
        html += `<li class="delete-item blocked"><strong>${ctx.escapeHtml(item.symbol)}</strong>: ${ctx.escapeHtml(item.reason || 'No se puede eliminar')}</li>`;
      }
      html += '</ul></div>';
    }

    if (allowed.length) {
      html += '<div class="delete-preview-section"><h3>Se pueden eliminar</h3>';
      html += '<ul class="delete-preview-list">';
      for (const item of allowed) {
        let statusLabel;
        if (item.status === 'has_history') {
          statusLabel = `Tiene ${item.dependencies?.transactions || 0} movimientos pero posición a cero. Se desactivará.`;
        } else {
          statusLabel = 'Sin movimientos ni posición.';
        }
        html += `<li class="delete-item allowed"><strong>${ctx.escapeHtml(item.symbol)}</strong>: ${ctx.escapeHtml(statusLabel)}</li>`;
      }
      html += '</ul></div>';
    }

    if (!blocked.length && !allowed.length) {
      html = '<p class="subtle">No se encontraron instrumentos válidos.</p>';
    }

    ctx.elements.instrumentDeletePreview.innerHTML = html;
    ctx.state.pendingInstrumentDelete = allowed.map((r) => r.symbol);
    ctx.elements.instrumentDeleteConfirm.disabled = !allowed.length;
    ctx.elements.instrumentDeleteDialog.showModal();
  }

  async function confirmInstrumentDelete() {
    const symbols = ctx.state.pendingInstrumentDelete || [];
    if (!symbols.length) return;
    try {
      await ctx.sendJson('/api/instruments', 'DELETE', { symbols });
      ctx.state.selectedInstrumentSymbols = ctx.state.selectedInstrumentSymbols.filter((s) => !symbols.includes(s));
      ctx.state.pendingInstrumentDelete = [];
      ctx.state.historyCache = {};
      ctx.elements.instrumentDeleteDialog.close();
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
    } catch (error) {
      ctx.elements.instrumentDeletePreview.innerHTML = `<p class="error">${ctx.escapeHtml(ctx.normalizeErrorMessage(error))}</p>`;
    }
  }

  function cancelInstrumentDelete() {
    ctx.state.pendingInstrumentDelete = [];
    ctx.elements.instrumentDeleteDialog.close();
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
    toggleTransactionRow,
    selectVisibleTransactions,
    selectVisibleInstruments,
    selectVisibleGroups,
    deselectAllTransactions,
    deselectAllInstruments,
    deselectAllGroups,
    deleteSelectedTransactions,
    deleteSelectedInstruments,
    deleteSelectedGroups,
    confirmInstrumentDelete,
    cancelInstrumentDelete,
  });
}
