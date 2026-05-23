export function attach(ctx) {
  const { elements, state, document, window, fetchJson, sendJson, normalizeErrorMessage } = ctx;
  const syncStickyToolbar = () => {
    elements.headerActions.classList.toggle('is-fixed', window.scrollY > 120);
  };
  syncStickyToolbar();
  window.addEventListener('scroll', syncStickyToolbar, { passive: true });

  elements.refreshPrices.addEventListener('click', () => {
    state.historyCache = {};
    ctx.refreshDashboard();
    ctx.refreshHistory({ force: true });
  });
  elements.addPosition.addEventListener('click', () => ctx.openOperationDialog('add'));
  elements.removePosition.addEventListener('click', () => ctx.openOperationDialog('remove'));
  elements.onboardingWizard?.addEventListener('click', ctx.openWizardDialog);
  elements.addDialogClose.addEventListener('click', ctx.closeAddDialog);
  elements.addCancel.addEventListener('click', ctx.closeAddDialog);
  elements.addForm.addEventListener('submit', ctx.handleTransactionSubmit);
  elements.addEuros.addEventListener('input', ctx.syncAmountInputs);
  elements.addShares.addEventListener('input', ctx.syncAmountInputs);
  elements.addCommission.addEventListener('input', ctx.syncAmountInputs);
  elements.addTicker.addEventListener('input', ctx.syncAmountInputs);
  elements.removeTicker.addEventListener('change', ctx.syncAmountInputs);
  elements.addDate.addEventListener('change', ctx.syncAmountInputs);
  elements.operationType.addEventListener('change', ctx.syncOperationCopy);
  elements.autoCalendar.addEventListener('click', ctx.openAutoDialog);
  elements.instrumentManager.addEventListener('click', () => {
    ctx.renderInstruments();
    elements.instrumentDialog.showModal();
  });
  elements.instrumentDialogClose.addEventListener('click', () => elements.instrumentDialog.close());
  elements.instrumentCancel.addEventListener('click', () => elements.instrumentDialog.close());
  elements.autoDialogClose.addEventListener('click', ctx.closeAutoDialog);
  elements.autoCancel.addEventListener('click', ctx.closeAutoDialog);
  elements.autoPlanList.addEventListener('click', (event) => {
    if (event.target.closest('[data-add-auto-plan]')) ctx.addAutoPlanDraft();
    const removeButton = event.target.closest('[data-remove-auto-plan]');
    if (removeButton) ctx.removeAutoPlanDraft(Number(removeButton.dataset.removeAutoPlan));
    if (event.target.closest('[data-open-onboarding]')) {
      event.stopPropagation();
      ctx.openWizardDialog();
    }
  });
  elements.autoPlanList.addEventListener('input', (event) => {
    if (event.target.matches('[data-auto-field]')) ctx.updateAutoPlanDraftFromField(event.target);
  });
  elements.autoPlanList.addEventListener('change', (event) => {
    if (event.target.matches('[data-auto-field]')) ctx.updateAutoPlanDraftFromField(event.target);
  });
  elements.autoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    ctx.saveAutoPlansFromForm();
  });
  elements.wizardDialogClose.addEventListener('click', ctx.closeWizardDialog);
  elements.wizardCancel.addEventListener('click', ctx.closeWizardDialog);
  elements.wizardForm.addEventListener('submit', ctx.handleWizardSubmit);
  elements.wizardModeManual?.addEventListener('change', ctx.syncWizardMode);
  elements.wizardModeImport?.addEventListener('change', ctx.syncWizardMode);
  elements.wizardOpenImport?.addEventListener('click', () => {
    ctx.closeWizardDialog();
    ctx.openImportDialog();
  });
  elements.wizardAddTransaction.addEventListener('change', ctx.syncWizardOptionalSections);
  elements.wizardAddPlan.addEventListener('change', ctx.syncWizardOptionalSections);
  elements.wizardPlanFrequency.addEventListener('change', ctx.syncWizardPlanFrequency);
  elements.wizardTransactionEuros.addEventListener('input', ctx.syncWizardAmountInputs);
  elements.wizardTransactionShares.addEventListener('input', ctx.syncWizardAmountInputs);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-onboarding]')) ctx.openWizardDialog();
    if (
      !event.target.closest('#portfolio-chart') &&
      !event.target.closest('#holdings-legend') &&
      !event.target.closest('#donut-tooltip')
    ) {
      ctx.closeDonutTooltip();
    }
  });
  elements.themeToggle.addEventListener('click', () => {
    ctx.applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  elements.balanceToggle.addEventListener('click', ctx.toggleBalanceVisibility);
  elements.legend.addEventListener('click', (event) => toggleExpandableGroup(ctx, event));
  elements.chart.addEventListener('mousemove', ctx.showDonutTooltip);
  elements.chart.addEventListener('mouseleave', ctx.hideDonutTooltip);
  elements.chart.addEventListener('click', ctx.pinDonutTooltip);
  elements.legend.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!event.target.closest('[data-action="toggle-stock-detail"]')) return;
    event.preventDefault();
    toggleExpandableGroup(ctx, event);
  });
  elements.stockDetailClose.addEventListener('click', () => {
    state.expandedGroupId = null;
    ctx.renderSummary();
  });
  elements.historyRangeButtons.forEach((button) => {
    button.addEventListener('click', () => ctx.setHistoryRange(button.dataset.historyRange));
  });
  elements.historyChart.addEventListener('mouseover', ctx.showHistoryTooltip);
  elements.historyChart.addEventListener('mousemove', ctx.moveHistoryTooltip);
  elements.historyChart.addEventListener('mouseout', ctx.hideHistoryTooltip);
  elements.ledgerFilterSymbol.addEventListener('input', ctx.renderLedger);
  elements.ledgerFilterOrigin.addEventListener('change', ctx.renderLedger);
  elements.ledgerFilterType.addEventListener('change', ctx.renderLedger);
  elements.ledgerFilterFrom.addEventListener('change', ctx.renderLedger);
  elements.ledgerFilterTo.addEventListener('change', ctx.renderLedger);
  elements.ledgerRows.addEventListener('click', (event) => deleteLedgerRow(ctx, event));
  elements.createBackup?.addEventListener('click', () => createBackup(ctx));
  elements.toolbarBackup?.addEventListener('click', () => createBackup(ctx));
  elements.openImportDialog?.addEventListener('click', ctx.openImportDialog);
  elements.openImportDialogToolbar?.addEventListener('click', ctx.openImportDialog);
  elements.importDialogClose.addEventListener('click', ctx.closeImportDialog);
  elements.importCancel.addEventListener('click', ctx.closeImportDialog);
  elements.importSource.addEventListener('change', ctx.handleImportSourceChange);
  elements.importFile.addEventListener('change', ctx.handleImportFile);
  elements.importSheet.addEventListener('change', ctx.handleImportSheetChange);
  elements.importPreview.addEventListener('click', ctx.previewCsvImport);
  elements.importCommit.addEventListener('click', ctx.commitCsvImport);
  elements.importBatches.addEventListener('click', ctx.rollbackImportBatch);
  elements.instrumentRows.addEventListener('click', (event) => saveInstrument(ctx, event));
  elements.groupRows.addEventListener('click', (event) => saveGroup(ctx, event));
  elements.createGroup.addEventListener('click', () => createGroup(ctx));
  elements.createInstrument.addEventListener('click', () => createInstrument(ctx));

  async function deleteLedgerRow(localCtx, event) {
    const button = event.target.closest('[data-delete-transaction]');
    if (!button) return;
    const transaction = state.transactions.find((item) => item.id === button.dataset.deleteTransaction);
    if (!transaction || !window.confirm('Borrar ' + transaction.symbol + ' del ' + localCtx.formatDate(transaction.date) + '?')) return;
    await fetch('/api/transactions/' + encodeURIComponent(transaction.id), { method: 'DELETE', cache: 'no-store' });
    state.historyCache = {};
    await localCtx.refreshDashboard();
    await localCtx.refreshHistory({ force: true });
  }

  async function createBackup(localCtx) {
    elements.createBackup.disabled = true;
    try {
      await sendJson('/api/backups', 'POST', {});
      const backupData = await fetchJson('/api/backups');
      state.backups = backupData.backups || [];
      localCtx.renderBackups();
    } catch (error) {
      elements.backupList.textContent = normalizeErrorMessage(error);
    } finally {
      elements.createBackup.disabled = false;
    }
  }
}

