export function attach(ctx) {
  function setAddFeedback(message, isError = false) {
    ctx.elements.addFeedback.textContent = message;
    ctx.elements.addFeedback.dataset.state = message ? (isError ? 'error' : 'ok') : '';
  }

  function buildTransactionPayload(includeId = false) {
    const type = ctx.elements.operationType.value;
    const symbol = type === 'remove' ? ctx.elements.removeTicker.value : ctx.elements.addTicker.value;
    const euros = Number(ctx.elements.addEuros.value);
    const shares = Number(ctx.elements.addShares.value);
    const commission = Number(ctx.elements.addCommission.value);
    const payload = { type, symbol, date: ctx.elements.addDate.value };
    if (includeId) payload.id = ctx.clientRequestId('tx');
    if (Number.isFinite(euros) && euros > 0) payload.euros = euros;
    if (Number.isFinite(shares) && shares > 0) payload.shares = shares;
    if (Number.isFinite(commission) && commission > 0) payload.commissionEur = commission;
    return payload;
  }

  function renderTransactionPreview(preview) {
    ctx.elements.transactionPreview.hidden = false;
    ctx.elements.transactionPreview.innerHTML = `
      <span>Preview</span>
      <strong>${preview.symbol} - ${transactionTypeLabel(preview.type)}</strong>
      <small>Mercado: ${ctx.formatDate(preview.marketDate)} - Precio: ${Number(preview.price).toFixed(2)} ${preview.currency}</small>
      <small>Acciones: ${ctx.formatShareNumber(preview.shares)} - Valor: ${ctx.formatCurrency(Number(preview.valueEur))} - Comision: ${ctx.formatCurrency(Number(preview.commissionEur || 0))}</small>
      <small>Cash-flow: ${ctx.formatCurrency(Number(preview.cashFlowEur || 0))}</small>
    `;
  }

  function transactionTypeLabel(type) {
    return type === 'remove' ? 'Venta' : 'Compra';
  }

  async function refreshTransactionPreview() {
    const payload = buildTransactionPayload(false);
    ctx.elements.transactionPreview.hidden = true;
    ctx.state.transactionPreviewOk = false;
    if (!payload.symbol || !payload.date || Boolean(payload.euros) === Boolean(payload.shares)) return false;
    try {
      const data = await ctx.sendJson('/api/transactions/preview', 'POST', payload, { timeoutMs: 20000 });
      renderTransactionPreview(data.preview);
      ctx.state.transactionPreviewOk = true;
      return true;
    } catch (error) {
      ctx.elements.transactionPreview.hidden = false;
      ctx.elements.transactionPreview.innerHTML = `<span>No se pudo previsualizar</span><small>${ctx.normalizeErrorMessage(error)}</small>`;
      return false;
    }
  }

  function symbolsWithShares() {
    const positions = Object.values(ctx.state.summary?.groupedPositions || {}).flat();
    return [...new Set(positions.filter((item) => item.shares > 0).map((item) => item.symbol))];
  }

  function populateRemoveTickerOptions() {
    const symbols = symbolsWithShares();
    ctx.elements.removeTicker.innerHTML = symbols.map((symbol) => `<option value="${symbol}">${symbol}</option>`).join('');
    return symbols;
  }

  function visibleInstruments() {
    return (ctx.state.instruments || []).filter((instrument) => instrument.type !== 'fx');
  }

  function syncOperationCopy() {
    const isRemove = ctx.elements.operationType.value === 'remove';
    ctx.elements.operationTitle.textContent = isRemove ? 'Eliminar posicion' : 'Anadir aportacion';
    ctx.elements.addSubmit.textContent = isRemove ? 'Eliminar' : 'Anadir';
    ctx.elements.tickerInputField.hidden = isRemove;
    ctx.elements.tickerSelectField.hidden = !isRemove;
    ctx.elements.addTicker.required = !isRemove;
    ctx.elements.removeTicker.required = isRemove;
    ctx.elements.addTicker.disabled = isRemove;
    ctx.elements.removeTicker.disabled = !isRemove;
    if (isRemove) populateRemoveTickerOptions();
  }

  function syncAmountInputs(event) {
    const source = event.target;
    const target = source === ctx.elements.addEuros ? ctx.elements.addShares : ctx.elements.addEuros;
    if ((source === ctx.elements.addEuros || source === ctx.elements.addShares) && source.value && Number(source.value) > 0) {
      target.value = '';
    }
    ctx.elements.transactionPreview.hidden = true;
    ctx.state.transactionPreviewOk = false;
    setAddFeedback('');
  }

  function openOperationDialog(type) {
    ctx.elements.addForm.reset();
    ctx.elements.operationType.value = type;
    ctx.elements.addDate.value = ctx.todayInputValue();
    ctx.elements.transactionPreview.hidden = true;
    ctx.state.transactionPreviewOk = false;
    setAddFeedback('');
    syncOperationCopy();
    ctx.elements.addDialog.showModal();
    (type === 'remove' ? ctx.elements.removeTicker : ctx.elements.addTicker).focus();
  }

  function closeAddDialog() {
    ctx.elements.addDialog.close();
  }

  async function handleTransactionSubmit(event) {
    event.preventDefault();
    const payload = buildTransactionPayload(true);
    if (Boolean(payload.euros) === Boolean(payload.shares)) {
      setAddFeedback('Indica euros o acciones, solo uno de los dos campos.', true);
      return;
    }
    ctx.elements.addSubmit.disabled = true;
    setAddFeedback('Validando precio y movimiento...');
    try {
      const previewOk = ctx.state.transactionPreviewOk || (await refreshTransactionPreview());
      if (!previewOk) throw new Error('Revisa la previsualizacion antes de guardar');
      setAddFeedback('Guardando movimiento...');
      const data = await ctx.sendJson('/api/transactions', 'POST', payload);
      setAddFeedback(`${data.transaction.symbol}: movimiento guardado.`);
      window.setTimeout(closeAddDialog, 250);
      ctx.state.historyCache = {};
      await Promise.all([ctx.refreshDashboard(), ctx.refreshHistory({ force: true })]);
    } catch (error) {
      const storedTransaction = await ctx.findTransactionById(payload.id).catch(() => null);
      if (storedTransaction) {
        setAddFeedback(`${storedTransaction.symbol}: movimiento guardado.`);
        window.setTimeout(closeAddDialog, 250);
        ctx.state.historyCache = {};
        await Promise.all([ctx.refreshDashboard(), ctx.refreshHistory({ force: true })]);
      } else {
        setAddFeedback(ctx.normalizeErrorMessage(error), true);
      }
    } finally {
      ctx.elements.addSubmit.disabled = false;
    }
  }

  function renderAutoPlans() {
    const instruments = visibleInstruments();
    if (!instruments.length) {
      ctx.elements.autoPlanList.innerHTML = `
        <div class="empty-config-state">
          Sin instrumentos todavia. Crea tu primer instrumento para configurar aportaciones automaticas.
          <button class="button button-compact" type="button" data-open-onboarding>Crear instrumento</button>
        </div>`;
      return;
    }

    const rows = (ctx.state.autoPlanDrafts || [])
      .map((plan, index) => renderAutoPlanRow(plan, index, instruments))
      .join('');
    ctx.elements.autoPlanList.innerHTML = `
      <div class="auto-plan-toolbar">
        <button class="button" type="button" data-add-auto-plan>Anadir plan</button>
      </div>
      ${rows || '<p class="subtle">Sin aportaciones automaticas. Anade un plan cuando lo necesites.</p>'}
    `;
  }

  function renderAutoPlanRow(plan, index, instruments) {
    const options = instruments
      .map((instrument) => `<option value="${ctx.escapeHtml(instrument.symbol)}" ${instrument.symbol === plan.symbol ? 'selected' : ''}>${ctx.escapeHtml(instrument.symbol)} - ${ctx.escapeHtml(instrument.name)}</option>`)
      .join('');
    return `
      <div class="auto-plan-row" data-auto-plan-row="${index}">
        <label class="check-field"><input type="checkbox" data-auto-field="enabled" ${plan.enabled ? 'checked' : ''} /><span>Activo</span></label>
        <label class="field"><span>Instrumento</span><select data-auto-field="symbol">${options}</select></label>
        <label class="field"><span>Euros</span><input data-auto-field="amountEur" type="number" min="0.01" step="0.01" value="${Number(plan.amountEur || 0)}" /></label>
        <label class="field"><span>Dia</span><input data-auto-field="day" type="number" min="1" max="28" step="1" value="${Number(plan.day || 3)}" /></label>
        <label class="field"><span>Inicio</span><input data-auto-field="startDate" type="date" value="${ctx.escapeHtml(plan.startDate || ctx.todayInputValue())}" /></label>
        <button class="button button-compact" type="button" data-remove-auto-plan="${index}">Quitar</button>
      </div>`;
  }

  function openAutoDialog() {
    ctx.state.autoPlanDrafts = (ctx.state.autoPlans || []).map((plan) => ({ ...plan }));
    renderAutoPlans();
    ctx.elements.autoFeedback.textContent = 'Si el dia elegido no tiene mercado, se usara el siguiente cierre disponible.';
    ctx.elements.autoFeedback.dataset.state = '';
    ctx.elements.autoDialog.showModal();
  }

  function closeAutoDialog() {
    ctx.state.autoPlanDrafts = [];
    ctx.elements.autoDialog.close();
  }

  function addAutoPlanDraft() {
    const instruments = visibleInstruments();
    if (!instruments.length) {
      ctx.openWizardDialog();
      return;
    }
    const used = new Set((ctx.state.autoPlanDrafts || []).map((plan) => plan.symbol));
    const instrument = instruments.find((item) => !used.has(item.symbol)) || instruments[0];
    ctx.state.autoPlanDrafts = [
      ...(ctx.state.autoPlanDrafts || []),
      { symbol: instrument.symbol, amountEur: 100, day: 3, enabled: true, startDate: ctx.todayInputValue() },
    ];
    renderAutoPlans();
  }

  function removeAutoPlanDraft(index) {
    ctx.state.autoPlanDrafts = (ctx.state.autoPlanDrafts || []).filter((_, itemIndex) => itemIndex !== index);
    renderAutoPlans();
  }

  async function saveAutoPlansFromForm() {
    const autoPlans = Array.from(ctx.elements.autoPlanList.querySelectorAll('[data-auto-plan-row]')).map((row) => ({
      symbol: row.querySelector('[data-auto-field="symbol"]').value.trim().toUpperCase(),
      amountEur: Number(row.querySelector('[data-auto-field="amountEur"]').value),
      day: Number(row.querySelector('[data-auto-field="day"]').value),
      startDate: row.querySelector('[data-auto-field="startDate"]').value,
      enabled: row.querySelector('[data-auto-field="enabled"]').checked,
    }));
    try {
      const data = await ctx.sendJson('/api/auto-plans', 'PUT', { autoPlans });
      ctx.state.autoPlans = data.autoPlans;
      ctx.state.autoPlanDrafts = data.autoPlans.map((plan) => ({ ...plan }));
      ctx.state.historyCache = {};
      ctx.elements.autoFeedback.textContent = 'Guardado para proximos meses.';
      ctx.elements.autoFeedback.dataset.state = 'ok';
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
      window.setTimeout(closeAutoDialog, 700);
    } catch (error) {
      ctx.elements.autoFeedback.textContent = ctx.normalizeErrorMessage(error);
      ctx.elements.autoFeedback.dataset.state = 'error';
    }
  }

  Object.assign(ctx, {
    setAddFeedback,
    buildTransactionPayload,
    renderTransactionPreview,
    refreshTransactionPreview,
    symbolsWithShares,
    populateRemoveTickerOptions,
    syncOperationCopy,
    syncAmountInputs,
    openOperationDialog,
    closeAddDialog,
    handleTransactionSubmit,
    renderAutoPlans,
    renderAutoPlanRow,
    openAutoDialog,
    closeAutoDialog,
    addAutoPlanDraft,
    removeAutoPlanDraft,
    saveAutoPlansFromForm,
  });
}
