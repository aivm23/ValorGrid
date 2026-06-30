import { attachTransactionEntryModes } from './transaction-entry-modes.js';

export function attach(ctx) {
  function setAddFeedback(message, isError = false) {
    ctx.elements.addFeedback.textContent = message;
    ctx.elements.addFeedback.dataset.state = message ? (isError ? 'error' : 'ok') : '';
  }
  attachTransactionEntryModes(ctx, setAddFeedback);
  function buildTransactionPayload(includeId = false) {
    const type = ctx.elements.operationType.value;
    const symbol = type === 'remove' ? ctx.elements.removeTicker.value : ctx.elements.addTicker.value;
    const entryMode = ctx.activeTransactionEntryMode();
    const euros = Number(ctx.elements.addEuros.value);
    const shares = Number(ctx.elements.addShares.value);
    const price = Number(ctx.elements.addPrice.value);
    const priceCurrency = String(ctx.elements.addPriceCurrency.value || '').trim().toUpperCase();
    const fxToEur = Number(ctx.elements.addFx.value);
    const commission = Number(ctx.elements.addCommission.value);
    const payload = { type, symbol, date: ctx.elements.addDate.value, entryMode };
    if (includeId) payload.id = ctx.clientRequestId('tx');
    if (entryMode === 'market_eur' && Number.isFinite(euros) && euros > 0) {
      payload.euros = euros;
    } else if (entryMode === 'manual_total_eur' && Number.isFinite(euros) && euros > 0 && Number.isFinite(shares) && shares > 0) {
      payload.euros = euros;
      payload.shares = shares;
    } else if (entryMode === 'manual_unit_price' && Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price > 0) {
      payload.shares = shares;
      payload.unitPrice = price;
      if (priceCurrency) payload.priceCurrency = priceCurrency;
      if (Number.isFinite(fxToEur) && fxToEur > 0) payload.fxToEur = fxToEur;
    }
    if (Number.isFinite(commission) && commission > 0) payload.commissionEur = commission;
    return payload;
  }

  function transactionTypeLabel(type) {
    return type === 'remove' ? ctx.t('history.events.sell') : ctx.t('history.events.buy');
  }

  function renderTransactionPreview(preview) {
    ctx.elements.transactionPreview.hidden = false;
    const modeLabel =
      preview.type === 'remove' && preview.entryMode === 'manual_total_eur'
        ? ctx.t('form.operation.manualSellEur')
        : preview.entryMode
          ? ctx.transactionEntryModeLabel(preview.entryMode)
          : preview.manualUnitPrice
            ? ctx.t('form.operation.manualPrice')
            : ctx.t('form.operation.market');
    const marketDate =
      preview.entryMode === 'market_eur' ? ` - ${ctx.t('form.operation.marketDate')}: ${ctx.formatDate(preview.marketDate)}` : '';
    ctx.elements.transactionPreview.innerHTML = `
      <span>${ctx.t('form.operation.preview')}</span>
      <strong>${preview.symbol} - ${transactionTypeLabel(preview.type)}</strong>
      <small>${ctx.t('form.operation.mode')}: ${modeLabel}${marketDate} - ${ctx.t('form.operation.price')}: ${Number(preview.price).toFixed(2)} ${preview.currency}</small>
      <small>${ctx.t('form.operation.quantity')}: ${ctx.formatInstrumentQuantity(preview.shares, preview)} - ${ctx.t('form.operation.value')}: ${ctx.formatCurrency(Number(preview.valueEur))} - ${ctx.t('form.operation.commission')}: ${ctx.formatCurrency(Number(preview.commissionEur || 0))}</small>
      <small>${ctx.t('form.operation.cashFlow')}: ${ctx.formatCurrency(Number(preview.cashFlowEur || 0))}</small>
    `;
  }
  function hasValidAmount() {
    const mode = ctx.activeTransactionEntryMode();
    const euros = Number(ctx.elements.addEuros.value);
    const shares = Number(ctx.elements.addShares.value);
    const price = Number(ctx.elements.addPrice.value);
    if (mode === 'market_eur') return Number.isFinite(euros) && euros > 0;
    if (mode === 'manual_total_eur') return Number.isFinite(euros) && euros > 0 && Number.isFinite(shares) && shares > 0;
    return Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price > 0;
  }

  async function refreshTransactionPreview() {
    const payload = buildTransactionPayload(false);
    ctx.elements.transactionPreview.hidden = true;
    ctx.state.transactionPreviewOk = false;
    if (!payload.symbol || !payload.date || !hasValidAmount()) return false;
    try {
      const data = await ctx.sendJson('/api/transactions/preview', 'POST', payload, { timeoutMs: 20000 });
      renderTransactionPreview(data.preview);
      ctx.state.transactionPreviewOk = true;
      return true;
    } catch (error) {
      ctx.elements.transactionPreview.hidden = false;
      ctx.elements.transactionPreview.innerHTML = `<span>${ctx.t('form.operation.validateFailed')}</span><small>${ctx.normalizeErrorMessage(error)}</small>`;
      return false;
    }
  }

  function symbolsWithShares() {
    const positions = Object.values(ctx.state.summary?.groupedPositions || {}).flat();
    return [...new Set(positions.filter((item) => item.shares > 0).map((item) => item.symbol))];
  }

  function populateRemoveTickerOptions() {
    const symbols = symbolsWithShares();
    ctx.elements.removeTicker.innerHTML = symbols.length
      ? symbols.map((symbol) => `<option value="${ctx.escapeHtml(symbol)}">${ctx.escapeHtml(symbol)}</option>`).join('')
      : '<option value="">Sin posiciones abiertas</option>';
    return symbols;
  }

  function visibleInstruments() {
    return (ctx.state.instruments || []).filter((instrument) => instrument.type !== 'fx' && instrument.type !== 'cash');
  }
  function populateAddTickerOptions(selectedSymbol = '') {
    const instruments = visibleInstruments();
    ctx.elements.addTicker.innerHTML = instruments.length
      ? instruments
          .map((instrument) => {
            const label = `${instrument.symbol} - ${instrument.name || instrument.yahooSymbol || instrument.symbol}`;
            return `<option value="${ctx.escapeHtml(instrument.symbol)}" ${instrument.symbol === selectedSymbol ? 'selected' : ''}>${ctx.escapeHtml(label)}</option>`;
          })
          .join('')
      : '<option value="">Sin valores creados</option>';
    return instruments;
  }

  function syncOperationCopy() {
    const isRemove = ctx.elements.operationType.value === 'remove';
    ctx.elements.operationTitle.textContent = ctx.t(isRemove ? 'form.operation.title.sell' : 'form.operation.title.buy');
    ctx.elements.operationSubtitle.textContent = ctx.t(
      isRemove ? 'form.operation.subtitle.sell' : 'form.operation.subtitle.buy',
    );
    ctx.elements.addSubmit.textContent = ctx.t(isRemove ? 'form.operation.submit.sell' : 'form.operation.submit.buy');
    ctx.elements.addTicker.required = !isRemove;
    ctx.elements.removeTicker.required = isRemove;
    ctx.elements.addTicker.disabled = isRemove;
    ctx.elements.removeTicker.disabled = !isRemove;
    const available = isRemove ? populateRemoveTickerOptions() : populateAddTickerOptions(ctx.elements.addTicker.value);
    const isEmpty = available.length === 0;
    ctx.elements.tickerInputField.hidden = isRemove || isEmpty;
    ctx.elements.tickerSelectField.hidden = !isRemove || isEmpty;
    ctx.elements.operationCreateInstrument.hidden = isRemove || isEmpty;
    ctx.elements.addDate.closest('.field').hidden = isEmpty;
    ctx.elements.addCalculationSection.hidden = isEmpty;
    ctx.elements.addCommissionField.hidden = isEmpty;
    ctx.elements.addSubmit.disabled = isEmpty;
    ctx.elements.addSubmit.hidden = isEmpty;
    ctx.syncEntryModeUi({ resetCurrency: true });
    if (isEmpty) {
      ctx.elements.transactionPreview.hidden = true;
      ctx.state.transactionPreviewOk = false;
      setAddFeedback(ctx.t(isRemove
        ? 'No hay ninguna posición abierta. Registra una compra antes de añadir una venta.'
        : 'No hay valores creados. Crea un valor antes de registrar compras.'));
    }
  }

  function syncAmountInputs(event) {
    const source = event.target;
    if (source === ctx.elements.addTicker || source === ctx.elements.removeTicker) ctx.syncEntryModeUi({ resetCurrency: true });
    else ctx.syncEntryModeUi();
    ctx.resetTransactionPreview();
  }

  function handleEntryModeChange() {
    ctx.syncEntryModeUi({ clearFields: true, resetCurrency: true });
    ctx.resetTransactionPreview();
  }

  function openOperationDialog(type) {
    ctx.elements.addForm.reset();
    ctx.elements.operationType.value = type;
    ctx.elements.addDate.value = ctx.todayInputValue();
    ctx.state.transactionEntryMode = type === 'remove' ? 'manual_total_eur' : 'market_eur';
    ctx.elements.addEntryModeInputs.forEach((input) => {
      input.checked = input.value === ctx.state.transactionEntryMode;
    });
    ctx.syncEntryModeUi({ clearFields: true, resetCurrency: true });
    ctx.resetTransactionPreview();
    setAddFeedback('');
    syncOperationCopy();
    ctx.elements.addDialog.showModal();
    const target = type === 'remove' ? ctx.elements.removeTicker : ctx.elements.addTicker;
    if (!target.disabled && !ctx.elements.addSubmit.disabled) target.focus();
  }

  function closeAddDialog() {
    ctx.elements.addDialog.close();
  }

  async function handleTransactionSubmit(event) {
    event.preventDefault();
    const payload = buildTransactionPayload(true);
    if (!hasValidAmount()) {
      setAddFeedback(
        ctx.t(ctx.elements.operationType.value === 'remove'
          ? 'Indica la cantidad vendida y el importe bruto de venta en EUR.'
          : 'Indica el total en euros, o bien la cantidad con su precio unitario.'),
        true,
      );
      return;
    }
    ctx.elements.addSubmit.disabled = true;
    setAddFeedback(ctx.t('Validando precio y movimiento...'));
    try {
      const previewOk = ctx.state.transactionPreviewOk || (await refreshTransactionPreview());
      if (!previewOk) throw new Error(ctx.t('Revisa la previsualización antes de guardar'));
      setAddFeedback(ctx.t('Guardando movimiento...'));
      const data = await ctx.sendJson('/api/transactions', 'POST', payload);
      setAddFeedback(ctx.t('{symbol}: movimiento guardado.', { symbol: data.transaction.symbol }));
      window.setTimeout(closeAddDialog, 1800);
      ctx.state.historyCache = {};
      await Promise.all([ctx.refreshDashboard(), ctx.refreshHistory({ force: true })]);
    } catch (error) {
      const storedTransaction = await ctx.findTransactionById(payload.id).catch(() => null);
      if (storedTransaction) {
        setAddFeedback(ctx.t('{symbol}: movimiento guardado.', { symbol: storedTransaction.symbol }));
        window.setTimeout(closeAddDialog, 1800);
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
          ${ctx.escapeHtml(ctx.t('Sin instrumentos todavía. Crea tu primer instrumento para configurar aportaciones recurrentes.'))}
          <button class="button button-compact btn-save" type="button" data-open-onboarding>${ctx.escapeHtml(ctx.t('Crear instrumento'))}</button>
        </div>`;
      return;
    }

    const rows = (ctx.state.autoPlanDrafts || [])
      .map((plan, index) => renderAutoPlanRow(plan, index, instruments))
      .join('');
    ctx.elements.autoPlanList.innerHTML = `
      <div class="auto-plan-toolbar">
        <button class="button btn-save" type="button" data-add-auto-plan>${ctx.escapeHtml(ctx.t('Añadir plan'))}</button>
      </div>
      ${rows || `<p class="subtle">${ctx.escapeHtml(ctx.t('Sin planes de aportación. Añade un plan cuando lo necesites.'))}</p>`}
    `;
  }

  function renderAutoPlanRow(plan, index, instruments) {
    const options = instruments
      .map((instrument) => `<option value="${ctx.escapeHtml(instrument.symbol)}" ${instrument.symbol === plan.symbol ? 'selected' : ''}>${ctx.escapeHtml(instrument.symbol)} - ${ctx.escapeHtml(instrument.name)}</option>`)
      .join('');
    const frequency = plan.frequency || '';
    const isMonthly = frequency === 'monthly';
    const isWeekly = frequency === 'weekly' || frequency === 'biweekly';
    return `
      <div class="auto-plan-row" data-auto-plan-row="${index}">
        <label class="check-field"><input type="checkbox" data-auto-field="enabled" ${plan.enabled ? 'checked' : ''} /><span>${ctx.escapeHtml(ctx.t('Activo'))}</span></label>
        <label class="field"><span>${ctx.escapeHtml(ctx.t('Instrumento'))}</span><select data-auto-field="symbol"><option value="">${ctx.escapeHtml(ctx.t('Selecciona instrumento'))}</option>${options}</select></label>
        <label class="field"><span>${ctx.escapeHtml(ctx.t('Euros'))}</span><input data-auto-field="amountEur" type="number" min="0.01" step="0.01" placeholder="${ctx.escapeHtml(ctx.t('Importe'))}" value="${ctx.escapeHtml(plan.amountEur ?? '')}" /></label>
        <label class="field"><span>${ctx.escapeHtml(ctx.t('Frecuencia'))}</span><select data-auto-field="frequency">
          <option value="">${ctx.escapeHtml(ctx.t('Frecuencia'))}</option>
          <option value="daily" ${frequency === 'daily' ? 'selected' : ''}>${ctx.escapeHtml(ctx.t('Diaria'))}</option>
          <option value="weekly" ${frequency === 'weekly' ? 'selected' : ''}>${ctx.escapeHtml(ctx.t('Semanal'))}</option>
          <option value="biweekly" ${frequency === 'biweekly' ? 'selected' : ''}>${ctx.escapeHtml(ctx.t('Bisemanal'))}</option>
          <option value="monthly" ${frequency === 'monthly' ? 'selected' : ''}>${ctx.escapeHtml(ctx.t('Mensual'))}</option>
        </select></label>
        <label class="field" ${isMonthly ? '' : 'hidden'}><span>${ctx.escapeHtml(ctx.t('Día mes'))}</span><input data-auto-field="day" type="number" min="1" max="28" step="1" placeholder="1-28" value="${ctx.escapeHtml(plan.day ?? '')}" /></label>
        <label class="field" ${isWeekly ? '' : 'hidden'}><span>${ctx.escapeHtml(ctx.t('Día semana'))}</span><select data-auto-field="weekday">
          <option value="">${ctx.escapeHtml(ctx.t('Día'))}</option>
          ${ctx.weekdayOptions(plan.weekday)}
        </select></label>
        <label class="field"><span>${ctx.escapeHtml(ctx.t('Inicio'))}</span><input data-auto-field="startDate" type="date" lang="${ctx.escapeHtml(ctx.dateInputLang?.() || 'es')}" value="${ctx.escapeHtml(plan.startDate || '')}" /></label>
        <button class="button button-compact btn-cancel" type="button" data-remove-auto-plan="${index}">${ctx.escapeHtml(ctx.t('Quitar'))}</button>
      </div>`;
  }

  function openAutoDialog() {
    ctx.state.autoPlanDrafts = (ctx.state.autoPlans || []).map((plan) => ({ ...plan }));
    ctx.state.autoPlanRetroactiveConfirmed = false;
    renderAutoPlans();
    ctx.elements.autoFeedback.textContent = ctx.t('Si el día elegido no tiene mercado, se usará el siguiente cierre disponible.');
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
    ctx.state.autoPlanDrafts = [
      ...(ctx.state.autoPlanDrafts || []),
      { symbol: '', amountEur: '', frequency: '', day: '', weekday: '', enabled: true, startDate: '' },
    ];
    ctx.state.autoPlanRetroactiveConfirmed = false;
    renderAutoPlans();
  }

  function removeAutoPlanDraft(index) {
    ctx.state.autoPlanDrafts = (ctx.state.autoPlanDrafts || []).filter((_, itemIndex) => itemIndex !== index);
    ctx.state.autoPlanRetroactiveConfirmed = false;
    renderAutoPlans();
  }

  function updateAutoPlanDraftFromField(field) {
    const row = field.closest('[data-auto-plan-row]');
    if (!row) return;
    const index = Number(row.dataset.autoPlanRow);
    const draft = { ...(ctx.state.autoPlanDrafts[index] || {}) };
    const key = field.dataset.autoField;
    draft[key] = field.type === 'checkbox' ? field.checked : field.value;
    ctx.state.autoPlanDrafts[index] = draft;
    ctx.state.autoPlanRetroactiveConfirmed = false;
    if (key === 'frequency') renderAutoPlans();
  }

  function collectAutoPlansFromForm() {
    return Array.from(ctx.elements.autoPlanList.querySelectorAll('[data-auto-plan-row]')).map((row) => {
      const frequency = row.querySelector('[data-auto-field="frequency"]')?.value || '';
      return {
        symbol: row.querySelector('[data-auto-field="symbol"]').value.trim().toUpperCase(),
        amountEur: Number(row.querySelector('[data-auto-field="amountEur"]').value),
        frequency,
        day: frequency === 'monthly' ? Number(row.querySelector('[data-auto-field="day"]')?.value) : undefined,
        weekday: ['weekly', 'biweekly'].includes(frequency)
          ? Number(row.querySelector('[data-auto-field="weekday"]')?.value)
          : undefined,
        startDate: row.querySelector('[data-auto-field="startDate"]').value,
        enabled: row.querySelector('[data-auto-field="enabled"]').checked,
      };
    });
  }

  async function saveAutoPlansFromForm() {
    const autoPlans = collectAutoPlansFromForm();
    try {
      const previewData = await ctx.sendJson('/api/auto-plans/preview', 'POST', { autoPlans });
      const warnings = previewData.preview.warnings || [];
      if ((warnings.length || previewData.preview.pendingCount > 1) && !ctx.state.autoPlanRetroactiveConfirmed) {
        ctx.state.autoPlanRetroactiveConfirmed = true;
        const parts = [];
        if (warnings.length) {
          parts.push(warnings.map((warning) => warning.message).join(' '));
        }
        if (previewData.preview.pendingCount > 1) {
          const estimated = Number(previewData.preview.estimatedTotalEur || 0);
          const totalCopy = estimated > 0 ? ctx.t(' por {amount} en total', { amount: ctx.formatCurrency(estimated) }) : '';
          parts.push(ctx.t('{count} aportaciones pendientes{total}. Pulsa Guardar de nuevo para confirmar.', {
            count: previewData.preview.pendingCount,
            total: totalCopy,
          }));
        }
        ctx.elements.autoFeedback.textContent = parts.join(' ');
        ctx.elements.autoFeedback.dataset.state = 'error';
        return;
      }
      const data = await ctx.sendJson('/api/auto-plans', 'PUT', { autoPlans });
      ctx.state.autoPlans = data.autoPlans;
      ctx.state.autoPlanDrafts = data.autoPlans.map((plan) => ({ ...plan }));
      ctx.state.autoPlanRetroactiveConfirmed = false;
      ctx.state.historyCache = {};
      let feedbackMsg = data.warnings?.length ? data.warnings.map((warning) => warning.message).join(' ') : ctx.t('Planes de aportación guardados.');
      if (data.backup) {
        feedbackMsg += ` ${ctx.t('Backup automático creado: {file}', { file: data.backup.file })}`;
      }
      ctx.elements.autoFeedback.textContent = feedbackMsg;
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
    populateAddTickerOptions,
    syncOperationCopy,
    syncAmountInputs,
    handleEntryModeChange,
    openOperationDialog,
    closeAddDialog,
    handleTransactionSubmit,
    renderAutoPlans,
    renderAutoPlanRow,
    openAutoDialog,
    closeAutoDialog,
    addAutoPlanDraft,
    removeAutoPlanDraft,
    updateAutoPlanDraftFromField,
    saveAutoPlansFromForm,
  });
}
