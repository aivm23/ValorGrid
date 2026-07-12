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
    if (!row || event.target.closest('[data-select-transaction], [data-transaction-note]')) return;
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
      ctx.t('delete.transactions.title'),
      ctx.t('delete.transactions.subtitle'),
      ctx.t('delete.transactions.confirm'),
    );
    ctx.elements.instrumentDeletePreview.innerHTML = `
      <div class="delete-impact-summary">
        <article><span>${ctx.t('Movimientos')}</span><strong>${selected.length}</strong></article>
        <article><span>${ctx.t('Desde')}</span><strong>${firstDate ? ctx.formatDate(firstDate) : ctx.t('format.noDate')}</strong></article>
        <article><span>${ctx.t('Valor')}</span><strong>${ctx.formatCurrency(totals.value)}</strong></article>
        <article><span>${ctx.t('Comisiones')}</span><strong>${ctx.formatCurrency(totals.commissions)}</strong></article>
        <article><span>Cash-flow</span><strong class="${ctx.moneyClass(totals.cashFlow)}">${ctx.formatCurrency(totals.cashFlow)}</strong></article>
      </div>
      <div class="delete-preview-section">
        <h3>${ctx.t('delete.transactions.impactTitle')}</h3>
        <p class="subtle">${ctx.t('delete.transactions.impactText', { date: firstDate ? ctx.formatDate(firstDate) : ctx.t('delete.transactions.firstAffectedDate') })}</p>
      </div>
      <ul class="delete-preview-list">
        ${selected
          .slice(0, 8)
          .map(
            (item) =>
              `<li class="delete-item allowed"><strong>${ctx.escapeHtml(item.symbol)}</strong>: ${ctx.formatDate(item.date)} · ${ctx.transactionTypeLabel(item.type)} · ${ctx.formatInstrumentQuantity(item.shares, item)}</li>`,
          )
          .join('')}
      </ul>
      ${selected.length > 8 ? `<p class="subtle">${ctx.tn('delete.transactions.more', selected.length - 8)}</p>` : ''}
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
      ctx.elements.instrumentDeletePreview.innerHTML = `<p class="subtle">${ctx.t('delete.transactions.deleting')}</p>`;
      const response = await ctx.sendJson('/api/transactions', 'DELETE', { ids });
      ctx.state.selectedTransactionIds = [];
      ctx.state.pendingTransactionDelete = [];
      ctx.state.historyCache = {};
      if (response?.backup) {
        ctx.elements.instrumentDeletePreview.innerHTML = `<p class="ok">${ctx.t('delete.transactions.deletedBackup', { file: response.backup.file })}</p>`;
      } else {
        ctx.elements.instrumentDeletePreview.innerHTML = `<p class="ok">${ctx.t('delete.transactions.deleted')}</p>`;
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
      ctx.t('delete.instruments.title'),
      ctx.t('delete.instruments.subtitle'),
      ctx.t('delete.instruments.confirm'),
    );
    const blocked = results.filter((r) => r.blocked);
    const allowed = results.filter((r) => !r.blocked);

    let html = '';
    if (blocked.length) {
      html += `<div class="delete-preview-section"><h3>${ctx.t('delete.instruments.blocked')}</h3>`;
      html += '<ul class="delete-preview-list">';
      for (const item of blocked) {
        html += `<li class="delete-item blocked"><strong>${ctx.escapeHtml(item.symbol)}</strong>: ${ctx.escapeHtml(item.reason || ctx.t('delete.instruments.cannotDelete'))}</li>`;
      }
      html += '</ul></div>';
    }

    if (allowed.length) {
      html += `<div class="delete-preview-section"><h3>${ctx.t('delete.instruments.allowed')}</h3>`;
      html += '<ul class="delete-preview-list">';
      for (const item of allowed) {
        let statusLabel;
        if (item.status === 'has_history') {
          statusLabel = ctx.t('delete.instruments.hasHistory', { count: item.dependencies?.transactions || 0 });
        } else {
          statusLabel = ctx.t('delete.instruments.noHistory');
        }
        html += `<li class="delete-item allowed"><strong>${ctx.escapeHtml(item.symbol)}</strong>: ${ctx.escapeHtml(statusLabel)}</li>`;
      }
      html += '</ul></div>';
    }

    if (!blocked.length && !allowed.length) {
      html = `<p class="subtle">${ctx.t('delete.instruments.empty')}</p>`;
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
        ctx.elements.instrumentDeletePreview.innerHTML = `<p class="ok">${ctx.t('delete.instruments.deletedBackup', { file: response.backup.file })}</p>`;
      } else {
        ctx.elements.instrumentDeletePreview.innerHTML = `<p class="ok">${ctx.t('delete.instruments.deleted')}</p>`;
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
    const confirmed = await ctx.confirmAction({
      title: ctx.t('delete.groups.title'),
      message: ctx.t('delete.groups.confirm', { count: ids.length }),
      confirmLabel: ctx.t('delete.groups.action'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const response = await ctx.sendJson('/api/instrument-groups', 'DELETE', { ids });
      ctx.state.selectedGroupIds = [];
      ctx.state.historyCache = {};
      if (response?.backup) {
        ctx.elements.backupList.textContent = ctx.t('delete.groups.deletedBackup', { file: response.backup.file });
      } else {
        ctx.elements.backupList.textContent = ctx.t('delete.groups.deleted');
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