function toggleExpandableGroup(ctx, event) {
  const trigger = event.target.closest('[data-action="toggle-stock-detail"]');
  if (!trigger) return;
  const groupId = trigger.dataset.groupId;
  if (!groupId) return;
  ctx.state.expandedGroupId = ctx.state.expandedGroupId === groupId ? null : groupId;
  ctx.renderSummary();
}

async function saveInstrument(ctx, event) {
  const button = event.target.closest('[data-save-instrument]');
  if (!button) return;
  const row = button.closest('[data-instrument]');
  const payload = {};
  row.querySelectorAll('[data-field]').forEach((input) => {
    payload[input.dataset.field] = input.value;
  });
  button.disabled = true;
  try {
    await ctx.sendJson('/api/instruments/' + encodeURIComponent(row.dataset.instrument), 'PUT', payload);
    ctx.state.historyCache = {};
    await ctx.refreshDashboard();
    await ctx.refreshHistory({ force: true });
  } catch (error) {
    ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
  } finally {
    button.disabled = false;
  }
}

async function saveGroup(ctx, event) {
  const button = event.target.closest('[data-save-group]');
  if (!button) return;
  const row = button.closest('[data-group]');
  const payload = {};
  row.querySelectorAll('[data-group-field]').forEach((input) => {
    payload[input.dataset.groupField] = input.type === 'checkbox' ? input.checked : input.value;
  });
  button.disabled = true;
  try {
    await ctx.sendJson('/api/instrument-groups/' + encodeURIComponent(row.dataset.group), 'PUT', payload);
    ctx.state.historyCache = {};
    await ctx.refreshDashboard();
    await ctx.refreshHistory({ force: true });
  } catch (error) {
    ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
  } finally {
    button.disabled = false;
  }
}

