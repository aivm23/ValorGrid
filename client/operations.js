import { DEFAULT_OPERATION_METRIC_IDS } from './operations-metrics.js';

export function attach(ctx) {
  function metricInfo(label, tooltip, id) {
    const escapedLabel = ctx.escapeHtml(label);
    const escapedTooltip = ctx.escapeHtml(tooltip);
    return `
      <div class="metric-label">
        <span>${escapedLabel}</span>
        <button type="button" class="metric-info-button" aria-label="Información sobre la métrica" aria-describedby="${id}">i</button>
        <span id="${id}" class="sr-only">${escapedTooltip}</span>
        <div class="metric-info-tooltip" role="tooltip" aria-hidden="true">${escapedTooltip}</div>
      </div>`;
  }

  function renderPerformance() {
    const performance = ctx.state.summary?.performance;
    const metricIds = ctx.state.uiPreferences?.operationsMetricIds || DEFAULT_OPERATION_METRIC_IDS;

    if (!performance) {
      ctx.elements.performanceSummary.innerHTML = '<article><span>Rentabilidad</span><strong>Pendiente</strong></article>';
      return;
    }

    const netContributed = performance.netContributed;
    const contributedMicro = netContributed >= 0 ? 'desde primer movimiento' : 'retirada neta total';
    const contributedTooltip = 'Aportado neto total desde el primer movimiento: compras y comisiones menos ventas netas. Si es negativo, ya has retirado más caja de la aportada.';

    const totalGain = performance.totalGain;
    let resultMicro;
    if (netContributed < 0) {
      resultMicro = 'valor + retirado neto';
    } else if (netContributed === 0) {
      resultMicro = 'sin aportación neta';
    } else {
      resultMicro = `${ctx.formatPercent(performance.simpleReturnPct)} sobre aportado`;
    }
    const resultTooltip = 'Resultado total = valor mercado - aportado neto. Cuando el aportado neto es negativo, se lee como valor mercado + retirada neta.';

    const currentValue = ctx.state.summary.total;
    const unrealizedGain = performance.unrealizedGain;
    const openInvestment = currentValue - unrealizedGain;
    let latentMicro;
    if (openInvestment > 0) {
      const latentPct = (unrealizedGain / openInvestment) * 100;
      latentMicro = `${latentPct.toFixed(1)}% sobre inversión abierta`;
    } else {
      latentMicro = 'sin inversión abierta';
    }
    const latentTooltip = 'Plusvalía no realizada de posiciones abiertas. El porcentaje compara la plusvalía latente con la inversión que sigue abierta tras ventas FIFO, no con todas las compras históricas.';

    const commissionCopy = performance.commissions > 0 && performance.transactionCount > 0
      ? `${(performance.commissions / performance.transactionCount).toFixed(2)} €/movimiento`
      : 'sin comisiones';

    const borderClasses = ['has-border-accent', 'has-border-accent', 'has-border-positive', 'has-border-positive', 'has-border-positive', 'has-border-amber'];

    const html = metricIds
      .map((metricId, index) => {
        const borderClass = borderClasses[index] || '';
        const content = renderMetricContent(metricId, {
          currentValue, netContributed, contributedMicro, contributedTooltip,
          totalGain, resultMicro, resultTooltip,
          unrealizedGain, latentMicro, latentTooltip,
          openInvestment, performance, commissionCopy, metricInfo,
        });
        return content
          ? `<article class="${borderClass}">${content}</article>`
          : '';
      })
      .join('');

    ctx.elements.performanceSummary.innerHTML = html || '';
  }

  function renderMetricContent(metricId, props) {
    const { currentValue, netContributed, contributedMicro, contributedTooltip, totalGain, resultMicro, resultTooltip, unrealizedGain, latentMicro, latentTooltip, openInvestment, performance, commissionCopy, metricInfo } = props;
    switch (metricId) {
          case 'marketValue':
            return `
              <span>Valor mercado</span>
              <strong>${ctx.formatCurrency(currentValue)}</strong>
              <small class="metric-micro">a precios actuales</small>`;
          case 'netContributed':
            return `
              ${metricInfo('Aportado neto', contributedTooltip, 'op-contributed-info')}
              <strong class="${ctx.moneyClass(netContributed)}">${ctx.formatCurrency(netContributed)}</strong>
              <small class="metric-micro">${contributedMicro}</small>`;
          case 'totalGain':
            return `
              ${metricInfo('Resultado total', resultTooltip, 'op-result-info')}
              <strong class="${ctx.moneyClass(totalGain)}">${ctx.formatCurrency(totalGain)}</strong>
              <small class="metric-micro">${resultMicro}</small>`;
          case 'unrealizedGain':
            return `
              ${metricInfo('Plusvalía latente', latentTooltip, 'op-latent-info')}
              <strong class="${ctx.moneyClass(unrealizedGain)}">${ctx.formatCurrency(unrealizedGain)}</strong>
              <small class="metric-micro">${latentMicro}</small>`;
          case 'realizedGain':
            return `
              <span>Plusvalía realizada</span>
              <strong class="${ctx.moneyClass(performance.realizedGain)}">${ctx.formatCurrency(performance.realizedGain)}</strong>
              <small class="metric-micro">resultado ventas FIFO</small>`;
          case 'commissions':
            return `
              <span>Comisiones</span>
              <strong>${ctx.formatCurrency(performance.commissions)}</strong>
              <small class="metric-micro">${commissionCopy}</small>`;
          case 'simpleReturnPct': {
            const pct = performance.simpleReturnPct;
            const displayPct = pct !== null ? ctx.formatPercent(pct) : 'N/D';
            const microText = pct !== null ? 'retorno sobre aportado' : 'requiere neto aportado > 0';
            return `
              ${metricInfo('Rentabilidad simple', 'Resultado total como porcentaje del capital aportado. No disponible cuando el neto aportado es negativo (has retirado más de lo aportado).', 'op-simplereturn-info')}
              <strong>${displayPct}</strong>
              <small class="metric-micro">${microText}</small>`;
          }
          case 'transactionCount':
            return `
              <span>Nº movimientos</span>
              <strong>${performance.transactionCount || 0}</strong>
              <small class="metric-micro">compras y ventas totales</small>`;
          case 'averageCommission':
            return `
              <span>Comisión media</span>
              <strong>${performance.transactionCount > 0 ? ctx.formatCurrency(performance.commissions / performance.transactionCount) : 'N/D'}</strong>
              <small class="metric-micro">por movimiento</small>`;
          case 'openInvestment':
            return `
              ${metricInfo('Inversión abierta', 'Valor de mercado menos plusvalía latente. Es el capital que sigue invertido en posiciones abiertas tras ventas FIFO.', 'op-openinvestment-info')}
              <strong>${ctx.formatCurrency(openInvestment)}</strong>
              <small class="metric-micro">capital actualmente invertido</small>`;
          case 'netCashFlow':
            return `
              ${metricInfo('Cash-flow neto', 'Flujo de caja neto total: aportaciones menos retiraciones. Negativo = neto aportado, positivo = neto retirado.', 'op-netcashflow-info')}
              <strong class="${ctx.moneyClass(performance.netCashFlow)}">${ctx.formatCurrency(performance.netCashFlow)}</strong>
              <small class="metric-micro">flujo neto acumulado</small>`;
          case 'grossBought':
            return `
              <span>Compras brutas</span>
              <strong>${ctx.formatCurrency(performance.grossInvested || 0)}</strong>
              <small class="metric-micro">total comprado sin comisiones</small>`;
          case 'grossSold':
            return `
              <span>Ventas brutas</span>
              <strong>${ctx.formatCurrency(performance.grossWithdrawn || 0)}</strong>
              <small class="metric-micro">total vendido sin comisiones</small>`;
          default:
            return '';
        }
  }

  function renderBackups() {
    const backups = ctx.state.backups || [];
    if (!backups.length) {
      ctx.elements.backupList.innerHTML = '<span class="subtle">Sin backups todavía.</span>';
      return;
    }
    ctx.elements.backupList.innerHTML = `<h4>Backups recientes</h4>${backups.slice(0, 5).map((backup) => {
      const downloadUrl = `/api/backups/${encodeURIComponent(backup.file)}`;
      const downloadIcon = '<svg class="toolbar-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 18h16"></path></svg>';
      const deleteIcon = '<svg class="toolbar-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path></svg>';
      return `<div class="import-batch-row"><span><strong>${ctx.escapeHtml(backup.file)}</strong></span><small>${ctx.escapeHtml(ctx.formatFileSize(backup.size))}</small><div style="display:flex;gap:6px;align-items:center"><a href="${downloadUrl}" class="button button-compact btn-accent" type="button" title="Descargar este backup">${downloadIcon} Descargar</a><button type="button" class="button icon-bulk-delete" data-file="${ctx.escapeHtml(backup.file)}" title="Eliminar este backup">${deleteIcon}<span>Eliminar</span></button></div></div>`;
    }).join('')}`;
  }

  function groupOptions(selectedId) {
    return ctx.state.groups
      .map((group) => `<option value="${ctx.escapeHtml(group.id)}" ${group.id === selectedId ? 'selected' : ''}>${ctx.escapeHtml(group.name)}</option>`)
      .join('');
  }

  function currentSharesForInstrument(instrument) {
    const symbol = String(instrument.symbol || '').toUpperCase();
    const baseShares = Number(instrument.baseShares || instrument.base_shares || 0);
    return (ctx.state.transactions || [])
      .filter((transaction) => String(transaction.symbol || '').toUpperCase() === symbol)
      .reduce((sum, transaction) => {
        const shares = Number(transaction.shares || 0);
        return transaction.type === 'remove' ? sum - shares : sum + shares;
      }, baseShares);
  }

  function renderInstruments() {
    renderGroupRows();
    ctx.elements.newInstrumentGroup.innerHTML = groupOptions(ctx.state.groups[0]?.id);
    if (ctx.elements.instrumentFilterGroup) {
      const selectedGroup = ctx.state.instrumentFilters?.group || '';
      ctx.elements.instrumentFilterGroup.innerHTML = `<option value="">Todos</option>${groupOptions(selectedGroup)}`;
    }
    if (ctx.elements.instrumentPositionFilter) {
      ctx.elements.instrumentPositionFilter.value = ctx.state.instrumentPositionFilter || 'all';
    }
    const filters = ctx.state.instrumentFilters || {};
    const matchesText = (value, filter) =>
      !String(filter || '').trim() ||
      String(value || '').toLowerCase().includes(String(filter).trim().toLowerCase());
    const tolerance = 0.000001;
    const instruments = ctx.state.instruments
      .filter((instrument) => instrument.type !== 'fx')
      .map((instrument) => ({ ...instrument, currentShares: currentSharesForInstrument(instrument) }))
      .filter((instrument) => {
        if (ctx.state.instrumentPositionFilter === 'open') return Math.abs(Number(instrument.currentShares || 0)) > tolerance;
        if (ctx.state.instrumentPositionFilter === 'closed') return Math.abs(Number(instrument.currentShares || 0)) <= tolerance;
        return true;
      })
      .filter((instrument) => {
        return (
          matchesText(instrument.symbol, filters.symbol) &&
          matchesText(instrument.yahooSymbol, filters.yahoo) &&
          matchesText(instrument.name, filters.name) &&
          (!filters.group || instrument.groupId === filters.group) &&
          matchesText(instrument.currency, filters.currency)
        );
      });
    ctx.state.visibleInstrumentSymbols = instruments.map((instrument) => instrument.symbol);
    const visibleInstrumentSymbols = new Set(ctx.state.visibleInstrumentSymbols);
    ctx.state.selectedInstrumentSymbols = (ctx.state.selectedInstrumentSymbols || []).filter((symbol) =>
      visibleInstrumentSymbols.has(symbol),
    );
    const selectedInstruments = new Set(ctx.state.selectedInstrumentSymbols || []);
    const selectedCount = selectedInstruments.size;
    if (ctx.elements.instrumentSelectionCount) {
      ctx.elements.instrumentSelectionCount.textContent = `${selectedCount} valor${selectedCount === 1 ? '' : 'es'} seleccionado${selectedCount === 1 ? '' : 's'}`;
    }
    if (ctx.elements.deleteSelectedInstruments) ctx.elements.deleteSelectedInstruments.hidden = selectedCount === 0;
    if (ctx.elements.selectVisibleInstruments) {
      ctx.elements.selectVisibleInstruments.hidden =
        selectedCount === 0 || !ctx.state.visibleInstrumentSymbols.length || selectedCount === ctx.state.visibleInstrumentSymbols.length;
    }
    if (ctx.elements.deselectAllInstruments) ctx.elements.deselectAllInstruments.hidden = selectedCount === 0;
    ctx.elements.instrumentRows.innerHTML = instruments.length
      ? instruments
          .map(
            (instrument) => `
        <tr data-instrument="${ctx.escapeHtml(instrument.symbol)}">
          <td data-label="Ticker"><label class="row-select"><input type="checkbox" data-select-instrument="${ctx.escapeHtml(instrument.symbol)}" ${selectedInstruments.has(instrument.symbol) ? 'checked' : ''} aria-label="Seleccionar ${ctx.escapeHtml(instrument.symbol)}" /><strong class="instrument-symbol-label" title="${ctx.escapeHtml(instrument.symbol)}">${ctx.escapeHtml(instrument.symbol)}</strong></label></td>
          <td data-label="Yahoo"><input class="instrument-input" data-field="yahooSymbol" value="${ctx.escapeHtml(instrument.yahooSymbol)}" /></td>
          <td data-label="Nombre"><input class="instrument-input" data-field="name" value="${ctx.escapeHtml(instrument.name)}" /></td>
          <td data-label="Grupo"><select class="instrument-input" data-field="groupId">${groupOptions(instrument.groupId)}</select></td>
          <td data-label="Tipo">
            <select class="instrument-input" data-field="type">
              <option value="etf" ${instrument.type === 'etf' ? 'selected' : ''}>ETF</option>
              <option value="stock" ${instrument.type === 'stock' ? 'selected' : ''}>Stock</option>
            </select>
          </td>
          <td data-label="Divisa"><input class="instrument-input" data-field="currency" value="${ctx.escapeHtml(instrument.currency)}" /></td>
          <td data-label="Color"><input class="instrument-input instrument-color" data-field="color" type="color" value="${ctx.escapeHtml(instrument.color)}" /></td>
          <td data-label="Acciones"><button class="button button-compact btn-save" type="button" data-save-instrument="${ctx.escapeHtml(instrument.symbol)}">Guardar</button></td>
        </tr>`,
          )
          .join('')
      : '<tr><td colspan="8"><div class="empty-action-state"><span class="subtle">Sin valores para este filtro.</span><button class="button button-compact btn-save" type="button" data-open-onboarding>Crear valor</button></div></td></tr>';
  }

  function renderGroupRows() {
    ctx.state.visibleGroupIds = ctx.state.groups.map((group) => group.id);
    const visibleGroupIds = new Set(ctx.state.visibleGroupIds);
    ctx.state.selectedGroupIds = (ctx.state.selectedGroupIds || []).filter((id) => visibleGroupIds.has(id));
    const selectedGroups = new Set(ctx.state.selectedGroupIds || []);
    const selectedCount = selectedGroups.size;
    if (ctx.elements.groupSelectionCount) {
      ctx.elements.groupSelectionCount.textContent = `${selectedCount} grupo${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}`;
    }
    if (ctx.elements.deleteSelectedGroups) ctx.elements.deleteSelectedGroups.hidden = selectedCount === 0;
    if (ctx.elements.selectVisibleGroups) {
      ctx.elements.selectVisibleGroups.hidden =
        selectedCount === 0 || !ctx.state.visibleGroupIds.length || selectedCount === ctx.state.visibleGroupIds.length;
    }
    if (ctx.elements.deselectAllGroups) ctx.elements.deselectAllGroups.hidden = selectedCount === 0;
    ctx.elements.groupRows.innerHTML = ctx.state.groups.length
      ? ctx.state.groups
          .map(
        (group) => `
        <article class="group-card" data-group="${ctx.escapeHtml(group.id)}">
          <label class="row-select group-select"><input type="checkbox" data-select-group="${ctx.escapeHtml(group.id)}" ${selectedGroups.has(group.id) ? 'checked' : ''} aria-label="Seleccionar grupo ${ctx.escapeHtml(group.name)}" /><span>Seleccionar</span></label>
          <input class="instrument-input group-name-input" data-group-field="name" value="${ctx.escapeHtml(group.name)}" aria-label="Nombre del grupo" />
          <input class="instrument-input instrument-color" data-group-field="color" type="color" value="${ctx.escapeHtml(group.color)}" aria-label="Color del grupo" />
          <details class="group-visual-options">
            <summary>Opciones de visualizacion</summary>
            <div class="group-card-options">
              <label class="switch-field"><input type="checkbox" data-group-field="showInDistribution" ${group.showInDistribution ? 'checked' : ''} /> Mostrar en dashboard</label>
              <label class="switch-field"><input type="checkbox" data-group-field="showInMonthly" ${group.showInMonthly ? 'checked' : ''} /> Mostrar en revision YTD</label>
              <label class="switch-field"><input type="checkbox" data-group-field="isExpandable" ${group.isExpandable ? 'checked' : ''} /> Permitir desglose</label>
            </div>
          </details>
          <button class="button button-compact btn-save" type="button" data-save-group="${ctx.escapeHtml(group.id)}">Guardar</button>
        </article>`,
          )
          .join('')
      : '<div class="empty-config-state">Sin grupos. Crea uno para clasificar valores.</div>';
  }

  function getAvailableMetricOptions(_selectedIds) {
    const available = [
      { id: 'marketValue', label: 'Valor mercado' },
      { id: 'netContributed', label: 'Aportado neto' },
      { id: 'totalGain', label: 'Resultado total' },
      { id: 'unrealizedGain', label: 'Plusvalía latente' },
      { id: 'realizedGain', label: 'Plusvalía realizada' },
      { id: 'commissions', label: 'Comisiones' },
      { id: 'simpleReturnPct', label: 'Rentabilidad simple' },
      { id: 'transactionCount', label: 'Nº movimientos' },
      { id: 'averageCommission', label: 'Comisión media' },
      { id: 'openInvestment', label: 'Inversión abierta' },
      { id: 'netCashFlow', label: 'Cash-flow neto' },
      { id: 'grossBought', label: 'Compras brutas' },
      { id: 'grossSold', label: 'Ventas brutas' },
    ];
    return available;
  }

  function renderOperationsPreferenceControls() {
    const container = ctx.elements.operationsPreferenceControls;
    if (!container) return;

    const selectedIds = ctx.state.uiPreferences?.operationsMetricIds || DEFAULT_OPERATION_METRIC_IDS;
    const isEditable = ctx.state.uiPreferencesEditable !== false;
    const availableMetrics = getAvailableMetricOptions(selectedIds);

    let rowsHtml = '';
    for (let i = 0; i < 6; i++) {
      const currentId = selectedIds[i] || DEFAULT_OPERATION_METRIC_IDS[i];
      const optionsHtml = availableMetrics
        .map((m) => `<option value="${ctx.escapeHtml(m.id)}" ${m.id === currentId ? 'selected' : ''}>${ctx.escapeHtml(m.label)}</option>`)
        .join('');
      const disabledAttr = isEditable ? '' : 'disabled';
      rowsHtml += `
        <div class="operations-preference-row">
          <span class="preference-label">Posición ${i + 1}</span>
          <select class="preference-select operation-metric-select" data-position="${i}" aria-label="Métrica posición ${i + 1}" ${disabledAttr}>${optionsHtml}</select>
        </div>`;
    }

    container.innerHTML = `
      <div class="pro-preference-group">
        <div class="admin-card-head">
          <h3>Operativa</h3>
        </div>
        <div class="operations-preference-list">${rowsHtml}</div>
      </div>`;

    if (isEditable) {
      container.querySelectorAll('.operation-metric-select').forEach((select) => {
        select.addEventListener('change', (event) => handleOperationMetricPreferenceChange(event));
      });
    }
  }

  async function handleOperationMetricPreferenceChange(event) {
    const select = event.target;
    const position = Number(select.dataset.position);
    const newMetricId = select.value;
    const currentIds = [...(ctx.state.uiPreferences?.operationsMetricIds || DEFAULT_OPERATION_METRIC_IDS)];

    const oldMetricId = currentIds[position];
    if (oldMetricId === newMetricId) return;

    currentIds[position] = newMetricId;

    try {
      await ctx.sendJson('/api/preferences/ui', 'PUT', { operationsMetricIds: currentIds });
      ctx.state.uiPreferences = { operationsMetricIds: currentIds };
      ctx.state.uiPreferencesEditable = true;
      ctx.renderPerformance();
    } catch {
      select.value = oldMetricId;
    }
  }

  async function applyOperationMetricPreferences(payload) {
    if (!payload || !Array.isArray(payload.operationsMetricIds)) return;
    ctx.state.uiPreferences = { operationsMetricIds: [...payload.operationsMetricIds] };
    ctx.state.uiPreferencesEditable = payload.editable !== false;
    ctx.renderPerformance();
    ctx.renderOperationsPreferenceControls?.();
  }

  Object.assign(ctx, { renderPerformance, renderBackups, renderInstruments, renderGroupRows, renderOperationsPreferenceControls, handleOperationMetricPreferenceChange, applyOperationMetricPreferences });
}
