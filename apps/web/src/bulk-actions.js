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
    showTransactionDeletePreview(ids);
  }

  function showTransactionDeletePreview(ids) {
    const selected = (ctx.state.transactions || []).filter((transaction) => ids.includes(String(transaction.id)));
    const firstDate = selected.map((transaction) => transaction.date).filter(Boolean).sort()[0] || null;
    const totals = selected.reduce(
      (acc, item) => {
        acc.value += Number(item.valueEur || 0);
        acc.cashFlow += Number(item.cashFlowEur || 0);
        acc.commissions += Number(item.commissionEur || 0);
        return acc;
      },
      { value: 0, cashFlow: 0, commissions: 0 },
    );
    setDeleteDialogCopy(
      'Eliminar movimientos',
      'Confirma el impacto antes de borrar. El histórico se recalculará desde el primer movimiento afectado.',
      'Eliminar movimientos',
    );
    ctx.elements.instrumentDeletePreview.innerHTML = `
      <div class="delete-impact-summary">
        <article><span>Movimientos</span><strong>${selected.length}</strong></article>
        <article><span>Desde</span><strong>${firstDate ? ctx.formatDate(firstDate) : 'sin fecha'}</strong></article>
        <article><span>Valor</span><strong>${ctx.formatCurrency(totals.value)}</strong></article>
        <article><span>Comisiones</span><strong>${ctx.formatCurrency(totals.commissions)}</strong></article>
        <article><span>Cash-flow</span><strong class="${ctx.moneyClass(totals.cashFlow)}">${ctx.formatCurrency(totals.cashFlow)}</strong></article>
      </div>
      <div class="delete-preview-section">
        <h3>Impacto en histórico</h3>
        <p class="subtle">Se invalidará la curva histórica desde ${firstDate ? ctx.formatDate(firstDate) : 'la primera fecha afectada'} y se recalcularán dashboard, YTD y ledger.</p>
      </div>
      <ul class="delete-preview-list">
        ${selected
          .slice(0, 8)
          .map(
            (item) =>
              `<li class="delete-item allowed"><strong>${ctx.escapeHtml(item.symbol)}</strong>: ${ctx.formatDate(item.date)} · ${ctx.transactionTypeLabel(item.type)} · ${ctx.formatShareNumber(item.shares)} acciones</li>`,
          )
          .join('')}
      </ul>
      ${selected.length > 8 ? `<p class="subtle">Y ${selected.length - 8} movimientos más.</p>` : ''}
    `;
    ctx.state.pendingTransactionDelete = ids;
    ctx.elements.instrumentDeleteConfirm.disabled = false;
    ctx.elements.instrumentDeleteDialog.classList.add('transaction-delete-dialog');
    ctx.elements.instrumentDeleteDialog.showModal();
  }

  async function confirmTransactionDelete() {
    const ids = ctx.state.pendingTransactionDelete || [];
    if (!ids.length) return;
    try {
      ctx.elements.instrumentDeletePreview.innerHTML = '<p class="subtle">Eliminando movimientos...</p>';
      const response = await ctx.sendJson('/api/transactions', 'DELETE', { ids });
      ctx.state.selectedTransactionIds = [];
      ctx.state.pendingTransactionDelete = [];
      ctx.state.historyCache = {};
      if (response?.backup) {
        ctx.elements.instrumentDeletePreview.innerHTML = `<p class="ok">Movimientos eliminados. Backup automático creado: ${response.backup.file}</p>`;
      } else {
        ctx.elements.instrumentDeletePreview.innerHTML = '<p class="ok">Movimientos eliminados.</p>';
      }
      ctx.elements.instrumentDeleteDialog.close();
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
    } catch (error) {
      ctx.elements.instrumentDeletePreview.innerHTML = `<p class="error">${ctx.escapeHtml(ctx.normalizeErrorMessage(error))}</p>`;
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
    ctx.elements.instrumentDeleteDialog.classList.remove('transaction-delete-dialog');
    setDeleteDialogCopy(
      'Eliminar instrumentos',
      'Revisa el estado de cada instrumento antes de confirmar.',
      'Eliminar seleccionados',
    );
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
    if ((ctx.state.pendingTransactionDelete || []).length) return confirmTransactionDelete();
    const symbols = ctx.state.pendingInstrumentDelete || [];
    if (!symbols.length) return;
    try {
      const response = await ctx.sendJson('/api/instruments', 'DELETE', { symbols });
      ctx.state.selectedInstrumentSymbols = ctx.state.selectedInstrumentSymbols.filter((s) => !symbols.includes(s));
      ctx.state.pendingInstrumentDelete = [];
      ctx.state.historyCache = {};
      if (response?.backup) {
        ctx.elements.instrumentDeletePreview.innerHTML = `<p class="ok">Instrumentos eliminados. Backup automático creado: ${response.backup.file}</p>`;
      } else {
        ctx.elements.instrumentDeletePreview.innerHTML = '<p class="ok">Instrumentos eliminados.</p>';
      }
      ctx.elements.instrumentDeleteDialog.close();
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
    } catch (error) {
      ctx.elements.instrumentDeletePreview.innerHTML = `<p class="error">${ctx.escapeHtml(ctx.normalizeErrorMessage(error))}</p>`;
    }
  }

  function cancelInstrumentDelete() {
    ctx.state.pendingInstrumentDelete = [];
    ctx.state.pendingTransactionDelete = [];
    ctx.elements.instrumentDeleteDialog.classList.remove('transaction-delete-dialog');
    ctx.elements.instrumentDeleteDialog.close();
  }

  function setDeleteDialogCopy(title, subtitle, buttonLabel) {
    const titleEl = ctx.elements.instrumentDeleteDialog.querySelector('.modal-header h2');
    const subtitleEl = ctx.elements.instrumentDeleteDialog.querySelector('.modal-header .subtle');
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    if (ctx.elements.instrumentDeleteConfirm) ctx.elements.instrumentDeleteConfirm.textContent = buttonLabel;
  }

  async function deleteSelectedGroups() {
    const ids = ctx.state.selectedGroupIds || [];
    if (!ids.length) return;
    if (!ctx.window.confirm(`Eliminar ${ids.length} grupo(s) seleccionado(s)?`)) return;
    try {
      const response = await ctx.sendJson('/api/instrument-groups', 'DELETE', { ids });
      ctx.state.selectedGroupIds = [];
      ctx.state.historyCache = {};
      if (response?.backup) {
        ctx.elements.backupList.textContent = `Grupos eliminados. Backup automático creado: ${response.backup.file}`;
      } else {
        ctx.elements.backupList.textContent = 'Grupos eliminados.';
      }
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
