import { renderImportPreviewContent } from './import-preview-renderer.js';
import {
  toBase64,
  isXlsxSource,
  resetImportDraft,
  syncImportMode,
  ensureInstrumentChoices,
  buildImportPayload,
  canAdvanceImportStep,
  ensureDefaultRowActions,
  applyImportGroupAction,
  unresolvedInstrumentItems,
  invalidateImportAfter,
  applySuggestionToChoice,
  updateSheetSelector,
  updateCommitButton,
} from './import-workflow.js';

const STEP_ORDER = ['file', 'instruments', 'operations', 'confirm'];

export function attach(ctx) {
  function openImportDialog() {
    resetImportDraft(ctx);
    syncImportMode(ctx);
    ctx.elements.importDialog.showModal();
    renderImportPreview();
  }

  function closeImportDialog() {
    ctx.elements.importDialog.close();
  }

  function setImportStep(step) {
    if (!STEP_ORDER.includes(step)) return;
    const targetIndex = STEP_ORDER.indexOf(step);
    const currentIndex = STEP_ORDER.indexOf(ctx.state.importStep || 'file');
    if (targetIndex > currentIndex + 1) return;
    if (targetIndex > currentIndex && !canAdvanceImportStep(ctx, ctx.state.importStep || 'file')) return;
    ctx.state.importStep = step;
    renderImportPreview();
  }

  async function advanceImportStep() {
    if (ctx.state.importWorkflowBusy) return;
    const current = ctx.state.importStep || 'file';
    if (current === 'file') {
      if (!ctx.state.importPreview) await previewCsvImport({ keepStep: true });
      if (!ctx.state.importPreview) return;
      ctx.state.importConfirmedSteps.file = true;
      return setImportStep('instruments');
    }
    if (current === 'instruments') {
      ctx.state.importInstrumentValidationAttempted = true;
      const unresolvedBefore = unresolvedInstrumentItems(ctx, ctx.state.importPreview);
      if (unresolvedBefore.length) {
        ctx.elements.importFeedback.textContent = `Confirma cada instrumento pendiente antes de continuar (${unresolvedBefore.length} pendiente${unresolvedBefore.length === 1 ? '' : 's'}).`;
        return renderImportPreview();
      }
      ctx.state.importWorkflowBusy = true;
      renderImportPreview();
      try {
        await previewCsvImport({ keepStep: true, preserveOnError: true, feedback: 'Confirmando instrumentos...' });
        const unresolvedAfter = unresolvedInstrumentItems(ctx, ctx.state.importPreview);
        if (unresolvedAfter.length) {
          ctx.elements.importFeedback.textContent = `Confirma cada instrumento pendiente antes de continuar (${unresolvedAfter.length} pendiente${unresolvedAfter.length === 1 ? '' : 's'}).`;
          return renderImportPreview();
        }
        ctx.state.importConfirmedSteps.instruments = true;
        ctx.state.importInstrumentValidationAttempted = false;
        return setImportStep('operations');
      } finally {
        ctx.state.importWorkflowBusy = false;
        renderImportPreview();
      }
    }
    if (current === 'operations') {
      ensureDefaultRowActions(ctx);
      await previewCsvImport({ keepStep: true });
      ctx.state.importConfirmedSteps.operations = true;
      return setImportStep('confirm');
    }
    if (current === 'confirm') return commitCsvImport();
  }

  function retreatImportStep() {
    const currentIndex = STEP_ORDER.indexOf(ctx.state.importStep || 'file');
    if (currentIndex <= 0) return;
    ctx.state.importStep = STEP_ORDER[currentIndex - 1];
    renderImportPreview();
  }

  function renderImportPreview() {
    const preview = ctx.state.importPreview;
    if (!preview) {
      ctx.state.importStep = 'file';
      ctx.elements.importPreviewOutput.innerHTML = renderImportPreviewContent(ctx, null, ctx.state, []);
      ctx.elements.importMappingRequired.hidden = true;
      ctx.elements.importMappingRequired.innerHTML = '';
      updateCommitButton(ctx);
      return;
    }
    ensureInstrumentChoices(ctx, preview);
    ctx.elements.importMappingRequired.hidden = true;
    ctx.elements.importMappingRequired.innerHTML = '';
    ctx.elements.importPreviewOutput.innerHTML = renderImportPreviewContent(ctx, preview, ctx.state, preview.warnings || []);
    updateCommitButton(ctx);
  }

  async function handleImportSourceChange() {
    syncImportMode(ctx);
    ctx.state.importPreview = null;
    ctx.state.importRowActions = {};
    ctx.state.importRowMappings = {};
    ctx.state.importInstrumentChoices = {};
    ctx.state.importConfirmedSteps = {};
    ctx.state.importInstrumentValidationAttempted = false;
    ctx.state.importStep = 'file';
    renderImportPreview();
    ctx.elements.importFeedback.textContent = '';
    updateCommitButton(ctx);
  }

  async function handleImportFile() {
    const source = ctx.elements.importSource.value || 'generic-csv';
    const file = ctx.elements.importFile.files?.[0];
    if (!file) return;
    if (isXlsxSource(source)) {
      const buffer = await file.arrayBuffer();
      ctx.state.importFileMeta = { name: file.name, contentBase64: toBase64(buffer) };
    } else {
      ctx.elements.importContent.value = await file.text();
      ctx.state.importFileMeta = { name: file.name, contentBase64: null };
    }
    ctx.state.importPreview = null;
    ctx.state.importRowActions = {};
    ctx.state.importRowMappings = {};
    ctx.state.importInstrumentChoices = {};
    ctx.state.importConfirmedSteps = {};
    ctx.state.importInstrumentValidationAttempted = false;
    ctx.state.importStep = 'file';
    renderImportPreview();
    ctx.elements.importFeedback.textContent = '';
    updateCommitButton(ctx);
  }

  async function handleImportSheetChange() {
    if (ctx.state.importPreview) await previewCsvImport({ keepStep: true });
  }

  async function previewCsvImport(options = {}) {
    ctx.elements.importPreview.disabled = true;
    ctx.elements.importFeedback.textContent = options.feedback || 'Analizando importación...';
    try {
      const data = await ctx.sendJson('/api/import/preview', 'POST', buildImportPayload(ctx));
      ctx.state.importPreview = data.preview;
      updateSheetSelector(ctx, data.preview);
      if (!options.keepStep) ctx.state.importStep = 'file';
      renderImportPreview();
      ctx.elements.importFeedback.textContent = data.preview?.canCommit
        ? 'Previsualización preparada. Revisa instrumentos, operaciones e impacto antes de importar.'
        : 'Revisa los elementos pendientes antes de confirmar la importación.';
    } catch (error) {
      if (!options.preserveOnError) {
        ctx.state.importPreview = null;
        ctx.elements.importPreviewOutput.innerHTML = '';
      } else {
        renderImportPreview();
      }
      ctx.elements.importFeedback.textContent = ctx.normalizeErrorMessage(error);
      updateCommitButton(ctx);
    } finally {
      ctx.elements.importPreview.disabled = false;
    }
  }

  async function commitCsvImport() {
    if (!ctx.state.importPreview?.canCommit) return;
    ctx.elements.importCommit.disabled = true;
    ctx.elements.importPreviewOutput.innerHTML = '<div class="import-committing-overlay"><div class="import-committing-card"><img src="./assets/brand/valorgrid-logo.png" alt="" aria-hidden="true" /><strong>Importando operaciones...</strong><span>Conciliando movimientos y actualizando cartera.</span></div></div>';
    try {
      ensureDefaultRowActions(ctx);
      await ctx.sendJson('/api/import/commit', 'POST', buildImportPayload(ctx), { timeoutMs: 60000 });
      ctx.state.historyCache = {};
      ctx.elements.importFeedback.textContent = 'Importación guardada.';
      await loadImportBatches();
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
      resetImportDraft(ctx);
      closeImportDialog();
    } catch (error) {
      ctx.elements.importFeedback.textContent = ctx.normalizeErrorMessage(error);
      renderImportPreview();
    } finally {
      updateCommitButton(ctx);
    }
  }

  function updateChoiceCreateField(key, field, value) {
    if (!ctx.state.importInstrumentChoices[key]) return;
    ctx.state.importInstrumentChoices[key].create = {
      ...(ctx.state.importInstrumentChoices[key].create || {}),
      [field]: value,
    };
  }

  function handleImportPreviewClick(event) {
    const nextButton = event.target.closest('[data-import-next]');
    if (nextButton) return advanceImportStep();
    const backButton = event.target.closest('[data-import-back]');
    if (backButton) return retreatImportStep();
    const suggestionButton = event.target.closest('[data-import-use-suggestion]');
    if (suggestionButton) {
      const key = suggestionButton.dataset.importUseSuggestion;
      const suggestionIndex = Number(suggestionButton.dataset.suggestionIndex || 0);
      const item = (ctx.state.importPreview?.detectedInstruments || []).find((entry) => entry.key === key);
      applySuggestionToChoice(ctx, key, item?.tickerSuggestions?.[suggestionIndex]);
      invalidateImportAfter(ctx, 'instruments');
      return renderImportPreview();
    }
  }

  function handleImportPreviewInteraction(event) {
    const rowAction = event.target.closest('[data-import-row-action]');
    if (rowAction) {
      const rowIndex = Number(rowAction.dataset.importRowAction);
      const wantsImport = rowAction.type === 'checkbox' ? rowAction.checked : rowAction.value === 'import';
      ctx.state.importRowActions[rowIndex] = wantsImport ? 'import' : 'skip';
      delete ctx.state.importConfirmedSteps.confirm;
      return renderImportPreview();
    }
    const groupAction = event.target.closest('[data-import-group-action]');
    if (groupAction) {
      applyImportGroupAction(ctx, groupAction);
      delete ctx.state.importConfirmedSteps.confirm;
      return renderImportPreview();
    }
    const rowSymbol = event.target.closest('[data-import-row-symbol]');
    if (rowSymbol) {
      const rowIndex = Number(rowSymbol.dataset.importRowSymbol);
      const value = String(rowSymbol.value || '').trim().toUpperCase();
      if (value) {
        ctx.state.importRowMappings[rowIndex] = { symbol: value };
        ctx.state.importRowActions[rowIndex] = 'import';
      } else delete ctx.state.importRowMappings[rowIndex];
      invalidateImportAfter(ctx, 'operations');
      return renderImportPreview();
    }
    const choiceAction = event.target.closest('[data-import-instrument-action]');
    if (choiceAction) {
      const key = choiceAction.dataset.importInstrumentAction;
      if (ctx.state.importInstrumentChoices[key]) ctx.state.importInstrumentChoices[key].action = choiceAction.value;
      ctx.state.importInstrumentValidationAttempted = false;
      invalidateImportAfter(ctx, 'instruments');
      return renderImportPreview();
    }
    const choiceSymbol = event.target.closest('[data-import-instrument-symbol]');
    if (choiceSymbol) {
      const key = choiceSymbol.dataset.importInstrumentSymbol;
      if (ctx.state.importInstrumentChoices[key]) ctx.state.importInstrumentChoices[key].symbol = String(choiceSymbol.value || '').trim().toUpperCase();
      invalidateImportAfter(ctx, 'instruments');
      return;
    }
    const filter = event.target.closest('[data-import-op-filter]');
    if (filter) {
      ctx.state.importOperationFilter = filter.value || 'all';
      return renderImportPreview();
    }
    const fields = ['Symbol', 'Yahoo', 'Name', 'Type', 'Currency', 'Group', 'Color'];
    for (const fieldName of fields) {
      const attr = `data-import-create-${fieldName.toLowerCase()}`;
      const node = event.target.closest(`[${attr}]`);
      if (!node) continue;
      const key = node.dataset[`importCreate${fieldName}`];
      const normalized = ['Symbol', 'Currency'].includes(fieldName) ? String(node.value || '').trim().toUpperCase() : node.value;
      updateChoiceCreateField(key, fieldName === 'Symbol' ? 'symbol' : fieldName === 'Yahoo' ? 'yahooSymbol' : fieldName.toLowerCase(), normalized);
      if (String(normalized || '').trim()) node.classList.remove('import-field-missing');
      invalidateImportAfter(ctx, 'instruments');
      return;
    }
  }

  function renderImportBatches() {
    const batches = ctx.state.importBatches || [];
    const rolledBackIds = new Set((ctx.state.importRollbackLog || []).map((entry) => entry.batchId));
    const rollbackSection = renderImportRollbackLog();
    ctx.elements.importBatches.innerHTML = batches.length
      ? `<h4>Importaciones recientes</h4>${batches.slice(0, 5).map((batch) => {
          const isRolledBack = rolledBackIds.has(batch.id);
          return `<div class="import-batch-row${isRolledBack ? ' is-rolled-back' : ''}"><span><strong>${ctx.escapeHtml(batch.filename || batch.source)}</strong> ${isRolledBack ? '<span class="status-pill status-muted">Revertida</span>' : ctx.escapeHtml(batch.status)}</span><small>${ctx.escapeHtml(batch.firstDate || '')} ${ctx.escapeHtml(batch.lastDate || '')}</small>${isRolledBack ? '' : `<button class="button button-compact" type="button" data-rollback-import="${ctx.escapeHtml(batch.id)}">Revertir</button>`}</div>`;
        }).join('')}${rollbackSection}`
      : rollbackSection || '<span class="subtle">Sin importaciones todavía.</span>';
  }

  async function loadImportBatches() {
    try {
      const data = await ctx.fetchJson('/api/import/batches');
      ctx.state.importBatches = data.batches || [];
    } catch {
      ctx.state.importBatches = [];
    }
    try {
      const logData = await ctx.fetchJson('/api/import/rollback-log');
      ctx.state.importRollbackLog = logData.entries || [];
    } catch {
      ctx.state.importRollbackLog = [];
    }
    renderImportBatches();
  }

  function renderImportRollbackLog() {
    const entries = ctx.state.importRollbackLog || [];
    if (!entries.length) return '';
    return `<h4>Reversiones</h4>${entries.map((entry) => `<div class="import-batch-row"><span><strong>${ctx.escapeHtml(entry.filename || entry.source)}</strong> — ${entry.rowCount || 0} movimientos revertidos</span><small>${ctx.formatDateTime(entry.rolledBackAt)}</small></div>`).join('')}`;
  }

  async function rollbackImportBatch(event) {
    const button = event.target.closest('[data-rollback-import]');
    if (!button) return;
    if (!window.confirm('¿Revertir esta importación?')) return;
    button.disabled = true;
    try {
      await ctx.sendJson(`/api/import/batches/${encodeURIComponent(button.dataset.rollbackImport)}/rollback`, 'POST', {});
      ctx.state.historyCache = {};
      await loadImportBatches();
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
    } catch (error) {
      ctx.elements.importFeedback.textContent = ctx.normalizeErrorMessage(error);
    } finally {
      button.disabled = false;
    }
  }

  Object.assign(ctx, {
    loadImportBatches,
    openImportDialog,
    closeImportDialog,
    handleImportSourceChange,
    handleImportFile,
    handleImportSheetChange,
    previewCsvImport,
    commitCsvImport,
    renderImportPreview,
    renderImportBatches,
    rollbackImportBatch,
    handleImportPreviewInteraction,
    handleImportPreviewClick,
  });
}
