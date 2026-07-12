function transactionTypeLabel(ctx, type) {
  return type === 'remove' ? ctx.t('Ventas') : ctx.t('Compras');
}

export function attach(ctx) {
  let transactionId = null;
  let previewTimer = null;
  let previewRequest = 0;

  function setFeedback(message, isError = false) {
    ctx.elements.transactionEditFeedback.textContent = message;
    ctx.elements.transactionEditFeedback.dataset.state = message ? (isError ? 'error' : 'ok') : '';
  }

  function selectedTransaction() {
    const ids = ctx.state.selectedTransactionIds || [];
    if (ids.length !== 1) return null;
    return (ctx.state.transactions || []).find((item) => String(item.id) === String(ids[0])) || null;
  }

  function buildPayload() {
    return {
      date: ctx.elements.transactionEditDate.value,
      shares: Number(ctx.elements.transactionEditShares.value),
      price: Number(ctx.elements.transactionEditPrice.value),
      currency: String(ctx.elements.transactionEditCurrency.value || '').trim().toUpperCase(),
      fxToEur: Number(ctx.elements.transactionEditFx.value),
      commissionEur: Number(ctx.elements.transactionEditCommission.value || 0),
      note: String(ctx.elements.transactionEditNote.value || '').trim() || null,
    };
  }

  function renderPreview(preview) {
    ctx.elements.transactionEditPreview.hidden = false;
    ctx.elements.transactionEditPreview.innerHTML = `
      <span>${ctx.escapeHtml(ctx.t('Previsualización'))}</span>
      <strong>${ctx.escapeHtml(preview.symbol)} - ${ctx.escapeHtml(transactionTypeLabel(ctx, preview.type))}</strong>
      <small>${ctx.escapeHtml(ctx.t('Valor'))}: ${ctx.formatCurrency(Number(preview.valueEur || 0))} - ${ctx.escapeHtml(ctx.t('Comisión'))}: ${ctx.formatCurrency(Number(preview.commissionEur || 0))}</small>
      <small>${ctx.escapeHtml(ctx.t('Cash-flow'))}: ${ctx.formatCurrency(Number(preview.cashFlowEur || 0))}</small>`;
  }

  async function refreshTransactionEditPreview() {
    if (!transactionId) return false;
    const requestId = ++previewRequest;
    ctx.elements.transactionEditSubmit.disabled = true;
    setFeedback(ctx.t('Validando cambios...'));
    try {
      const data = await ctx.sendJson(`/api/transactions/${encodeURIComponent(transactionId)}/preview`, 'POST', buildPayload());
      if (requestId !== previewRequest) return false;
      renderPreview(data.preview);
      setFeedback('');
      ctx.state.transactionEditPreviewOk = true;
      ctx.elements.transactionEditSubmit.disabled = false;
      return true;
    } catch (error) {
      if (requestId !== previewRequest) return false;
      ctx.state.transactionEditPreviewOk = false;
      ctx.elements.transactionEditPreview.hidden = true;
      setFeedback(ctx.normalizeErrorMessage(error), true);
      return false;
    }
  }

  function scheduleTransactionEditPreview() {
    ctx.state.transactionEditPreviewOk = false;
    ctx.elements.transactionEditSubmit.disabled = true;
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(refreshTransactionEditPreview, 250);
  }

  async function openTransactionEditor() {
    const transaction = selectedTransaction();
    if (!transaction || transaction.type === 'dividend') return;
    transactionId = transaction.id;
    ctx.elements.transactionEditDate.value = transaction.date;
    ctx.elements.transactionEditShares.value = transaction.shares;
    ctx.elements.transactionEditPrice.value = transaction.price;
    ctx.elements.transactionEditCurrency.value = transaction.currency;
    ctx.elements.transactionEditFx.value = transaction.fxToEur;
    ctx.elements.transactionEditCommission.value = transaction.commissionEur || 0;
    ctx.elements.transactionEditNote.value = transaction.note || '';
    ctx.elements.transactionEditSummary.innerHTML = `<strong>${ctx.escapeHtml(transaction.symbol)}</strong><span>${ctx.escapeHtml(transactionTypeLabel(ctx, transaction.type))} · ${ctx.escapeHtml(ctx.transactionOriginLabel(transaction.origin))}</span>`;
    ctx.elements.transactionEditPreview.hidden = true;
    setFeedback('');
    ctx.state.transactionEditPreviewOk = false;
    ctx.elements.transactionEditDialog.showModal();
    ctx.elements.transactionEditDate.focus();
    await refreshTransactionEditPreview();
  }

  function closeTransactionEditor() {
    window.clearTimeout(previewTimer);
    transactionId = null;
    ctx.elements.transactionEditDialog.close();
  }

  async function saveTransactionEditor(event) {
    event.preventDefault();
    if (!transactionId) return;
    const ok = ctx.state.transactionEditPreviewOk || (await refreshTransactionEditPreview());
    if (!ok) return;
    ctx.elements.transactionEditSubmit.disabled = true;
    setFeedback(ctx.t('Guardando cambios...'));
    try {
      await ctx.sendJson(`/api/transactions/${encodeURIComponent(transactionId)}`, 'PUT', buildPayload());
      ctx.state.historyCache = {};
      await Promise.all([ctx.refreshDashboard(), ctx.refreshHistory({ force: true })]);
      closeTransactionEditor();
    } catch (error) {
      setFeedback(ctx.normalizeErrorMessage(error), true);
      ctx.elements.transactionEditSubmit.disabled = false;
    }
  }

  Object.assign(ctx, {
    openTransactionEditor,
    closeTransactionEditor,
    saveTransactionEditor,
    scheduleTransactionEditPreview,
    refreshTransactionEditPreview,
  });

  ctx.elements.editSelectedTransaction?.addEventListener('click', openTransactionEditor);
  ctx.elements.transactionEditClose?.addEventListener('click', closeTransactionEditor);
  ctx.elements.transactionEditCancel?.addEventListener('click', closeTransactionEditor);
  ctx.elements.transactionEditForm?.addEventListener('submit', saveTransactionEditor);
  [
    ctx.elements.transactionEditDate,
    ctx.elements.transactionEditShares,
    ctx.elements.transactionEditPrice,
    ctx.elements.transactionEditCurrency,
    ctx.elements.transactionEditFx,
    ctx.elements.transactionEditCommission,
    ctx.elements.transactionEditNote,
  ].forEach((input) => input?.addEventListener('input', scheduleTransactionEditPreview));
}
