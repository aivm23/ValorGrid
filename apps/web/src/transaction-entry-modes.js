const entryModeCopy = {
  market_eur: ['transaction.mode.market.label', 'transaction.mode.market.hint'],
  manual_total_eur: ['transaction.mode.manualTotal.label', 'transaction.mode.manualTotal.hint'],
  manual_unit_price: ['transaction.mode.manualUnit.label', 'transaction.mode.manualUnit.hint'],
};

export function attachTransactionEntryModes(ctx, setAddFeedback) {
  function activeTransactionEntryMode() {
    if (ctx.elements.operationType.value === 'remove') return 'manual_total_eur';
    return Array.from(ctx.elements.addEntryModeInputs).find((input) => input.checked)?.value || 'market_eur';
  }

  function transactionEntryModeLabel(mode) {
    return ctx.t(entryModeCopy[mode]?.[0] || 'transaction.mode.market.label');
  }

  function selectedOperationInstrument() {
    const symbol =
      ctx.elements.operationType.value === 'remove' ? ctx.elements.removeTicker.value : ctx.elements.addTicker.value;
    return (ctx.state.instruments || []).find((instrument) => instrument.symbol === symbol) || null;
  }

  function resetTransactionPreview() {
    ctx.elements.transactionPreview.hidden = true;
    ctx.state.transactionPreviewOk = false;
    ctx.state.transactionPreview = null;
    setAddFeedback('');
  }

  function setModeField(field, input, visible, required = false) {
    field.hidden = !visible;
    input.disabled = !visible;
    input.required = visible && required;
  }

  function setFieldLabel(field, label) {
    const labelText = field.querySelector('span');
    if (labelText) labelText.textContent = label;
  }

  function syncEntryModeUi({ clearFields = false, resetCurrency = false } = {}) {
    const isSell = ctx.elements.operationType.value === 'remove';
    const mode = activeTransactionEntryMode();
    ctx.state.transactionEntryMode = mode;
    if (clearFields) {
      ctx.elements.addEuros.value = '';
      ctx.elements.addShares.value = '';
      ctx.elements.addPrice.value = '';
      ctx.elements.addFx.value = '';
    }
    if (mode === 'manual_unit_price' && (resetCurrency || !ctx.elements.addPriceCurrency.value)) {
      ctx.elements.addPriceCurrency.value = selectedOperationInstrument()?.currency || 'EUR';
    }
    const priceCurrency = String(ctx.elements.addPriceCurrency.value || 'EUR')
      .trim()
      .toUpperCase();
    ctx.elements.addPriceCurrency.value = priceCurrency;
    const fxVisible = mode === 'manual_unit_price' && priceCurrency !== 'EUR';
    ctx.elements.addEntryModeTabs.hidden = isSell;
    setFieldLabel(ctx.elements.addSharesField, isSell ? ctx.t('transaction.field.soldQuantity') : ctx.t('Cantidad'));
    setFieldLabel(
      ctx.elements.addEurosField,
      isSell ? ctx.t('transaction.field.grossSellEur') : ctx.t('transaction.field.totalEur'),
    );
    setModeField(ctx.elements.addEurosField, ctx.elements.addEuros, mode !== 'manual_unit_price', true);
    setModeField(ctx.elements.addSharesField, ctx.elements.addShares, mode !== 'market_eur', true);
    setModeField(ctx.elements.addPriceField, ctx.elements.addPrice, mode === 'manual_unit_price', true);
    setModeField(ctx.elements.addPriceCurrencyField, ctx.elements.addPriceCurrency, mode === 'manual_unit_price', true);
    setModeField(ctx.elements.addFxField, ctx.elements.addFx, fxVisible, fxVisible);
    if (!fxVisible) ctx.elements.addFx.value = '';
    ctx.elements.addAmountHint.hidden = false;
    ctx.elements.addAmountHint.textContent = isSell
      ? ctx.t('transaction.mode.sellHint')
      : ctx.t(entryModeCopy[mode][1]);
  }

  Object.assign(ctx, {
    activeTransactionEntryMode,
    resetTransactionPreview,
    syncEntryModeUi,
    transactionEntryModeLabel,
  });
}
