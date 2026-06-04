import { renderConfirmStep } from './import-confirm-renderer.js';

const STEP_ORDER = ['file', 'instruments', 'operations', 'confirm'];

const STEP_LABELS = {
  file: 'Archivo',
  instruments: 'Instrumentos',
  operations: 'Operaciones',
  confirm: 'Confirmación',
};

const STATUS_LABELS = {
  valid: 'Lista para importar',
  needs_mapping: 'Pendiente de asignar instrumento',
  blocked: 'No importable ahora',
  ignored: 'Ignorada automáticamente',
  duplicate: 'Ya existe',
  skipped: 'Omitida por el usuario',
  error: 'No importable ahora',
};

function statusBadgeClass(status) {
  if (status === 'valid' || status === 'resolved') return 'ok';
  if (status === 'ignored' || status === 'duplicate' || status === 'skipped' || status === 'omitted') return 'muted';
  if (status === 'incomplete') return 'error';
  return 'warn';
}

function stepIndex(step) {
  return Math.max(0, STEP_ORDER.indexOf(step));
}

function renderProgress(activeStep, state) {
  const activeIndex = stepIndex(activeStep);
  return `
    <div class="import-progress" aria-label="Progreso de importación">
      ${STEP_ORDER.map((step, index) => {
        const done = Boolean(state.importConfirmedSteps?.[step]) || index < activeIndex;
        return `
          <div class="import-progress-item${step === activeStep ? ' is-active' : ''}${done ? ' is-done' : ''}">
            <span>${index + 1}</span>
            <strong>${STEP_LABELS[step]}</strong>
          </div>`;
      }).join('')}
    </div>`;
}

function renderWorkflowActions(activeStep, preview, canContinue = true, state = {}) {
  const busy = Boolean(state.importWorkflowBusy);
  const backDisabled = activeStep === 'file' || busy ? ' disabled' : '';
  if (!preview) return '';
  let nextLabel = 'Importar operaciones seleccionadas';
  if (busy && activeStep === 'instruments') nextLabel = 'Confirmando...';
  else if (busy && activeStep === 'file') nextLabel = 'Analizando...';
  else if (activeStep === 'file') nextLabel = 'Continuar a instrumentos';
  else if (activeStep === 'instruments') nextLabel = 'Confirmar instrumentos';
  else if (activeStep === 'operations') nextLabel = 'Revisar impacto';
  const nextDisabled = !preview || !canContinue || busy || (activeStep === 'confirm' && !preview.canCommit) ? ' disabled' : '';
  return `
    <div class="import-workflow-actions">
      ${activeStep === 'file' ? '<span></span>' : `<button type="button" class="button" data-import-back${backDisabled}>Atrás</button>`}
      <button type="button" class="button button-primary" data-import-next${nextDisabled}>${nextLabel}</button>
    </div>`;
}

function renderSummary(ctx, preview) {
  const summary = preview.summary || {};
  return `
    <div class="import-summary-cards">
      <article><span>Filas</span><strong>${summary.rowCount || 0}</strong></article>
      <article><span>Importables</span><strong>${summary.buys + summary.sells || 0}</strong></article>
      <article><span>Pendientes</span><strong>${summary.needsMappingCount || 0}</strong></article>
      <article><span>Revisión</span><strong>${summary.blockedCount || 0}</strong></article>
      <article><span>Ya existen</span><strong>${summary.duplicateCount || 0}</strong></article>
      <article><span>Ignoradas</span><strong>${summary.ignoredCount || 0}</strong></article>
      <article><span>Comisiones</span><strong>${ctx.formatCurrency(summary.commissionEur || 0)}</strong></article>
    </div>`;
}

