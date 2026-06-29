import { renderConfirmStep } from './import-confirm-renderer.js';

const STEP_ORDER = ['file', 'instruments', 'operations', 'confirm'];

const STEP_LABELS = {
  file: 'import.steps.file',
  instruments: 'import.steps.instruments',
  operations: 'import.steps.operations',
  confirm: 'import.steps.confirm',
};

const STATUS_LABELS = {
  valid: 'import.status.valid',
  needs_mapping: 'import.status.needsMapping',
  blocked: 'import.status.blocked',
  ignored: 'import.status.ignored',
  duplicate: 'import.status.duplicate',
  skipped: 'import.status.skipped',
  error: 'import.status.blocked',
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

function renderProgress(ctx, activeStep, state) {
  const activeIndex = stepIndex(activeStep);
  return `
    <div class="import-progress" aria-label="${ctx.escapeHtml(ctx.t('import.progress.label'))}">
      ${STEP_ORDER.map((step, index) => {
        const done = Boolean(state.importConfirmedSteps?.[step]) || index < activeIndex;
        return `
          <div class="import-progress-item${step === activeStep ? ' is-active' : ''}${done ? ' is-done' : ''}">
            <span>${index + 1}</span>
            <strong>${ctx.t(STEP_LABELS[step])}</strong>
          </div>`;
      }).join('')}
    </div>`;
}

function renderWorkflowActions(ctx, activeStep, preview, canContinue = true, state = {}) {
  const busy = Boolean(state.importWorkflowBusy);
  const backDisabled = activeStep === 'file' || busy ? ' disabled' : '';
  if (!preview) return '';
  let nextLabel = ctx.t('import.actions.next.default');
  if (busy && activeStep === 'instruments') nextLabel = ctx.t('import.actions.confirming');
  else if (busy && activeStep === 'file') nextLabel = ctx.t('import.actions.analyzing');
  else if (activeStep === 'file') nextLabel = ctx.t('import.actions.toInstruments');
  else if (activeStep === 'instruments') nextLabel = ctx.t('import.actions.confirmInstruments');
  else if (activeStep === 'operations') nextLabel = ctx.t('import.actions.reviewImpact');
  const nextDisabled = !preview || !canContinue || busy || (activeStep === 'confirm' && !preview.canCommit) ? ' disabled' : '';
  return `
    <div class="import-workflow-actions">
      ${activeStep === 'file' ? '<span></span>' : `<button type="button" class="button btn-cancel" data-import-back${backDisabled}>${ctx.t('import.actions.back')}</button>`}
      <button type="button" class="button btn-save" data-import-next${nextDisabled}>${nextLabel}</button>
    </div>`;
}

function renderSummary(ctx, preview) {
  const summary = preview.summary || {};
  return `
    <div class="import-summary-cards">
      <article><span>${ctx.t('import.summary.rows')}</span><strong>${summary.rowCount || 0}</strong></article>
      <article><span>${ctx.t('import.summary.importable')}</span><strong>${summary.buys + summary.sells || 0}</strong></article>
      <article><span>${ctx.t('import.summary.pending')}</span><strong>${summary.needsMappingCount || 0}</strong></article>
      <article><span>${ctx.t('import.summary.review')}</span><strong>${summary.blockedCount || 0}</strong></article>
      <article><span>${ctx.t('import.summary.duplicates')}</span><strong>${summary.duplicateCount || 0}</strong></article>
      <article><span>${ctx.t('import.summary.ignored')}</span><strong>${summary.ignoredCount || 0}</strong></article>
      <article><span>${ctx.t('import.summary.fees')}</span><strong>${ctx.formatCurrency(summary.commissionEur || 0)}</strong></article>
    </div>`;
}

function renderFileStep(ctx, preview, warnings = []) {
  if (!preview) {
    return `
      <div class="import-empty-step">
        <strong>${ctx.t('import.empty.ready')}</strong>
        <span>${ctx.t('import.empty.instructions')}</span>
      </div>`;
  }
  return `
    ${preview.fileSubtype ? `<div class="import-kind-pill"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v10l4-3 4 3V2a1 1 0 00-1-1H4a1 1 0 00-1 1z"/></svg> ${ctx.escapeHtml(ctx.t('import.detectedFormat'))} <strong>${ctx.escapeHtml(preview.fileSubtypeLabel || preview.fileSubtype)}</strong></div>` : ''}
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
    return `<div class="subtle">${ctx.t('import.suggestions.empty')}</div>`;
  }
  return `
    <div class="import-suggestions">
      ${suggestions
        .map(
          (suggestion, index) => `
            <button type="button" class="button button-compact btn-save" data-import-use-suggestion="${ctx.escapeHtml(item.key)}" data-suggestion-index="${index}">
              ${ctx.escapeHtml(ctx.t('import.suggestions.use', { symbol: suggestion.yahooSymbol }))}
              <small>${ctx.escapeHtml(suggestion.confidence || ctx.t('import.suggestions.confidenceFallback'))}</small>
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
  const badgeLabel = safetyOmitted
    ? ctx.t('import.instrument.badge.safetyOmitted')
    : omitted
      ? ctx.t('import.instrument.badge.omitted')
      : attempted
        ? complete
          ? ctx.t('import.instrument.badge.confirmed')
          : ctx.t('import.instrument.badge.incomplete')
        : ctx.t('import.instrument.badge.pending');
  const missingFields = action === 'create' && attempted ? missingCreateFields(create) : new Set();
  const visibleTicker = create.yahooSymbol || create.symbol || item.symbol || '';
  return `
    <article class="import-instrument-card${attempted && complete ? ' is-confirmed' : ''}${attempted && !complete && !omitted ? ' is-incomplete' : ''}${safetyOmitted ? ' is-safety-omitted' : ''}">
      <header>
        <div>
          <strong>${ctx.escapeHtml(item.label || item.key)}</strong>
          <p class="subtle">${visibleTicker ? `${ctx.escapeHtml(ctx.t('import.instrument.tickerSuggested', { ticker: visibleTicker }))} · ` : ''}${ctx.escapeHtml(item.currency || '-')} · ${ctx.escapeHtml(item.exchange || '-')}</p>
        </div>
        <span class="status-pill status-${statusBadgeClass(badgeStatus)}">${badgeLabel}</span>
      </header>
      <div class="import-instrument-metrics">
        <span>${ctx.tn('import.instrument.operations', item.rowCount || 0)}</span>
        <span>${ctx.t('import.instrument.buySell', { buys: item.buys || 0, sells: item.sells || 0 })}</span>
        <span>${ctx.formatCurrency(item.approxValueEur || 0)}</span>
        ${item.firstDate && item.lastDate ? `<span>${ctx.formatDate(item.firstDate)} - ${ctx.formatDate(item.lastDate)}</span>` : ''}
      </div>
      ${safetyOmitted ? `<div class="import-safety-message">${ctx.escapeHtml(ctx.t('import.instrument.safetyMessage'))}</div>` : ''}
      ${!complete || action !== 'map' ? renderSuggestions(ctx, item) : ''}
      <label class="field">
        <span>${ctx.t('import.instrument.decision')}</span>
        <select data-import-instrument-action="${ctx.escapeHtml(item.key)}">
          <option value="map"${action === 'map' ? ' selected' : ''}>${ctx.t('import.instrument.action.map')}</option>
          <option value="create"${action === 'create' ? ' selected' : ''}>${ctx.t('import.instrument.action.create')}</option>
          <option value="omit"${action === 'omit' ? ' selected' : ''}>${ctx.t('import.instrument.action.omit')}</option>
        </select>
      </label>
      ${
        action === 'map'
          ? `<label class="field">
              <span>${ctx.t('import.instrument.target')}</span>
              <select data-import-instrument-symbol="${ctx.escapeHtml(item.key)}">
                <option value="">${ctx.t('import.instrument.selectTarget')}</option>
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
              <input class="${missingFields.has('symbol') ? 'import-field-missing' : ''}" data-import-create-symbol="${ctx.escapeHtml(item.key)}" value="${ctx.escapeHtml(create.symbol || '')}" placeholder="${ctx.escapeHtml(ctx.t('import.instrument.placeholder.symbol'))}" />
              <input class="${missingFields.has('yahooSymbol') ? 'import-field-missing' : ''}" data-import-create-yahoo="${ctx.escapeHtml(item.key)}" value="${ctx.escapeHtml(create.yahooSymbol || '')}" placeholder="${ctx.escapeHtml(ctx.t('import.instrument.placeholder.providerRef'))}" />
              <input class="${missingFields.has('name') ? 'import-field-missing' : ''}" data-import-create-name="${ctx.escapeHtml(item.key)}" value="${ctx.escapeHtml(create.name || item.label || '')}" placeholder="${ctx.escapeHtml(ctx.t('import.instrument.placeholder.name'))}" />
              <select data-import-create-type="${ctx.escapeHtml(item.key)}">
                <option value="etf"${(create.type || 'stock') === 'etf' ? ' selected' : ''}>ETF</option>
                <option value="stock"${(create.type || 'stock') === 'stock' ? ' selected' : ''}>Stock</option>
              </select>
              <input class="${missingFields.has('currency') ? 'import-field-missing' : ''}" data-import-create-currency="${ctx.escapeHtml(item.key)}" value="${ctx.escapeHtml(create.currency || item.currency || 'EUR')}" placeholder="${ctx.escapeHtml(ctx.t('import.instrument.placeholder.currency'))}" />
              <div class="import-auto-group">${ctx.t('import.instrument.importedGroup')}</div>
              <input class="color-input" data-import-create-color="${ctx.escapeHtml(item.key)}" type="color" value="${ctx.escapeHtml(create.color || '#2563eb')}" />
            </div>`
          : ''
      }
    </article>
  `;
}

