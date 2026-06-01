export function attach(ctx) {
  function setWizardFeedback(message, isError = false) {
    ctx.elements.wizardFeedback.textContent = message;
    ctx.elements.wizardFeedback.dataset.state = message ? (isError ? 'error' : 'ok') : '';
  }

  function openWizardDialog() {
    if (ctx.elements.autoDialog.open) ctx.elements.autoDialog.close();
    if (ctx.elements.instrumentDialog.open) ctx.elements.instrumentDialog.close();
    if (ctx.elements.addDialog.open) ctx.elements.addDialog.close();
    if (ctx.elements.wizardDialog.open) return;
    ctx.elements.wizardForm.reset();
    if (ctx.elements.wizardModeManual) ctx.elements.wizardModeManual.checked = true;
    ctx.elements.wizardGroupColor.value = '#16a34a';
    if (ctx.elements.wizardGroupDistribution) ctx.elements.wizardGroupDistribution.checked = true;
    if (ctx.elements.wizardGroupMonthly) ctx.elements.wizardGroupMonthly.checked = true;
    if (ctx.elements.wizardGroupExpandable) ctx.elements.wizardGroupExpandable.checked = false;
    ctx.elements.wizardInstrumentColor.value = '#2563eb';
    ctx.elements.wizardInstrumentCurrency.value = 'EUR';
    ctx.elements.wizardInstrumentType.value = 'etf';
    ctx.elements.wizardPlanFrequency.value = '';
    ctx.elements.wizardPlanDay.value = '';
    ctx.elements.wizardPlanWeekday.value = '';
    ctx.elements.wizardTransactionDate.value = ctx.todayInputValue();
    ctx.elements.wizardPlanStart.value = '';
    ctx.elements.wizardPlanConfirmRetroactive.checked = false;
    ctx.elements.wizardPlanConfirmField.hidden = true;
    ctx.elements.wizardPlanPreview.hidden = true;
    ctx.state.wizardPreview = null;
    syncWizardOptionalSections();
    syncWizardMode();
    setWizardFeedback('');
    ctx.elements.wizardDialog.showModal();
    ctx.elements.wizardGroupName.focus();
  }

  function closeWizardDialog() {
    ctx.elements.wizardDialog.close();
  }

  function syncWizardAmountInputs(event) {
    const source = event.target;
    const target =
      source === ctx.elements.wizardTransactionEuros
        ? ctx.elements.wizardTransactionShares
        : ctx.elements.wizardTransactionEuros;
    if (
      (source === ctx.elements.wizardTransactionEuros || source === ctx.elements.wizardTransactionShares) &&
      source.value &&
      Number(source.value) > 0
    ) {
      target.value = '';
    }
    setWizardFeedback('');
  }

  function syncWizardOptionalSections() {
    const transactionEnabled = ctx.elements.wizardAddTransaction.checked;
    const planEnabled = ctx.elements.wizardAddPlan.checked;
    ctx.elements.wizardForm.querySelectorAll('[data-optional-section="transaction"]').forEach((input) => {
      input.disabled = !transactionEnabled;
    });
    ctx.elements.wizardForm.querySelectorAll('[data-optional-section="plan"]').forEach((input) => {
      input.disabled = !planEnabled;
    });
    syncWizardPlanFrequency();
    ctx.elements.wizardPlanConfirmRetroactive.checked = false;
    ctx.elements.wizardPlanConfirmField.hidden = true;
    ctx.elements.wizardPlanPreview.hidden = true;
    ctx.state.wizardPreview = null;
    setWizardFeedback('');
  }

  function syncWizardPlanFrequency() {
    const frequency = ctx.elements.wizardPlanFrequency.value;
    const planEnabled = ctx.elements.wizardAddPlan.checked;
    ctx.elements.wizardPlanDayField.hidden = frequency !== 'monthly';
    ctx.elements.wizardPlanWeekdayField.hidden = frequency !== 'weekly' && frequency !== 'biweekly';
    ctx.elements.wizardPlanDay.disabled = !planEnabled || frequency !== 'monthly';
    ctx.elements.wizardPlanWeekday.disabled = !planEnabled || (frequency !== 'weekly' && frequency !== 'biweekly');
  }

  function syncWizardMode() {
    const importMode = Boolean(ctx.elements.wizardModeImport?.checked);
    ctx.elements.wizardImportEntry.hidden = !importMode;
    const grid = ctx.elements.wizardForm.querySelector('.wizard-grid');
    if (grid) grid.hidden = importMode;
    ctx.elements.wizardSubmit.hidden = importMode;
    if (!importMode) return;
    setWizardFeedback('El modo importación abre la modal de importaciones para cargar operaciones en bloque.');
  }

  function buildWizardTransactionPayload(symbol) {
    const payload = {
      id: ctx.clientRequestId('wizard-tx'),
      type: 'add',
      symbol,
      date: ctx.elements.wizardTransactionDate.value || ctx.todayInputValue(),
    };
    const euros = Number(ctx.elements.wizardTransactionEuros.value);
    const shares = Number(ctx.elements.wizardTransactionShares.value);
    const commissionEur = Number(ctx.elements.wizardTransactionCommission.value);
    if (Number.isFinite(euros) && euros > 0) payload.euros = euros;
    if (Number.isFinite(shares) && shares > 0) payload.shares = shares;
    if (Number.isFinite(commissionEur) && commissionEur > 0) payload.commissionEur = commissionEur;
    if (Boolean(payload.euros) === Boolean(payload.shares)) {
      throw new Error('En la primera compra indica euros o acciones, solo uno de los dos campos.');
    }
    return payload;
  }

  function buildWizardPayload() {
    const symbol = ctx.elements.wizardInstrumentSymbol.value.trim().toUpperCase();
    const payload = {
      group: {
        name: ctx.elements.wizardGroupName.value.trim(),
        color: ctx.elements.wizardGroupColor.value,
        showInDistribution: true,
        showInMonthly: true,
        isExpandable: false,
      },
      instrument: {
        symbol,
        yahooSymbol: ctx.elements.wizardInstrumentYahoo.value.trim() || symbol,
        name: ctx.elements.wizardInstrumentName.value.trim() || symbol,
        type: ctx.elements.wizardInstrumentType.value,
        currency: ctx.elements.wizardInstrumentCurrency.value || 'EUR',
        color: ctx.elements.wizardInstrumentColor.value,
      },
      confirmRetroactive: ctx.elements.wizardPlanConfirmRetroactive.checked,
    };

    if (ctx.elements.wizardAddTransaction.checked) {
      payload.transaction = { ...buildWizardTransactionPayload(symbol), enabled: true };
      delete payload.transaction.id;
    }

    if (ctx.elements.wizardAddPlan.checked) {
      payload.autoPlan = {
        enabled: true,
        amountEur: Number(ctx.elements.wizardPlanAmount.value),
        frequency: ctx.elements.wizardPlanFrequency.value,
        day: Number(ctx.elements.wizardPlanDay.value),
        weekday: Number(ctx.elements.wizardPlanWeekday.value),
        startDate: ctx.elements.wizardPlanStart.value,
      };
    }

    return payload;
  }

  function renderWizardPlanPreview(preview) {
    const pending = preview?.autoPlan?.pendingCount || 0;
    if (!pending) {
      ctx.elements.wizardPlanPreview.hidden = true;
      ctx.elements.wizardPlanConfirmField.hidden = true;
      return;
    }
    const first = preview.autoPlan.plans.find((item) => item.pendingCount > 0);
    ctx.elements.wizardPlanPreview.hidden = false;
    ctx.elements.wizardPlanPreview.innerHTML = `
      <span>Plan de aportación</span>
      <strong>${pending} aportaciones pendientes</strong>
      <small>Primera: ${ctx.formatDate(first?.firstDate)} - Ultima: ${ctx.formatDate(first?.lastDate)}</small>
      <small>Importe estimado: ${ctx.formatCurrency(Number(preview.autoPlan.estimatedTotalEur || 0))}</small>
    `;
    ctx.elements.wizardPlanConfirmField.hidden = pending <= 1;
  }

  async function handleWizardSubmit(event) {
    event.preventDefault();
    ctx.elements.wizardSubmit.disabled = true;
    setWizardFeedback('Validando alta completa...');
    try {
      const payload = buildWizardPayload();
      const previewData = await ctx.sendJson('/api/onboarding/wizard/preview', 'POST', payload, { timeoutMs: 20000 });
      ctx.state.wizardPreview = previewData.preview;
      renderWizardPlanPreview(previewData.preview);
      if (previewData.preview.requiresRetroactiveConfirmation && !payload.confirmRetroactive) {
        setWizardFeedback('Confirma las aportaciones retroactivas pendientes antes de guardar.', true);
        return;
      }

      setWizardFeedback('Guardando alta completa...');
      const data = await ctx.sendJson('/api/onboarding/wizard/commit', 'POST', payload, { timeoutMs: 30000 });
      ctx.state.autoPlans = data.autoPlans || ctx.state.autoPlans;
      setWizardFeedback('Cartera inicial creada.');
      ctx.state.historyCache = {};
      await Promise.all([ctx.refreshDashboard(), ctx.refreshHistory({ force: true })]);
      window.setTimeout(closeWizardDialog, 500);
    } catch (error) {
      setWizardFeedback(ctx.normalizeErrorMessage(error), true);
    } finally {
      ctx.elements.wizardSubmit.disabled = false;
    }
  }

  Object.assign(ctx, {
    setWizardFeedback,
    openWizardDialog,
    closeWizardDialog,
    syncWizardAmountInputs,
    syncWizardOptionalSections,
    syncWizardPlanFrequency,
    syncWizardMode,
    buildWizardPayload,
    handleWizardSubmit,
  });
}
