function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isXlsxSource(source) {
  return source === 'generic-xlsx';
}

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

  function openImportDialog() {
    resetImportDraft();
    syncImportMode();
    ctx.elements.importDialog.showModal();
  }

  function closeImportDialog() {
    ctx.elements.importDialog.close();
  }

  function resetImportDraft() {
    ctx.state.importPreview = null;
    ctx.state.importFileMeta = null;
    ctx.elements.importFile.value = '';
    ctx.elements.importSheet.innerHTML = '';
    ctx.elements.importSheetField.hidden = true;
    ctx.elements.importContent.value = '';
    ctx.elements.importMapping.value = '';
    ctx.elements.importFeedback.textContent = '';
    ctx.elements.importPreviewOutput.innerHTML = '';
    ctx.elements.importCommit.disabled = true;
  }

  function syncImportMode() {
    const source = ctx.elements.importSource.value || 'generic-csv';
    const xlsxMode = isXlsxSource(source);
    ctx.elements.importContent.closest('.field').hidden = xlsxMode;
    if (!xlsxMode) {
      ctx.elements.importSheetField.hidden = true;
      ctx.elements.importSheet.innerHTML = '';
    }
  }

  function parseMapping() {
    const raw = String(ctx.elements.importMapping.value || '').trim();
    if (!raw) return {};
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch {
      throw new Error('El mapping debe ser un JSON válido');
    }
  }

  function importPayload() {
    const source = ctx.elements.importSource.value || 'generic-csv';
    const mapping = parseMapping();
    const payload = {
      source,
      filename: ctx.state.importFileMeta?.name || ctx.elements.importFile.files?.[0]?.name || null,
      mapping,
    };
    if (isXlsxSource(source)) {
      payload.contentBase64 = ctx.state.importFileMeta?.contentBase64 || '';
      payload.sheetName = ctx.elements.importSheet.value || null;
    } else {
      payload.content = ctx.elements.importContent.value;
    }
    return payload;
  }

  function updateSheetSelector(preview) {
    const sheets = preview?.sheets || [];
    const show = sheets.length > 0;
    ctx.elements.importSheetField.hidden = !show;
    if (!show) {
      ctx.elements.importSheet.innerHTML = '';
      return;
    }
    const selected = preview.selectedSheet || preview.sheetName || sheets[0];
    ctx.elements.importSheet.innerHTML = sheets
      .map((sheet) => `<option value="${ctx.escapeHtml(sheet)}"${sheet === selected ? ' selected' : ''}>${ctx.escapeHtml(sheet)}</option>`)
      .join('');
  }

  async function handleImportSourceChange() {
    syncImportMode();
    ctx.state.importPreview = null;
    ctx.elements.importCommit.disabled = true;
    ctx.elements.importPreviewOutput.innerHTML = '';
    ctx.elements.importFeedback.textContent = '';
  }

  async function handleImportFile() {
    const source = ctx.elements.importSource.value || 'generic-csv';
    const file = ctx.elements.importFile.files?.[0];
    if (!file) return;
    if (isXlsxSource(source)) {
      const buffer = await file.arrayBuffer();
      ctx.state.importFileMeta = {
        name: file.name,
        contentBase64: toBase64(buffer),
      };
    } else {
      ctx.elements.importContent.value = await file.text();
      ctx.state.importFileMeta = { name: file.name, contentBase64: null };
    }
    ctx.state.importPreview = null;
    ctx.elements.importCommit.disabled = true;
    ctx.elements.importPreviewOutput.innerHTML = '';
    ctx.elements.importFeedback.textContent = '';
  }

  async function handleImportSheetChange() {
    if (!ctx.state.importPreview) return;
    await previewCsvImport();
  }

  async function previewCsvImport() {
    ctx.elements.importPreview.disabled = true;
    ctx.elements.importCommit.disabled = true;
    ctx.elements.importFeedback.textContent = 'Analizando importación...';
    try {
      const data = await ctx.sendJson('/api/import/preview', 'POST', importPayload());
      ctx.state.importPreview = data.preview;
      updateSheetSelector(data.preview);
      renderImportPreview();
      ctx.elements.importCommit.disabled = !data.preview?.canCommit;
      ctx.elements.importFeedback.textContent = data.preview?.canCommit
        ? 'Importación lista para guardar.'
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
    ctx.elements.importFeedback.textContent = 'Guardando importación...';
    try {
      await ctx.sendJson('/api/import/commit', 'POST', importPayload(), { timeoutMs: 60000 });
      ctx.state.historyCache = {};
      ctx.elements.importFeedback.textContent = 'Importación guardada.';
      await loadImportBatches();
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
      resetImportDraft();
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
        <span>Comisiones: <strong>${ctx.formatCurrency(preview.summary.commissionEur || 0)}</strong></span>
        <span>Cash-flow: <strong>${ctx.formatCurrency(preview.summary.cashFlowEur || 0)}</strong></span>
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
      ${
        rows.length > 25
          ? `<p class="subtle">Mostrando 25 de ${rows.length} filas.</p>`
          : ''
      }
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
      : '<span class="subtle">Sin importaciones todavía.</span>';
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
  });
}
