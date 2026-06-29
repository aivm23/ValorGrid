import { DEFAULT_OPERATION_METRIC_IDS } from './operations-metrics.js';

export function attach(ctx) {
  function metricInfo(label, tooltip, id) {
    const escapedLabel = ctx.escapeHtml(label);
    const escapedTooltip = ctx.escapeHtml(tooltip);
    return `
      <div class="metric-label">
        <span>${escapedLabel}</span>
        <button type="button" class="metric-info-button" aria-label="${ctx.escapeHtml(ctx.t('common.metricInfo'))}" aria-describedby="${id}">i</button>
        <span id="${id}" class="sr-only">${escapedTooltip}</span>
        <div class="metric-info-tooltip" role="tooltip" aria-hidden="true">${escapedTooltip}</div>
      </div>`;
  }

  function renderPerformance() {
    const performance = ctx.state.summary?.performance;
    const metricIds = DEFAULT_OPERATION_METRIC_IDS;

    if (!performance) {
      ctx.elements.performanceSummary.innerHTML = `<article><span>${ctx.escapeHtml(ctx.t('Rentabilidad'))}</span><strong>${ctx.escapeHtml(ctx.t('Pendiente'))}</strong></article>`;
      return;
    }

    const netContributed = performance.netContributed;
    const contributedMicro = ctx.t(
      netContributed >= 0
        ? 'operations.metrics.netContributed.micro.positive'
        : 'operations.metrics.netContributed.micro.negative',
    );
    const contributedTooltip = ctx.t('operations.metrics.netContributed.tooltip');

    const totalGain = performance.totalGain;
    let resultMicro;
    if (netContributed < 0) {
      resultMicro = ctx.t('operations.metrics.totalGain.micro.withdrawn');
    } else if (netContributed === 0) {
      resultMicro = ctx.t('operations.metrics.totalGain.micro.noContribution');
    } else {
      resultMicro = ctx.t('operations.metrics.totalGain.micro.overContributed', {
        value: ctx.formatPercent(performance.simpleReturnPct),
      });
    }
    const resultTooltip = ctx.t('operations.metrics.totalGain.tooltip');

    const currentValue = ctx.state.summary.total;
    const unrealizedGain = performance.unrealizedGain;
    const openInvestment = currentValue - unrealizedGain;
    let latentMicro;
    if (openInvestment > 0) {
      const latentPct = (unrealizedGain / openInvestment) * 100;
      latentMicro = ctx.t('operations.metrics.unrealizedGain.micro.openInvestment', {
        value: ctx.formatPercent(latentPct),
      });
    } else {
      latentMicro = ctx.t('operations.metrics.unrealizedGain.micro.noOpenInvestment');
    }
    const latentTooltip = ctx.t('operations.metrics.unrealizedGain.tooltip');

    const commissionCopy = performance.commissions > 0 && performance.transactionCount > 0
      ? ctx.t('operations.metrics.commissions.micro.average', {
          value: ctx.formatCurrency(performance.commissions / performance.transactionCount),
        })
      : ctx.t('operations.metrics.commissions.micro.empty');

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
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.marketValue.label'))}</span>
              <strong>${ctx.formatCurrency(currentValue)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.marketValue.micro'))}</small>`;
          case 'netContributed':
            return `
              ${metricInfo(ctx.t('operations.metrics.netContributed.label'), contributedTooltip, 'op-contributed-info')}
              <strong class="${ctx.moneyClass(netContributed)}">${ctx.formatCurrency(netContributed)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(contributedMicro)}</small>`;
          case 'totalGain':
            return `
              ${metricInfo(ctx.t('operations.metrics.totalGain.label'), resultTooltip, 'op-result-info')}
              <strong class="${ctx.moneyClass(totalGain)}">${ctx.formatCurrency(totalGain)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(resultMicro)}</small>`;
          case 'unrealizedGain':
            return `
              ${metricInfo(ctx.t('operations.metrics.unrealizedGain.label'), latentTooltip, 'op-latent-info')}
              <strong class="${ctx.moneyClass(unrealizedGain)}">${ctx.formatCurrency(unrealizedGain)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(latentMicro)}</small>`;
          case 'realizedGain':
            return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.realizedGain.label'))}</span>
              <strong class="${ctx.moneyClass(performance.realizedGain)}">${ctx.formatCurrency(performance.realizedGain)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.realizedGain.micro'))}</small>`;
          case 'commissions':
            return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.commissions.label'))}</span>
              <strong>${ctx.formatCurrency(performance.commissions)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(commissionCopy)}</small>`;
          case 'simpleReturnPct': {
            const pct = performance.simpleReturnPct;
            const displayPct = pct !== null ? ctx.formatPercent(pct) : ctx.t('common.notAvailable');
            const microText = pct !== null
              ? ctx.t('operations.metrics.simpleReturnPct.micro.available')
              : ctx.t('operations.metrics.simpleReturnPct.micro.unavailable');
            return `
              ${metricInfo(ctx.t('operations.metrics.simpleReturnPct.label'), ctx.t('operations.metrics.simpleReturnPct.tooltip'), 'op-simplereturn-info')}
              <strong>${ctx.escapeHtml(displayPct)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(microText)}</small>`;
          }
          case 'transactionCount':
            return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.transactionCount.label'))}</span>
              <strong>${performance.transactionCount || 0}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.transactionCount.micro'))}</small>`;
          case 'averageCommission':
            return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.averageCommission.label'))}</span>
              <strong>${performance.transactionCount > 0 ? ctx.formatCurrency(performance.commissions / performance.transactionCount) : ctx.escapeHtml(ctx.t('common.notAvailable'))}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.averageCommission.micro'))}</small>`;
          case 'openInvestment':
            return `
              ${metricInfo(ctx.t('operations.metrics.openInvestment.label'), ctx.t('operations.metrics.openInvestment.tooltip'), 'op-openinvestment-info')}
              <strong>${ctx.formatCurrency(openInvestment)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.openInvestment.micro'))}</small>`;
          case 'netCashFlow':
            return `
              ${metricInfo(ctx.t('operations.metrics.netCashFlow.label'), ctx.t('operations.metrics.netCashFlow.tooltip'), 'op-netcashflow-info')}
              <strong class="${ctx.moneyClass(performance.netCashFlow)}">${ctx.formatCurrency(performance.netCashFlow)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.netCashFlow.micro'))}</small>`;
          case 'grossBought':
            return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.grossBought.label'))}</span>
              <strong>${ctx.formatCurrency(performance.grossInvested || 0)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.grossBought.micro'))}</small>`;
          case 'grossSold':
            return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.grossSold.label'))}</span>
              <strong>${ctx.formatCurrency(performance.grossWithdrawn || 0)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.grossSold.micro'))}</small>`;
          case 'dividendIncome':
            const dividendCount = performance.dividendCount || 0;
            return `
              ${metricInfo(ctx.t('Dividendos'), ctx.t('operations.metrics.dividendIncome.tooltip'), 'op-dividends-info')}
              <strong>${ctx.formatCurrency(performance.dividendIncomeEur || 0)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.tn('operations.metrics.dividendIncome.micro', dividendCount))}</small>`;
          default:
            return '';
        }
  }

  function renderBackups() {
    const backups = ctx.state.backups || [];
    if (!backups.length) {
      ctx.elements.backupList.innerHTML = `<span class="subtle">${ctx.t('backups.empty')}</span>`;
      return;
    }
    ctx.elements.backupList.innerHTML = `<h4>${ctx.t('backups.recent')}</h4>${backups.slice(0, 5).map((backup) => {
      const downloadUrl = `/api/backups/${encodeURIComponent(backup.file)}`;
      const downloadIcon = '<svg class="toolbar-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 18h16"></path></svg>';
      const deleteIcon = '<svg class="toolbar-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path></svg>';
      return `<div class="backup-row"><span class="backup-name"><strong>${ctx.escapeHtml(backup.file)}</strong></span><div class="backup-meta"><small>${ctx.escapeHtml(ctx.formatFileSize(backup.size))}</small><div style="display:flex;gap:6px;align-items:center"><a href="${downloadUrl}" class="button button-compact btn-accent" type="button" title="${ctx.t('backups.downloadTitle')}">${downloadIcon} ${ctx.t('backups.download')}</a><button type="button" class="button icon-bulk-delete backup-delete-btn" data-file="${ctx.escapeHtml(backup.file)}" title="${ctx.t('backups.deleteTitle')}">${deleteIcon}<span>${ctx.t('backups.delete')}</span></button></div></div></div>`;
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
        if (transaction.type === 'dividend') return sum;
        return transaction.type === 'remove' ? sum - shares : sum + shares;
      }, baseShares);
  }

  function renderInstruments() {
    const groupsEnabled = ctx.state.groupsEnabled !== false;
    if (ctx.elements.instrumentGroupsSection) ctx.elements.instrumentGroupsSection.hidden = !groupsEnabled;
    if (ctx.elements.instrumentGroupsEnabled) ctx.elements.instrumentGroupsEnabled.checked = groupsEnabled;
    if (ctx.elements.instrumentThGroup) ctx.elements.instrumentThGroup.hidden = !groupsEnabled;
    if (groupsEnabled) {
      renderGroupRows();
    }
    ctx.elements.newInstrumentGroup.innerHTML = groupsEnabled && ctx.state.groups[0]?.id
      ? groupOptions(ctx.state.groups[0]?.id)
      : '';
    ctx.elements.newInstrumentGroup.hidden = !groupsEnabled;
    if (ctx.elements.instrumentCreateForm) ctx.elements.instrumentCreateForm.classList.toggle('no-groups', !groupsEnabled);
    if (ctx.elements.instrumentFilterGroup) {
      const selectedGroup = groupsEnabled ? (ctx.state.instrumentFilters?.group || '') : '';
      ctx.elements.instrumentFilterGroup.innerHTML = groupsEnabled ? `<option value="">Todos</option>${groupOptions(selectedGroup)}` : '<option value="">Todos</option>';
      ctx.elements.instrumentFilterGroup.closest('.field')?.toggleAttribute('hidden', !groupsEnabled);
    }
    if (ctx.elements.instrumentPositionFilter) ctx.elements.instrumentPositionFilter.value = ctx.state.instrumentPositionFilter || 'all';
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
    const colCount = groupsEnabled ? 8 : 7;
    ctx.elements.instrumentRows.innerHTML = instruments.length
      ? instruments
          .map(
            (instrument) => {
    const groupCol = groupsEnabled ? `<td data-label="Grupo"><select class="instrument-input" data-field="groupId">${groupOptions(instrument.groupId)}</select></td>` : '';
    return `
        <tr data-instrument="${ctx.escapeHtml(instrument.symbol)}">
          <td data-label="Ticker"><label class="row-select"><input type="checkbox" data-select-instrument="${ctx.escapeHtml(instrument.symbol)}" ${selectedInstruments.has(instrument.symbol) ? 'checked' : ''} aria-label="Seleccionar ${ctx.escapeHtml(instrument.symbol)}" /><strong class="instrument-symbol-label" title="${ctx.escapeHtml(instrument.symbol)}">${ctx.escapeHtml(instrument.symbol)}</strong></label></td>
          <td data-label="${instrument.type === 'commodity' ? 'Alpha Vantage' : 'Ref. Proveedor'}"><input class="instrument-input" data-field="yahooSymbol" value="${ctx.escapeHtml(instrument.yahooSymbol)}" /></td>
          <td data-label="Nombre"><input class="instrument-input" data-field="name" value="${ctx.escapeHtml(instrument.name)}" /></td>
          ${groupCol}
          <td data-label="Tipo">
            <select class="instrument-input" data-field="type">
              <option value="etf" ${instrument.type === 'etf' ? 'selected' : ''}>ETF</option>
              <option value="stock" ${instrument.type === 'stock' ? 'selected' : ''}>Stock</option>
              <option value="crypto" ${instrument.type === 'crypto' ? 'selected' : ''}>Crypto</option>
              <option value="commodity" ${instrument.type === 'commodity' ? 'selected' : ''}>Commodity</option>
            </select>
          </td>
          <td data-label="Divisa"><input class="instrument-input" data-field="currency" value="${ctx.escapeHtml(instrument.currency)}" /></td>
          <td data-label="Color"><input class="instrument-input instrument-color" data-field="color" type="color" value="${ctx.escapeHtml(instrument.color)}" ${ctx.state.brandPaletteEnabled ? 'disabled' : ''} /></td>
          <td data-label="Acciones"><button class="button button-compact btn-save" type="button" data-save-instrument="${ctx.escapeHtml(instrument.symbol)}">Guardar</button></td>
        </tr>`;}
          )
          .join('')
      : `<tr><td colspan="${colCount}"><div class="empty-action-state"><span class="subtle">Sin valores para este filtro.</span><button class="button button-compact btn-save" type="button" data-open-onboarding>Crear valor</button></div></td></tr>`;
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
          <input class="instrument-input instrument-color" data-group-field="color" type="color" value="${ctx.escapeHtml(group.color)}" aria-label="Color del grupo" ${ctx.state.brandPaletteEnabled ? 'disabled' : ''} />
          <details class="group-visual-options">
            <summary>Opciones de visualización</summary>
            <div class="group-card-options">
              <label class="switch-field"><input type="checkbox" data-group-field="showInDistribution" ${group.showInDistribution ? 'checked' : ''} /> Mostrar en dashboard</label>
              <label class="switch-field"><input type="checkbox" data-group-field="showInMonthly" ${group.showInMonthly ? 'checked' : ''} /> Mostrar en revisión YTD</label>
              <label class="switch-field"><input type="checkbox" data-group-field="isExpandable" ${group.isExpandable ? 'checked' : ''} /> Permitir desglose</label>
            </div>
          </details>
          <button class="button button-compact btn-save" type="button" data-save-group="${ctx.escapeHtml(group.id)}">Guardar</button>
        </article>`,
          )
          .join('')
      : '<div class="empty-config-state">Sin grupos. Crea uno para clasificar valores.</div>';
  }

  function renderOperationsPreferenceControls() {
    const container = ctx.elements.operationsPreferenceControls;
    if (!container) return;

    const options = ['Valor mercado', 'Aportado neto', 'Resultado total', 'Plusvalía latente', 'Plusvalía realizada', 'Comisiones'];
    container.innerHTML = `
      <div class="pro-preference-group">
        ${options.map((opt, i) => `
          <div class="pref-row">
            <span class="pref-label">Posición ${i + 1}</span>
            <select disabled>
              ${options.map(o => `<option${o === opt ? ' selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>`;
  }

  Object.assign(ctx, { renderPerformance, renderBackups, renderInstruments, renderGroupRows, renderOperationsPreferenceControls });
}
