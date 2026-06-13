export function attach(ctx) {
  const { elements, state, document, window, fetchJson, sendJson, normalizeErrorMessage, deleteBackup } = ctx;
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
  elements.bootRetry?.addEventListener('click', () => {
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
  elements.addPrice.addEventListener('input', ctx.syncAmountInputs);
  elements.addCommission.addEventListener('input', ctx.syncAmountInputs);
  elements.addTicker.addEventListener('input', ctx.syncAmountInputs);
  elements.addTicker.addEventListener('change', ctx.syncAmountInputs);
  elements.removeTicker.addEventListener('change', ctx.syncAmountInputs);
  elements.addDate.addEventListener('change', ctx.syncAmountInputs);
  elements.operationType.addEventListener('change', ctx.syncOperationCopy);
  elements.operationCreateInstrument?.addEventListener('click', () => {
    state.returnToOperationDialogAfterInstrumentCreate = true;
    elements.addDialog.close();
    ctx.renderInstruments();
    elements.instrumentDialog.showModal();
    elements.newInstrumentSymbol.focus();
  });
  elements.autoCalendar.addEventListener('click', ctx.openAutoDialog);
  elements.instrumentManager.addEventListener('click', () => {
    ctx.renderInstruments();
    elements.instrumentDialog.showModal();
  });
  elements.adminManager?.addEventListener('click', () => {
    ctx.renderBackups();
    ctx.renderImportBatches?.();
    ctx.renderOperationsPreferenceControls?.();
    elements.adminDialog.showModal();
  });
  elements.adminDialogClose?.addEventListener('click', () => elements.adminDialog.close());
  elements.adminCancel?.addEventListener('click', () => elements.adminDialog.close());
  elements.negativeRedToggle?.addEventListener('change', (event) => {
    ctx.toggleNegativePreference(event);
    ctx.renderDashboard();
    ctx.renderHistory?.();
  });
  elements.ledgerPageSize?.addEventListener('change', ctx.handleLedgerPageSizeChange);
  elements.dateFormatSelect?.addEventListener('change', ctx.handleDateFormatChange);
  elements.weekStartSelect?.addEventListener('change', ctx.handleWeekStartChange);
  elements.instrumentDialogClose.addEventListener('click', () => {
    state.returnToOperationDialogAfterInstrumentCreate = false;
    elements.instrumentDialog.close();
  });
  elements.instrumentCancel.addEventListener('click', () => {
    state.returnToOperationDialogAfterInstrumentCreate = false;
    elements.instrumentDialog.close();
  });
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
  elements.stockChart.addEventListener('mousemove', ctx.showStockDonutTooltip);
  elements.stockChart.addEventListener('mouseleave', ctx.hideStockDonutTooltip);
  elements.stockChart.addEventListener('click', ctx.pinStockDonutTooltip);
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
  elements.ledgerRows.addEventListener('change', ctx.updateTransactionSelection);
  elements.ledgerRows.addEventListener('click', ctx.toggleTransactionRow);
  elements.selectVisibleTransactions?.addEventListener('click', ctx.selectVisibleTransactions);
  elements.deselectAllTransactions?.addEventListener('click', ctx.deselectAllTransactions);
  elements.deleteSelectedTransactions?.addEventListener('click', ctx.deleteSelectedTransactions);
  elements.ledgerPagination?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-ledger-page]');
    if (btn) ctx.goToLedgerPage(btn.dataset.ledgerPage);
  });
  elements.createBackup?.addEventListener('click', () => createBackup(ctx));
  elements.backupList?.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.backup-delete-btn');
    if (deleteButton) {
      handleDeleteBackup(deleteButton.dataset.file);
    }
  });
  elements.openImportDialog?.addEventListener('click', ctx.openImportDialog);
  elements.openImportDialogToolbar?.addEventListener('click', ctx.openImportDialog);
  elements.importDialogClose.addEventListener('click', ctx.closeImportDialog);
  elements.importCancel.addEventListener('click', ctx.closeImportDialog);
  elements.importSource.addEventListener('change', ctx.handleImportSourceChange);
  elements.importFile.addEventListener('change', ctx.handleImportFile);
  elements.importSheet.addEventListener('change', ctx.handleImportSheetChange);
  elements.importPreview.addEventListener('click', ctx.previewCsvImport);
  elements.importCommit.addEventListener('click', ctx.commitCsvImport);
  elements.importPreviewOutput.addEventListener('click', ctx.handleImportPreviewClick);
  elements.importPreviewOutput.addEventListener('change', ctx.handleImportPreviewInteraction);
  elements.importPreviewOutput.addEventListener('input', ctx.handleImportPreviewInteraction);
  elements.importBatches.addEventListener('click', ctx.rollbackImportBatch);
  elements.importDownloadTemplate?.addEventListener('click', ctx.downloadImportTemplate);
  elements.importFileZone?.addEventListener('click', (event) => {
    if (event.target.closest('.import-file-clear')) {
      event.preventDefault();
      ctx.clearImportFile();
    }
  });
  elements.importFileZone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.importFileZone.classList.add('drag-over');
  });
  elements.importFileZone?.addEventListener('dragleave', () => {
    elements.importFileZone.classList.remove('drag-over');
  });
  elements.importFileZone?.addEventListener('drop', () => {
    elements.importFileZone.classList.remove('drag-over');
  });
  elements.instrumentRows.addEventListener('click', (event) => saveInstrument(ctx, event));
  elements.instrumentRows.addEventListener('change', ctx.updateInstrumentSelection);
  elements.instrumentPositionFilter?.addEventListener('change', () => {
    state.instrumentPositionFilter = elements.instrumentPositionFilter.value || 'all';
    ctx.renderInstruments();
  });
  [
    elements.instrumentFilterSymbol,
    elements.instrumentFilterYahoo,
    elements.instrumentFilterName,
    elements.instrumentFilterGroup,
    elements.instrumentFilterCurrency,
  ].forEach((input) => {
    input?.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      state.instrumentFilters = {
        symbol: elements.instrumentFilterSymbol?.value || '',
        yahoo: elements.instrumentFilterYahoo?.value || '',
        name: elements.instrumentFilterName?.value || '',
        group: elements.instrumentFilterGroup?.value || '',
        currency: elements.instrumentFilterCurrency?.value || '',
      };
      ctx.renderInstruments();
    });
  });
  elements.deleteSelectedInstruments?.addEventListener('click', ctx.deleteSelectedInstruments);
  elements.instrumentDeleteDialogClose?.addEventListener('click', ctx.cancelInstrumentDelete);
  elements.instrumentDeleteCancel?.addEventListener('click', ctx.cancelInstrumentDelete);
  elements.instrumentDeleteConfirm?.addEventListener('click', ctx.confirmInstrumentDelete);
  elements.selectVisibleInstruments?.addEventListener('click', ctx.selectVisibleInstruments);
  elements.deselectAllInstruments?.addEventListener('click', ctx.deselectAllInstruments);
  elements.groupRows.addEventListener('click', (event) => saveGroup(ctx, event));
  elements.groupRows.addEventListener('change', ctx.updateGroupSelection);
  elements.deleteSelectedGroups?.addEventListener('click', ctx.deleteSelectedGroups);
  elements.selectVisibleGroups?.addEventListener('click', ctx.selectVisibleGroups);
  elements.deselectAllGroups?.addEventListener('click', ctx.deselectAllGroups);
  elements.createGroup.addEventListener('click', () => createGroup(ctx));
  elements.createInstrument.addEventListener('click', () => createInstrument(ctx));

  async function handleDeleteBackup(backupFile) {
    const confirmed = window.confirm(`¿Eliminar el backup ${backupFile}?\n\nEsta acción no se puede deshacer.`);
    if (!confirmed) return;
    try {
      await deleteBackup(backupFile);
      const backupData = await fetchJson('/api/backups');
      state.backups = backupData.backups || [];
      ctx.renderBackups();
    } catch (error) {
      elements.backupList.textContent = ctx.normalizeErrorMessage(error);
    }
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
  const symbol = ctx.elements.newInstrumentSymbol.value.trim().toUpperCase();
  try {
    await ctx.sendJson('/api/instruments', 'POST', {
      symbol,
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
    if (ctx.state.returnToOperationDialogAfterInstrumentCreate) {
      ctx.state.returnToOperationDialogAfterInstrumentCreate = false;
      ctx.elements.instrumentDialog.close();
      ctx.openOperationDialog('add');
      ctx.populateAddTickerOptions(symbol);
      ctx.elements.addTicker.value = symbol;
      ctx.syncAmountInputs({ target: ctx.elements.addTicker });
    }
  } catch (error) {
    ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
  }
}
