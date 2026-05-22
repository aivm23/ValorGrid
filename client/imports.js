export function attach(ctx) {
  async function loadImportBatches() {
    try {
      const data = await ctx.fetchJson('/api/import/batches');
      ctx.state.importBatches = data.batches || [];
    } catch {
      ctx.state.importBatches = [];
    }
    renderImportBatches();
  }

  function importPayload() {
    return {
      source: ctx.elements.importSource.value || 'csv',
      filename: ctx.elements.importFile.files?.[0]?.name || null,
      content: ctx.elements.importContent.value,
    };
  }

  async function handleImportFile() {
    const file = ctx.elements.importFile.files?.[0];
    if (!file) return;
    ctx.elements.importContent.value = await file.text();
    ctx.state.importPreview = null;
    ctx.elements.importCommit.disabled = true;
    ctx.elements.importPreviewOutput.innerHTML = '';
  }

  async function previewCsvImport() {
    ctx.elements.importPreview.disabled = true;
    ctx.elements.importCommit.disabled = true;
    ctx.elements.importFeedback.textContent = 'Analizando CSV...';
    try {
      const data = await ctx.sendJson('/api/import/preview', 'POST', importPayload());
      ctx.state.importPreview = data.preview;
      renderImportPreview();
      ctx.elements.importCommit.disabled = !data.preview?.canCommit;
      ctx.elements.importFeedback.textContent = data.preview?.canCommit
        ? 'CSV listo para importar.'
        : 'Corrige los errores antes de importar.';
    } catch (error) {
      ctx.state.importPreview = null;
      ctx.elements.importPreviewOutput.innerHTML = '';
      ctx.elements.importFeedback.textContent = ctx.normalizeErrorMessage(error);
    } finally {
      ctx.elements.importPreview.disabled = false;
    }
  }

  async function commitCsvImport() {
    if (!ctx.state.importPreview?.canCommit) return;
    ctx.elements.importCommit.disabled = true;
    ctx.elements.importFeedback.textContent = 'Guardando importacion...';
    try {
      await ctx.sendJson('/api/import/commit', 'POST', importPayload(), { timeoutMs: 60000 });
      ctx.state.historyCache = {};
      ctx.state.importPreview = null;
      ctx.elements.importContent.value = '';
      ctx.elements.importFile.value = '';
      ctx.elements.importPreviewOutput.innerHTML = '';
      ctx.elements.importFeedback.textContent = 'Importacion guardada.';
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
    } catch (error) {
      ctx.elements.importFeedback.textContent = ctx.normalizeErrorMessage(error);
    } finally {
      ctx.elements.importCommit.disabled = true;
    }
  }

  function renderImportPreview() {
    const preview = ctx.state.importPreview;
    if (!preview) {
      ctx.elements.importPreviewOutput.innerHTML = '';
      return;
    }
    const rows = preview.rows || [];
    ctx.elements.importPreviewOutput.innerHTML = `
      <div class="import-summary">
        <span>Filas: <strong>${preview.summary.rowCount}</strong></span>
        <span>Compras: <strong>${preview.summary.buys}</strong></span>
        <span>Ventas: <strong>${preview.summary.sells}</strong></span>
        <span>Duplicados: <strong>${preview.summary.duplicateCount}</strong></span>
        <span>Errores: <strong>${preview.summary.errorCount}</strong></span>
      </div>
      <div class="table-wrap compact-table">
        <table>
          <thead>
            <tr><th>Fila</th><th>Estado</th><th>Ticker</th><th>Tipo</th><th>Fecha</th><th>Valor</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            ${rows
              .slice(0, 25)
              .map(
                (row) => `
                  <tr class="import-row-${ctx.escapeHtml(row.status)}">
                    <td>${row.rowIndex}</td>
                    <td>${ctx.escapeHtml(row.status)}</td>
                    <td>${ctx.escapeHtml(row.normalized?.symbol || '')}</td>
                    <td>${ctx.escapeHtml(row.normalized?.type || '')}</td>
                    <td>${ctx.escapeHtml(row.normalized?.date || '')}</td>
                    <td>${ctx.formatCurrency(Number(row.normalized?.valueEur || 0))}</td>
                    <td>${ctx.escapeHtml((row.errors || []).join('; ') || row.duplicateTransactionId || 'OK')}</td>
                  </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
      ${rows.length > 25 ? `<p class="subtle">Mostrando 25 de ${rows.length} filas.</p>` : ''}
    `;
  }

  function renderImportBatches() {
    const batches = ctx.state.importBatches || [];
    ctx.elements.importBatches.innerHTML = batches.length
      ? `
        <h4>Importaciones recientes</h4>
        ${batches
          .slice(0, 5)
          .map(
            (batch) => `
              <div class="import-batch-row">
                <span><strong>${ctx.escapeHtml(batch.filename || batch.source)}</strong> ${ctx.escapeHtml(batch.status)}</span>
                <small>${ctx.escapeHtml(batch.firstDate || '')} ${ctx.escapeHtml(batch.lastDate || '')}</small>
                <button class="button button-compact" type="button" data-rollback-import="${ctx.escapeHtml(batch.id)}">Revertir</button>
              </div>`,
          )
          .join('')}`
      : '<span class="subtle">Sin importaciones todavia.</span>';
  }

  async function rollbackImportBatch(event) {
    const button = event.target.closest('[data-rollback-import]');
    if (!button) return;
    if (!window.confirm('Revertir esta importacion?')) return;
    button.disabled = true;
    try {
      await ctx.sendJson(`/api/import/batches/${encodeURIComponent(button.dataset.rollbackImport)}/rollback`, 'POST', {});
      ctx.state.historyCache = {};
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
    handleImportFile,
    previewCsvImport,
    commitCsvImport,
    renderImportPreview,
    renderImportBatches,
    rollbackImportBatch,
  });
}
