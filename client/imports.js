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
    ctx.elements.importMappingRequired.hidden = true;
    ctx.elements.importMappingRequired.innerHTML = '';
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
      throw new Error('El mapping debe ser un JSON valido');
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
    ctx.elements.importFeedback.textContent = 'Analizando importacion...';
    try {
      const data = await ctx.sendJson('/api/import/preview', 'POST', importPayload());
      ctx.state.importPreview = data.preview;
      updateSheetSelector(data.preview);
      renderImportPreview();
      ctx.elements.importCommit.disabled = !data.preview?.canCommit;
      const warningText = (data.preview?.warnings || []).join(' ');
      ctx.elements.importFeedback.textContent = data.preview?.canCommit
        ? warningText
          ? `Importacion lista para guardar. ${warningText}`
          : 'Importacion lista para guardar.'
        : warningText
          ? `Corrige los errores antes de importar. ${warningText}`
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
      ctx.elements.importFeedback.textContent = 'Importacion guardada.';
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
      ctx.elements.importMappingRequired.hidden = true;
      ctx.elements.importMappingRequired.innerHTML = '';
      return;
    }
    const rows = preview.rows || [];
    const warnings = preview.warnings || [];
    const reconciliationSummary = preview.reconciliationSummary || {};
    const mappingRequired = preview.instrumentMappingsRequired || [];
    if (mappingRequired.length) {
      ctx.elements.importMappingRequired.hidden = false;
      ctx.elements.importMappingRequired.innerHTML = `
        <strong>Mapeos requeridos:</strong>
        <ul>
          ${mappingRequired
            .map((item) => `<li><code>${ctx.escapeHtml(item.key)}</code> - ${ctx.escapeHtml(item.label || item.symbol || 'sin etiqueta')}</li>`)
            .join('')}
        </ul>
        <small>Completa <em>Mapping opcional (JSON)</em> con pares clave->ticker (ej. {"isin:US30303M1027":"META"}).</small>
      `;
    } else {
      ctx.elements.importMappingRequired.hidden = true;
      ctx.elements.importMappingRequired.innerHTML = '';
    }

    ctx.elements.importPreviewOutput.innerHTML = `
      ${
        preview.fileSubtype
          ? `<div class="import-kind-pill">Formato detectado: <strong>${ctx.escapeHtml(preview.fileSubtypeLabel || preview.fileSubtype)}</strong></div>`
          : ''
      }
      ${
        warnings.length
          ? `<div class="import-warning-banner">${warnings.map((item) => `<div>${ctx.escapeHtml(item)}</div>`).join('')}</div>`
          : ''
      }
      <div class="import-summary">
        <span>Filas: <strong>${preview.summary.rowCount}</strong></span>
        <span>Compras: <strong>${preview.summary.buys}</strong></span>
        <span>Ventas: <strong>${preview.summary.sells}</strong></span>
        <span>Ignoradas: <strong>${preview.summary.ignoredCount || 0}</strong></span>
        <span>Duplicados: <strong>${preview.summary.duplicateCount}</strong></span>
        <span>Mapeo: <strong>${preview.summary.needsMappingCount || 0}</strong></span>
        <span>Bloqueadas: <strong>${preview.summary.blockedCount || 0}</strong></span>
        <span>Errores: <strong>${preview.summary.errorCount}</strong></span>
        <span>Comisiones: <strong>${ctx.formatCurrency(preview.summary.commissionEur || 0)}</strong></span>
        <span>Cash-flow: <strong>${ctx.formatCurrency(preview.summary.cashFlowEur || 0)}</strong></span>
        ${
          preview.fileSubtype === 'portfolio_snapshot'
            ? `<span>Coincidencias: <strong>${Number(reconciliationSummary.exactMatches || 0)}</strong></span>
               <span>Deltas positivos: <strong>${Number(reconciliationSummary.deltaPositive || 0)}</strong></span>
               <span>Deltas negativos: <strong>${Number(reconciliationSummary.deltaNegative || 0)}</strong></span>`
            : ''
        }
      </div>
      <div class="table-wrap compact-table">
        <table>
          <thead>
            <tr>
              <th>Fila</th>
              <th>Estado</th>
              <th>Ticker</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Actual</th>
              <th>Importado</th>
              <th>Delta</th>
              <th>Estrategia</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr class="import-row-${ctx.escapeHtml(row.status)}">
                    <td>${row.rowIndex}</td>
                    <td>${ctx.escapeHtml(row.status)}</td>
                    <td>${ctx.escapeHtml(row.normalized?.symbol || '')}</td>
                    <td>${ctx.escapeHtml(row.normalized?.type || '')}</td>
                    <td>${ctx.escapeHtml(row.normalized?.date || '')}</td>
                    <td>${Number.isFinite(row.ledgerShares) ? ctx.formatShareNumber(row.ledgerShares) : '-'}</td>
                    <td>${Number.isFinite(row.snapshotShares) ? ctx.formatShareNumber(row.snapshotShares) : '-'}</td>
                    <td>${Number.isFinite(row.deltaShares) ? ctx.formatShareNumber(row.deltaShares) : '-'}</td>
                    <td>${ctx.escapeHtml(row.importStrategy || '-')}</td>
                    <td>${ctx.escapeHtml(
                      (row.errors || []).join('; ') ||
                        row.ignoreReason ||
                        row.ledgerMatch?.reason ||
                        row.duplicateTransactionId ||
                        'OK',
                    )}</td>
                  </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
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
    if (!window.confirm('¿Revertir esta importacion?')) return;
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
