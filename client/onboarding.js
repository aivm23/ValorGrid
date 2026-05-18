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
    ctx.elements.wizardGroupColor.value = '#16a34a';
    ctx.elements.wizardGroupDistribution.checked = true;
    ctx.elements.wizardGroupMonthly.checked = true;
    ctx.elements.wizardGroupExpandable.checked = false;
    ctx.elements.wizardInstrumentColor.value = '#2563eb';
    ctx.elements.wizardInstrumentCurrency.value = 'EUR';
    ctx.elements.wizardInstrumentType.value = 'etf';
    ctx.elements.wizardPlanDay.value = '3';
    ctx.elements.wizardTransactionDate.value = ctx.todayInputValue();
    ctx.elements.wizardPlanStart.value = ctx.todayInputValue();
    syncWizardOptionalSections();
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
    setWizardFeedback('');
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

  async function handleWizardSubmit(event) {
    event.preventDefault();
    const symbol = ctx.elements.wizardInstrumentSymbol.value.trim().toUpperCase();
    const yahooSymbol = ctx.elements.wizardInstrumentYahoo.value.trim() || symbol;
    const name = ctx.elements.wizardInstrumentName.value.trim() || symbol;
    const groupName = ctx.elements.wizardGroupName.value.trim();
    if (!groupName || !symbol) {
      setWizardFeedback('Indica grupo e instrumento para empezar.', true);
      return;
    }

    ctx.elements.wizardSubmit.disabled = true;
    setWizardFeedback('Creando estructura inicial...');
    try {
      const groupData = await ctx.sendJson('/api/instrument-groups', 'POST', {
        name: groupName,
        color: ctx.elements.wizardGroupColor.value,
        showInDistribution: ctx.elements.wizardGroupDistribution.checked,
        showInMonthly: ctx.elements.wizardGroupMonthly.checked,
        isExpandable: ctx.elements.wizardGroupExpandable.checked,
      });
      await ctx.sendJson('/api/instruments', 'POST', {
        symbol,
        yahooSymbol,
        name,
        type: ctx.elements.wizardInstrumentType.value,
        currency: ctx.elements.wizardInstrumentCurrency.value || 'EUR',
        groupId: groupData.group.id,
        color: ctx.elements.wizardInstrumentColor.value,
      });

      if (ctx.elements.wizardAddTransaction.checked) {
        const transactionPayload = buildWizardTransactionPayload(symbol);
        await ctx.sendJson('/api/transactions/preview', 'POST', transactionPayload, { timeoutMs: 20000 });
        await ctx.sendJson('/api/transactions', 'POST', transactionPayload);
      }

      if (ctx.elements.wizardAddPlan.checked) {
        const plan = {
          symbol,
          amountEur: Number(ctx.elements.wizardPlanAmount.value),
          day: Number(ctx.elements.wizardPlanDay.value),
          startDate: ctx.elements.wizardPlanStart.value,
          enabled: true,
        };
        const plans = [...(ctx.state.autoPlans || []).filter((item) => item.symbol !== symbol), plan];
        const data = await ctx.sendJson('/api/auto-plans', 'PUT', { autoPlans: plans });
        ctx.state.autoPlans = data.autoPlans;
      }

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
    handleWizardSubmit,
  });
}