async function createGroup(ctx) {
  try {
    await ctx.sendJson('/api/instrument-groups', 'POST', {
      name: ctx.elements.newGroupName.value,
      color: ctx.elements.newGroupColor.value,
      showInDistribution: true,
      showInMonthly: true,
      isExpandable: false,
    });
    ctx.elements.newGroupName.value = '';
    await ctx.refreshDashboard();
  } catch (error) {
    ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
  }
}

async function createInstrument(ctx) {
  try {
    await ctx.sendJson('/api/instruments', 'POST', {
      symbol: ctx.elements.newInstrumentSymbol.value,
      yahooSymbol: ctx.elements.newInstrumentYahoo.value || ctx.elements.newInstrumentSymbol.value,
      name: ctx.elements.newInstrumentName.value || ctx.elements.newInstrumentSymbol.value,
      type: ctx.elements.newInstrumentType.value,
      currency: ctx.elements.newInstrumentCurrency.value || 'EUR',
      groupId: ctx.elements.newInstrumentGroup.value,
      color: ctx.elements.newInstrumentColor.value,
    });
    ctx.elements.newInstrumentSymbol.value = '';
    ctx.elements.newInstrumentYahoo.value = '';
    ctx.elements.newInstrumentName.value = '';
    await ctx.refreshDashboard();
  } catch (error) {
    ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
  }
}
