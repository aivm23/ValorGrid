export function createImportBatchManager(ctx) {
  function renderImportRollbackLog() {
    const entries = ctx.state.importRollbackLog || [];
    if (!entries.length) return '';
    return `<h4>${ctx.t('import.batches.rollbackHistory')}</h4>${entries
      .map(
        (entry) =>
          `<div class="import-batch-row"><span><strong>${ctx.escapeHtml(entry.filename || entry.source)}</strong> - ${ctx.tn('import.batches.revertedMovements', entry.rowCount || 0)}</span><small>${ctx.formatDateTime(entry.rolledBackAt)}</small></div>`,
      )
      .join('')}`;
  }

  function renderImportBatches() {
    const batches = ctx.state.importBatches || [];
    const rolledBackIds = new Set((ctx.state.importRollbackLog || []).map((entry) => entry.batchId));
    const rollbackSection = renderImportRollbackLog();
    ctx.elements.importBatches.innerHTML = batches.length
      ? `<h4>Importaciones recientes</h4>${batches
          .slice(0, 5)
          .map((batch) => {
            const isRolledBack = rolledBackIds.has(batch.id);
            const range = [batch.firstDate, batch.lastDate]
              .filter(Boolean)
              .map((date) => ctx.formatDate(date))
              .join(' - ');
            const rollbackIcon =
              '<svg class="toolbar-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 1 3 6.7"></path><path d="M3 7v5h5"></path></svg>';
            return `<div class="import-batch-row${isRolledBack ? ' is-rolled-back' : ''}"><span><strong>${ctx.escapeHtml(batch.filename || batch.source)}</strong> ${isRolledBack ? `<span class="status-pill status-muted">${ctx.t('import.batches.rolledBack')}</span>` : ctx.escapeHtml(batch.status)}</span><small>${ctx.escapeHtml(range)}</small>${isRolledBack ? '' : `<button class="button button-compact btn-cancel" type="button" data-rollback-import="${ctx.escapeHtml(batch.id)}">${rollbackIcon} ${ctx.t('import.batches.rollback')}</button>`}</div>`;
          })
          .join('')}${rollbackSection}`
      : rollbackSection || `<span class="subtle">${ctx.t('Sin importaciones todavía.')}</span>`;
  }

  async function loadImportBatches() {
    try {
      const data = await ctx.api.imports.batches();
      ctx.state.importBatches = data.batches || [];
    } catch {
      ctx.state.importBatches = [];
    }
    try {
      const logData = await ctx.api.imports.rollbackLog();
      ctx.state.importRollbackLog = logData.entries || [];
    } catch {
      ctx.state.importRollbackLog = [];
    }
    renderImportBatches();
  }

  async function rollbackImportBatch(event) {
    const button = event.target.closest('[data-rollback-import]');
    if (!button) return;
    const confirmed = await ctx.confirmAction({
      title: ctx.t('import.batches.rollbackTitle'),
      message: ctx.t('import.batches.rollbackConfirm'),
      confirmLabel: ctx.t('import.batches.rollbackAction'),
      tone: 'danger',
    });
    if (!confirmed) return;
    button.disabled = true;
    try {
      await ctx.withAppLoading({ title: ctx.t('loading.import.rollback.title') }, async () => {
        await ctx.api.imports.rollback(button.dataset.rollbackImport);
        ctx.state.historyCache = {};
        await loadImportBatches();
        await ctx.refreshDashboard();
        await ctx.refreshHistory({ force: true });
      });
      ctx.elements.importFeedback.textContent = 'Importación revertida.';
    } catch (error) {
      ctx.elements.importFeedback.textContent = ctx.normalizeErrorMessage(error);
    } finally {
      button.disabled = false;
    }
  }

  return { renderImportBatches, loadImportBatches, rollbackImportBatch };
}
