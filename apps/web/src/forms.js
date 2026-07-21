import { attachTransactionEntryModes } from './transaction-entry-modes.js';
import { createAutoPlanForm } from './auto-plan-form.js';
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
    const priceCurrency = String(ctx.elements.addPriceCurrency.value || '')
      .trim()
      .toUpperCase();
    const fxToEur = Number(ctx.elements.addFx.value);
    const commission = Number(ctx.elements.addCommission.value);
    const note = String(ctx.elements.addNote.value || '').trim();
    const payload = { type, symbol, date: ctx.elements.addDate.value, entryMode };
    if (includeId) payload.id = ctx.clientRequestId('tx');
    if (entryMode === 'market_eur' && Number.isFinite(euros) && euros > 0) {
      payload.euros = euros;
    } else if (
      entryMode === 'manual_total_eur' &&
      Number.isFinite(euros) &&
      euros > 0 &&
      Number.isFinite(shares) &&
      shares > 0
    ) {
      payload.euros = euros;
      payload.shares = shares;
    } else if (
      entryMode === 'manual_unit_price' &&
      Number.isFinite(shares) &&
      shares > 0 &&
      Number.isFinite(price) &&
      price > 0
    ) {
      payload.shares = shares;
      payload.unitPrice = price;
      if (priceCurrency) payload.priceCurrency = priceCurrency;
      if (Number.isFinite(fxToEur) && fxToEur > 0) payload.fxToEur = fxToEur;
    }
    if (Number.isFinite(commission) && commission > 0) payload.commissionEur = commission;
    if (note) payload.note = note;
    return payload;
  }

  function transactionTypeLabel(type) {
    return type === 'remove' ? ctx.t('history.events.sell') : ctx.t('history.events.buy');
  }

  function transactionPreviewDetails(preview) {
    const modeLabel =
      preview.type === 'remove' && preview.entryMode === 'manual_total_eur'
        ? ctx.t('form.operation.manualSellEur')
        : preview.entryMode
          ? ctx.transactionEntryModeLabel(preview.entryMode)
          : preview.manualUnitPrice
            ? ctx.t('form.operation.manualPrice')
            : ctx.t('form.operation.market');
    const marketDate =
      preview.entryMode === 'market_eur'
        ? `${ctx.t('form.operation.marketDate')}: ${ctx.formatDate(preview.marketDate)}`
        : '';
    return { modeLabel, marketDate };
  }

  function buildTransactionLoadingSummary(preview) {
    const { modeLabel, marketDate } = transactionPreviewDetails(preview);
    const cashFlowEur = Number(preview.cashFlowEur || 0);
    return {
      heading: `${preview.symbol} - ${transactionTypeLabel(preview.type)}`,
      rows: [
        {
          label: ctx.t('form.operation.mode'),
          value: marketDate ? `${modeLabel} - ${marketDate}` : modeLabel,
        },
        {
          label: ctx.t('form.operation.quantity'),
          value: ctx.formatInstrumentQuantity(preview.shares, preview),
        },
        {
          label: ctx.t('form.operation.price'),
          value: `${Number(preview.price).toFixed(2)} ${preview.currency}`,
        },
        { label: ctx.t('form.operation.value'), value: ctx.formatCurrency(Number(preview.valueEur)) },
        {
          label: ctx.t('form.operation.commission'),
          value: ctx.formatCurrency(Number(preview.commissionEur || 0)),
        },
        {
          label: ctx.t('form.operation.cashFlow'),
          value: ctx.formatCurrency(cashFlowEur),
          tone: cashFlowEur >= 0 ? 'positive' : 'negative',
        },
      ],
    };
  }

  function renderTransactionPreview(preview) {
    ctx.elements.transactionPreview.hidden = false;
    const { modeLabel, marketDate } = transactionPreviewDetails(preview);
    const marketDateCopy = marketDate ? ` - ${marketDate}` : '';
    ctx.elements.transactionPreview.innerHTML = `
      <span>${ctx.t('form.operation.preview')}</span>
      <strong>${preview.symbol} - ${transactionTypeLabel(preview.type)}</strong>
      <small>${ctx.t('form.operation.mode')}: ${modeLabel}${marketDateCopy} - ${ctx.t('form.operation.price')}: ${Number(preview.price).toFixed(2)} ${preview.currency}</small>
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
    if (mode === 'manual_total_eur')
      return Number.isFinite(euros) && euros > 0 && Number.isFinite(shares) && shares > 0;
    return Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price > 0;
  }

  async function refreshTransactionPreview() {
    const payload = buildTransactionPayload(false);
    ctx.elements.transactionPreview.hidden = true;
    ctx.state.transactionPreviewOk = false;
    ctx.state.transactionPreview = null;
    if (!payload.symbol || !payload.date || !hasValidAmount()) return false;
    try {
      const data = await ctx.api.transactions.preview(payload, { timeoutMs: 20000 });
      renderTransactionPreview(data.preview);
      ctx.state.transactionPreviewOk = true;
      ctx.state.transactionPreview = data.preview;
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
    ctx.elements.operationTitle.textContent = ctx.t(
      isRemove ? 'form.operation.title.sell' : 'form.operation.title.buy',
    );
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
      ctx.state.transactionPreview = null;
      setAddFeedback(
        ctx.t(
          isRemove
            ? 'No hay ninguna posición abierta. Registra una compra antes de añadir una venta.'
            : 'No hay valores creados. Crea un valor antes de registrar compras.',
        ),
      );
    }
  }

  function syncAmountInputs(event) {
    const source = event.target;
    if (source === ctx.elements.addTicker || source === ctx.elements.removeTicker)
      ctx.syncEntryModeUi({ resetCurrency: true });
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
        ctx.t(
          ctx.elements.operationType.value === 'remove'
            ? 'Indica la cantidad vendida y el importe bruto de venta en EUR.'
            : 'Indica el total en euros, o bien la cantidad con su precio unitario.',
        ),
        true,
      );
      return;
    }
    const isSell = ctx.elements.operationType.value === 'remove';
    ctx.elements.addSubmit.disabled = true;
    setAddFeedback(ctx.t('Validando precio y movimiento...'));
    try {
      await ctx.withAppLoading(
        {
          title: ctx.t(isSell ? 'loading.sell.title' : 'loading.buy.title'),
          message: ctx.t(isSell ? 'loading.sell.message' : 'loading.buy.message'),
        },
        async (update) => {
          const previewOk = ctx.state.transactionPreviewOk || (await refreshTransactionPreview());
          if (!previewOk) throw new Error(ctx.t('Revisa la previsualización antes de guardar'));
          const preview = ctx.state.transactionPreview;
          if (!preview) throw new Error(ctx.t('Revisa la previsualización antes de guardar'));
          update({
            title: ctx.t(isSell ? 'loading.sell.title' : 'loading.buy.title'),
            summary: buildTransactionLoadingSummary(preview),
          });
          let transaction;
          try {
            const data = await ctx.api.transactions.create(payload);
            transaction = data.transaction;
          } catch (createError) {
            transaction = await ctx.findTransactionById(payload.id).catch(() => null);
            if (!transaction) throw createError;
          }
          setAddFeedback(ctx.t('{symbol}: movimiento guardado.', { symbol: transaction.symbol }));
          ctx.state.historyCache = {};
          await ctx.refreshDashboard();
          await ctx.refreshHistory({ force: true });
        },
      );
      closeAddDialog();
    } catch (error) {
      setAddFeedback(ctx.normalizeErrorMessage(error), true);
    } finally {
      ctx.elements.addSubmit.disabled = false;
    }
  }

  const autoPlanForm = createAutoPlanForm(ctx, { visibleInstruments });

  Object.assign(ctx, {
    setAddFeedback,
    buildTransactionPayload,
    buildTransactionLoadingSummary,
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
    ...autoPlanForm,
  });
}