function renderFileStep(ctx, preview, warnings = []) {
  if (!preview) {
    return `
      <div class="import-empty-step">
        <strong>Preparado para analizar</strong>
        <span>Selecciona un archivo Excel y pulsa <em>Analizar archivo</em>. Después revisaremos instrumentos, operaciones e impacto antes de guardar nada.</span>
      </div>`;
  }
  return `
    ${preview.fileSubtype ? `<div class="import-kind-pill"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v10l4-3 4 3V2a1 1 0 00-1-1H4a1 1 0 00-1 1z"/></svg> Formato detectado: <strong>${ctx.escapeHtml(preview.fileSubtypeLabel || preview.fileSubtype)}</strong></div>` : ''}
    ${warnings.length ? `<div class="import-warning-banner">${warnings.map((item) => `<div>${ctx.escapeHtml(item)}</div>`).join('')}</div>` : ''}
    ${renderSummary(ctx, preview)}
  `;
}

function choiceIsComplete(choice, item, instrumentOptions = []) {
  if (choice?.action === 'omit') return true;
  if (choice?.action === 'map') {
    const symbol = String(choice.symbol || '').trim().toUpperCase();
    return Boolean(symbol && instrumentOptions.some((option) => option.symbol === symbol));
  }
  if (choice?.action === 'create') {
    const create = choice.create || {};
    return ['symbol', 'yahooSymbol', 'name', 'type', 'currency'].every((field) => String(create[field] || '').trim());
  }
  return item.resolutionStatus !== 'needs_mapping';
}

function missingCreateFields(create = {}) {
  return new Set(['symbol', 'yahooSymbol', 'name', 'type', 'currency'].filter((field) => !String(create[field] || '').trim()));
}

function isSafetyOmitted(item, action) {
  return action === 'omit' && Number(item.sells || 0) > Number(item.buys || 0) && Number(item.sells || 0) > 0;
}

function renderSuggestions(ctx, item) {
  const suggestions = item.tickerSuggestions || [];
  if (!suggestions.length) {
    return `<div class="subtle">Sin sugerencias automáticas. Puedes crear el instrumento manualmente.</div>`;
  }
  return `
    <div class="import-suggestions">
      ${suggestions
        .map(
          (suggestion, index) => `
            <button type="button" class="button button-compact" data-import-use-suggestion="${ctx.escapeHtml(item.key)}" data-suggestion-index="${index}">
              Usar ${ctx.escapeHtml(suggestion.yahooSymbol)}
              <small>${ctx.escapeHtml(suggestion.confidence || 'media')}</small>
            </button>`,
        )
        .join('')}
    </div>`;
}

function renderInstrumentCard(ctx, item, state, instrumentOptions) {
  const decision = state.importInstrumentChoices?.[item.key] || {};
  const existingSymbols = new Set(instrumentOptions.map((option) => option.symbol));
  const action = decision.action || (existingSymbols.has(item.symbol) ? 'map' : 'create');
  const symbol = decision.symbol || (existingSymbols.has(item.symbol) ? item.symbol : '');
  const create = decision.create || {};
  const omitted = action === 'omit';
  const complete = choiceIsComplete({ ...decision, action, symbol }, item, instrumentOptions);
  const attempted = Boolean(state.importInstrumentValidationAttempted);
  const safetyOmitted = isSafetyOmitted(item, action);
  const badgeStatus = omitted ? 'omitted' : attempted ? (complete ? 'resolved' : 'incomplete') : 'pending';
  const badgeLabel = safetyOmitted ? 'Omitido por seguridad' : omitted ? 'Omitido' : attempted ? (complete ? 'Confirmado' : 'Incompleto') : 'Sin confirmar';
  const missingFields = action === 'create' && attempted ? missingCreateFields(create) : new Set();
  const visibleTicker = create.yahooSymbol || create.symbol || item.symbol || '';
  return `
    <article class="import-instrument-card${attempted && complete ? ' is-confirmed' : ''}${attempted && !complete && !omitted ? ' is-incomplete' : ''}${safetyOmitted ? ' is-safety-omitted' : ''}">
      <header>
        <div>
          <strong>${ctx.escapeHtml(item.label || item.key)}</strong>
          <p class="subtle">${visibleTicker ? `Ticker sugerido ${ctx.escapeHtml(visibleTicker)} · ` : ''}${ctx.escapeHtml(item.currency || '-')} · ${ctx.escapeHtml(item.exchange || '-')}</p>
        </div>
        <span class="status-pill status-${statusBadgeClass(badgeStatus)}">${badgeLabel}</span>
      </header>
      <div class="import-instrument-metrics">
        <span>${item.rowCount || 0} operaciones</span>
        <span>${item.buys || 0} compras / ${item.sells || 0} ventas</span>
        <span>${ctx.formatCurrency(item.approxValueEur || 0)}</span>
        ${item.firstDate && item.lastDate ? `<span>${ctx.formatDate(item.firstDate)} - ${ctx.formatDate(item.lastDate)}</span>` : ''}
      </div>
      ${safetyOmitted ? '<div class="import-safety-message">Omitido por seguridad: hay más ventas que compras y podría generar posición negativa.</div>' : ''}
      ${!complete || action !== 'map' ? renderSuggestions(ctx, item) : ''}
      <label class="field">
        <span>Decisión</span>
        <select data-import-instrument-action="${ctx.escapeHtml(item.key)}">
          <option value="map"${action === 'map' ? ' selected' : ''}>Asignar a instrumento existente</option>
          <option value="create"${action === 'create' ? ' selected' : ''}>Crear instrumento nuevo</option>
          <option value="omit"${action === 'omit' ? ' selected' : ''}>Omitir este producto</option>
        </select>
      </label>
      ${
        action === 'map'
          ? `<label class="field">
              <span>Instrumento destino</span>
              <select data-import-instrument-symbol="${ctx.escapeHtml(item.key)}">
                <option value="">Selecciona instrumento</option>
                ${instrumentOptions
                  .map((option) => `<option value="${ctx.escapeHtml(option.symbol)}"${option.symbol === symbol ? ' selected' : ''}>${ctx.escapeHtml(option.label)}</option>`)
                  .join('')}
              </select>
            </label>`
          : ''
      }
      ${
        action === 'create'
          ? `<div class="import-create-grid">
              <input class="${missingFields.has('symbol') ? 'import-field-missing' : ''}" data-import-create-symbol="${ctx.escapeHtml(item.key)}" value="${ctx.escapeHtml(create.symbol || '')}" placeholder="Ticker interno" />
              <input class="${missingFields.has('yahooSymbol') ? 'import-field-missing' : ''}" data-import-create-yahoo="${ctx.escapeHtml(item.key)}" value="${ctx.escapeHtml(create.yahooSymbol || '')}" placeholder="Ticker Yahoo" />
              <input class="${missingFields.has('name') ? 'import-field-missing' : ''}" data-import-create-name="${ctx.escapeHtml(item.key)}" value="${ctx.escapeHtml(create.name || item.label || '')}" placeholder="Nombre" />
              <select data-import-create-type="${ctx.escapeHtml(item.key)}">
                <option value="etf"${(create.type || 'stock') === 'etf' ? ' selected' : ''}>ETF</option>
                <option value="stock"${(create.type || 'stock') === 'stock' ? ' selected' : ''}>Stock</option>
              </select>
              <input class="${missingFields.has('currency') ? 'import-field-missing' : ''}" data-import-create-currency="${ctx.escapeHtml(item.key)}" value="${ctx.escapeHtml(create.currency || item.currency || 'EUR')}" placeholder="Divisa" />
              <div class="import-auto-group">Grupo: Importados</div>
              <input class="color-input" data-import-create-color="${ctx.escapeHtml(item.key)}" type="color" value="${ctx.escapeHtml(create.color || '#2563eb')}" />
            </div>`
          : ''
      }
    </article>
  `;
}

function renderInstrumentsStep(ctx, preview, state, instrumentOptions) {
  const detected = preview.detectedInstruments || [];
  if (!detected.length) return '<div class="subtle">No hay instrumentos detectados.</div>';
  return `
    <div class="import-step-intro">
      <strong>Confirma los instrumentos una sola vez.</strong>
      <span>Las operaciones del siguiente paso usarán estas decisiones y ya no pedirán ticker por fila.</span>
    </div>
    <div class="import-instrument-grid">${detected.map((item) => renderInstrumentCard(ctx, item, state, instrumentOptions)).join('')}</div>`;
}

function renderOperationsStep(ctx, preview, state) {
  const rows = preview.rows || [];
  if ((preview.instrumentMappingsRequired || []).length) {
    return `
      <div class="import-warning-banner">
        Quedan instrumentos sin confirmar. Vuelve al paso Instrumentos y asigna u omite cada producto antes de revisar operaciones.
      </div>`;
  }
  return `
    <div class="import-operation-list">${renderOperationGroups(ctx, rows, state)}</div>`;
}

function renderOperationGroups(ctx, rows, state) {
  const groups = new Map();
  for (const row of rows) {
    const product = row.raw?.Producto || row.raw?.Product || 'Sin instrumento asignado';
    const symbol = row.normalized?.symbol || product;
    const key = String(symbol || product);
    if (!groups.has(key)) groups.set(key, { symbol, product, rows: [] });
    groups.get(key).rows.push(row);
  }
  return Array.from(groups.values())
    .map((group) => {
      const actions = group.rows.map((row) => state.importRowActions?.[row.rowIndex] || (row.status === 'valid' ? 'import' : 'skip'));
      const importableRows = group.rows.filter((row) => row.status === 'valid');
      const importedRows = actions.filter((action) => action === 'import');
      const skippedRows = actions.filter((action) => action !== 'import');
      const groupAction = importedRows.length === group.rows.length ? 'import' : skippedRows.length === group.rows.length ? 'skip' : '';
      const rowIndexes = group.rows.map((row) => row.rowIndex).join(',');
      return `
        <details class="import-operation-group">
          <summary>
            <div>
              <strong>${ctx.escapeHtml(group.symbol || group.product)}</strong>
              <span>${group.rows.length} movimientos · ${importableRows.length} importables</span>
            </div>
            <select class="import-row-control" data-import-group-action="${ctx.escapeHtml(rowIndexes)}">
              <option value=""${groupAction === '' ? ' selected' : ''}>Mixto</option>
              <option value="import"${groupAction === 'import' ? ' selected' : ''}>Importar grupo</option>
              <option value="skip"${groupAction === 'skip' ? ' selected' : ''}>Omitir grupo</option>
            </select>
          </summary>
          <div class="import-operation-group-details">
            ${group.rows.map((row) => renderOperationRow(ctx, row, state)).join('')}
          </div>
        </details>`;
    })
    .join('');
}

function renderOperationRow(ctx, row, state) {
  const selectedAction = state.importRowActions?.[row.rowIndex] || (row.status === 'valid' ? 'import' : 'skip');
  const symbol = row.normalized?.symbol || row.normalized?.name || row.raw?.Producto || row.raw?.Product || 'Sin instrumento asignado';
  const hasZeroPrice = row.normalized?.originalPrice === 0 && row.normalized?.type === 'add';
  const rowWarnings = row.normalized?.warnings || [];
  const rawReference = row.raw?.Producto || row.raw?.Product || row.raw?.Descripcion || row.raw?.Descripción || row.raw?.Description || row.raw?.ISIN || row.raw?.Isin || '';
  const unresolvedReference = !row.normalized?.symbol && rawReference
    ? `<small class="import-row-reference">Excel: ${ctx.escapeHtml(rawReference)}</small>`
    : '';
  return `
    <article class="import-operation-row import-row-${ctx.escapeHtml(row.status)}">
      <div>
        <strong>${ctx.escapeHtml(symbol)}</strong>
        <span>${ctx.escapeHtml(row.normalized?.type === 'remove' ? 'Venta' : 'Compra')} · ${row.normalized?.date ? ctx.formatDate(row.normalized.date) : '-'} · ${Number.isFinite(row.normalized?.shares) ? ctx.formatShareNumber(row.normalized.shares) : '-'} acciones</span>
        ${unresolvedReference}
      </div>
      <span class="status-pill status-${statusBadgeClass(row.status)}">${ctx.escapeHtml(STATUS_LABELS[row.status] || row.status)}</span>
      <div class="import-operation-money">
        <strong>${Number.isFinite(row.normalized?.valueEur) ? ctx.formatCurrency(row.normalized.valueEur) : '-'}</strong>
        <small>Comisión ${Number.isFinite(row.normalized?.commissionEur) ? ctx.formatCurrency(row.normalized.commissionEur) : '-'}</small>
        ${hasZeroPrice ? '<small class="import-warning-text">Precio original 0€ (split/dividendo)</small>' : ''}
      </div>
      <select class="import-row-control" data-import-row-action="${row.rowIndex}">
        <option value="import"${selectedAction === 'import' ? ' selected' : ''}>Importar</option>
        <option value="skip"${selectedAction === 'skip' ? ' selected' : ''}>Omitir</option>
      </select>
      <p>${ctx.escapeHtml(row.blockReasonMessage || (row.errors || []).join('; ') || rowWarnings.join('; ') || row.ignoreReason || row.ledgerMatch?.reason || 'Lista para importar')}</p>
    </article>`;
}

export function renderImportPreviewContent(ctx, preview, workflowState, warnings = []) {
  const activeStep = workflowState.importStep || 'file';
  const instrumentOptions = (ctx.state.instruments || [])
    .filter((item) => item.type !== 'fx')
    .map((item) => ({ symbol: item.symbol, label: `${item.symbol} - ${item.name}` }));
  const canContinue = true;

  let body = '';
  if (activeStep === 'file') body = renderFileStep(ctx, preview, warnings);
  else if (activeStep === 'instruments') body = renderInstrumentsStep(ctx, preview, workflowState, instrumentOptions);
  else if (activeStep === 'operations') body = renderOperationsStep(ctx, preview, workflowState);
  else body = renderConfirmStep(ctx, preview);

  return `
    ${renderProgress(activeStep, workflowState)}
    <section class="import-step-body">${body}</section>
    ${renderWorkflowActions(activeStep, preview, canContinue, workflowState)}
  `;
}