function renderInstrumentsStep(ctx, preview, state, instrumentOptions) {
  const detected = preview.detectedInstruments || [];
  if (!detected.length) return `<div class="subtle">${ctx.t('import.instruments.empty')}</div>`;
  return `
    <div class="import-step-intro">
      <strong>${ctx.t('import.instruments.intro.title')}</strong>
      <span>${ctx.t('import.instruments.intro.subtitle')}</span>
    </div>
    <div class="import-instrument-grid">${detected.map((item) => renderInstrumentCard(ctx, item, state, instrumentOptions)).join('')}</div>`;
}

function renderOperationsStep(ctx, preview, state) {
  const rows = preview.rows || [];
  if ((preview.instrumentMappingsRequired || []).length) {
    return `
      <div class="import-warning-banner">
        ${ctx.t('import.operations.unconfirmed')}
      </div>`;
  }
  return `
    <div class="import-operation-list">${renderOperationGroups(ctx, rows, state)}</div>`;
}

function renderOperationGroups(ctx, rows, state) {
  const groups = new Map();
  for (const row of rows) {
    const product = row.raw?.Producto || row.raw?.Product || ctx.t('import.operations.unassigned');
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
              <span>${ctx.tn('import.instrument.operations', group.rows.length)} · ${ctx.tn('import.operations.importable', importableRows.length)}</span>
            </div>
            <select class="import-row-control" data-import-group-action="${ctx.escapeHtml(rowIndexes)}">
              <option value=""${groupAction === '' ? ' selected' : ''}>${ctx.t('import.operations.mixed')}</option>
              <option value="import"${groupAction === 'import' ? ' selected' : ''}>${ctx.t('import.operations.importGroup')}</option>
              <option value="skip"${groupAction === 'skip' ? ' selected' : ''}>${ctx.t('import.operations.skipGroup')}</option>
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
  const symbol = row.normalized?.symbol || row.normalized?.name || row.raw?.Producto || row.raw?.Product || ctx.t('import.operations.unassigned');
  const hasZeroPrice = row.normalized?.originalPrice === 0 && row.normalized?.type === 'add';
  const rowWarnings = row.normalized?.warnings || [];
  const rawReference = row.raw?.Producto || row.raw?.Product || row.raw?.Descripcion || row.raw?.Descripción || row.raw?.Description || row.raw?.ISIN || row.raw?.Isin || '';
  const unresolvedReference = !row.normalized?.symbol && rawReference
    ? `<small class="import-row-reference">${ctx.escapeHtml(ctx.t('import.operations.excelReference', { value: rawReference }))}</small>`
    : '';
  return `
    <article class="import-operation-row import-row-${ctx.escapeHtml(row.status)}">
      <div>
        <strong>${ctx.escapeHtml(symbol)}</strong>
        <span>${ctx.escapeHtml(row.normalized?.type === 'remove' ? ctx.t('import.operation.sell') : ctx.t('import.operation.buy'))} · ${row.normalized?.date ? ctx.formatDate(row.normalized.date) : '-'} · ${Number.isFinite(row.normalized?.shares) ? ctx.formatInstrumentQuantity(row.normalized.shares, row.normalized) : '-'}</span>
        ${unresolvedReference}
      </div>
      <span class="status-pill status-${statusBadgeClass(row.status)}">${ctx.escapeHtml(ctx.t(STATUS_LABELS[row.status] || row.status))}</span>
      <div class="import-operation-money">
        <strong>${Number.isFinite(row.normalized?.valueEur) ? ctx.formatCurrency(row.normalized.valueEur) : '-'}</strong>
        <small>${ctx.t('import.row.commission')} ${Number.isFinite(row.normalized?.commissionEur) ? ctx.formatCurrency(row.normalized.commissionEur) : '-'}</small>
        ${hasZeroPrice ? `<small class="import-warning-text">${ctx.t('import.row.zeroPrice')}</small>` : ''}
      </div>
      <select class="import-row-control" data-import-row-action="${row.rowIndex}">
        <option value="import"${selectedAction === 'import' ? ' selected' : ''}>${ctx.t('import.operations.import')}</option>
        <option value="skip"${selectedAction === 'skip' ? ' selected' : ''}>${ctx.t('import.operations.skip')}</option>
      </select>
      <p>${ctx.escapeHtml(row.blockReasonMessage || (row.errors || []).join('; ') || rowWarnings.join('; ') || row.ignoreReason || row.ledgerMatch?.reason || ctx.t('import.operations.ready'))}</p>
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
    ${renderProgress(ctx, activeStep, workflowState)}
    <section class="import-step-body">${body}</section>
    ${renderWorkflowActions(ctx, activeStep, preview, canContinue, workflowState)}
  `;
}
