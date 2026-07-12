import { DEFAULT_OPERATION_METRIC_IDS } from './operations-metrics.js';
import { createOperationsMetricRenderer } from './operations-metric-renderer.js';

export function attach(ctx) {
  const { renderMetricContent } = createOperationsMetricRenderer(ctx);

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

    const commissionCopy =
      performance.commissions > 0 && performance.transactionCount > 0
        ? ctx.t('operations.metrics.commissions.micro.average', {
            value: ctx.formatCurrency(performance.commissions / performance.transactionCount),
          })
        : ctx.t('operations.metrics.commissions.micro.empty');

    const borderClasses = [
      'has-border-accent',
      'has-border-accent',
      'has-border-positive',
      'has-border-positive',
      'has-border-positive',
      'has-border-amber',
    ];

    const html = metricIds
      .map((metricId, index) => {
        const borderClass = borderClasses[index] || '';
        const content = renderMetricContent(metricId, {
          currentValue,
          netContributed,
          contributedMicro,
          contributedTooltip,
          totalGain,
          resultMicro,
          resultTooltip,
          unrealizedGain,
          latentMicro,
          latentTooltip,
          openInvestment,
          performance,
          commissionCopy,
        });
        return content ? `<article class="${borderClass}">${content}</article>` : '';
      })
      .join('');

    ctx.elements.performanceSummary.innerHTML = html || '';
  }

  function renderBackups() {
    const backups = ctx.state.backups || [];
    if (!backups.length) {
      ctx.elements.backupList.innerHTML = `<span class="subtle">${ctx.t('backups.empty')}</span>`;
      return;
    }
    ctx.elements.backupList.innerHTML = `<h4>${ctx.t('backups.recent')}</h4>${backups
      .slice(0, 5)
      .map((backup) => {
        const downloadUrl = `/api/backups/${encodeURIComponent(backup.file)}`;
        const downloadIcon =
          '<svg class="toolbar-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 18h16"></path></svg>';
        const deleteIcon =
          '<svg class="toolbar-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path></svg>';
        return `<div class="backup-row"><span class="backup-name"><strong>${ctx.escapeHtml(backup.file)}</strong></span><div class="backup-meta"><small>${ctx.escapeHtml(ctx.formatFileSize(backup.size))}</small><div style="display:flex;gap:6px;align-items:center"><a href="${downloadUrl}" class="button button-compact btn-accent" type="button" title="${ctx.t('backups.downloadTitle')}">${downloadIcon} ${ctx.t('backups.download')}</a><button type="button" class="button icon-bulk-delete backup-delete-btn" data-file="${ctx.escapeHtml(backup.file)}" title="${ctx.t('backups.deleteTitle')}">${deleteIcon}<span>${ctx.t('backups.delete')}</span></button></div></div></div>`;
      })
      .join('')}`;
  }

  function groupOptions(selectedId) {
    return ctx.state.groups
      .map(
        (group) =>
          `<option value="${ctx.escapeHtml(group.id)}" ${group.id === selectedId ? 'selected' : ''}>${ctx.escapeHtml(group.name)}</option>`,
      )
      .join('');
  }

  function currentSharesForInstrument(instrument) {
    if (Number.isFinite(Number(instrument.currentShares))) return Number(instrument.currentShares);
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
    ctx.elements.newInstrumentGroup.innerHTML =
      groupsEnabled && ctx.state.groups[0]?.id ? groupOptions(ctx.state.groups[0]?.id) : '';
    ctx.elements.newInstrumentGroup.hidden = !groupsEnabled;
    if (ctx.elements.instrumentCreateForm)
      ctx.elements.instrumentCreateForm.classList.toggle('no-groups', !groupsEnabled);
    if (ctx.elements.instrumentFilterGroup) {
      const selectedGroup = groupsEnabled ? ctx.state.instrumentFilters?.group || '' : '';
      ctx.elements.instrumentFilterGroup.innerHTML = groupsEnabled
        ? `<option value="">Todos</option>${groupOptions(selectedGroup)}`
        : '<option value="">Todos</option>';
      ctx.elements.instrumentFilterGroup.closest('.field')?.toggleAttribute('hidden', !groupsEnabled);
    }
    if (ctx.elements.instrumentPositionFilter)
      ctx.elements.instrumentPositionFilter.value = ctx.state.instrumentPositionFilter || 'all';
    const filters = ctx.state.instrumentFilters || {};
    const matchesText = (value, filter) =>
      !String(filter || '').trim() ||
      String(value || '')
        .toLowerCase()
        .includes(String(filter).trim().toLowerCase());
    const tolerance = 0.000001;
    const instruments = ctx.state.instruments
      .filter((instrument) => instrument.type !== 'fx' && instrument.type !== 'cash')
      .map((instrument) => ({ ...instrument, currentShares: currentSharesForInstrument(instrument) }))
      .filter((instrument) => {
        if (ctx.state.instrumentPositionFilter === 'open')
          return Math.abs(Number(instrument.currentShares || 0)) > tolerance;
        if (ctx.state.instrumentPositionFilter === 'closed')
          return Math.abs(Number(instrument.currentShares || 0)) <= tolerance;
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
      ctx.elements.instrumentSelectionCount.textContent = ctx.tn('instrument.selection', selectedCount);
    }
    if (ctx.elements.deleteSelectedInstruments) ctx.elements.deleteSelectedInstruments.hidden = selectedCount === 0;
    if (ctx.elements.selectVisibleInstruments) {
      ctx.elements.selectVisibleInstruments.hidden =
        selectedCount === 0 ||
        !ctx.state.visibleInstrumentSymbols.length ||
        selectedCount === ctx.state.visibleInstrumentSymbols.length;
    }
    if (ctx.elements.deselectAllInstruments) ctx.elements.deselectAllInstruments.hidden = selectedCount === 0;
    const colCount = groupsEnabled ? 8 : 7;
    ctx.elements.instrumentRows.innerHTML = instruments.length
      ? instruments
          .map((instrument) => {
            const groupCol = groupsEnabled
              ? `<td data-label="${ctx.t('Grupo')}"><select class="instrument-input" data-field="groupId">${groupOptions(instrument.groupId)}</select></td>`
              : '';
            return `
        <tr data-instrument="${ctx.escapeHtml(instrument.symbol)}">
          <td data-label="Ticker"><label class="row-select"><input type="checkbox" data-select-instrument="${ctx.escapeHtml(instrument.symbol)}" ${selectedInstruments.has(instrument.symbol) ? 'checked' : ''} aria-label="${ctx.escapeHtml(ctx.t('instrument.selectAria', { symbol: instrument.symbol }))}" /><strong class="instrument-symbol-label" title="${ctx.escapeHtml(instrument.symbol)}">${ctx.escapeHtml(instrument.symbol)}</strong></label></td>
          <td data-label="${instrument.type === 'commodity' ? 'Alpha Vantage' : ctx.t('Ref. Proveedor')}"><input class="instrument-input" data-field="yahooSymbol" value="${ctx.escapeHtml(instrument.yahooSymbol)}" /></td>
          <td data-label="${ctx.t('Nombre')}"><input class="instrument-input" data-field="name" value="${ctx.escapeHtml(instrument.name)}" /></td>
          ${groupCol}
          <td data-label="${ctx.t('Tipo')}">
            <select class="instrument-input" data-field="type">
              <option value="etf" ${instrument.type === 'etf' ? 'selected' : ''}>ETF</option>
              <option value="stock" ${instrument.type === 'stock' ? 'selected' : ''}>Stock</option>
              <option value="crypto" ${instrument.type === 'crypto' ? 'selected' : ''}>Crypto</option>
              <option value="commodity" ${instrument.type === 'commodity' ? 'selected' : ''}>Commodity</option>
            </select>
          </td>
          <td data-label="${ctx.t('Divisa')}"><input class="instrument-input" data-field="currency" value="${ctx.escapeHtml(instrument.currency)}" /></td>
          <td data-label="${ctx.t('Color')}"><input class="instrument-input instrument-color" data-field="color" type="color" value="${ctx.escapeHtml(instrument.color)}" ${ctx.state.brandPaletteEnabled ? 'disabled' : ''} /></td>
          <td data-label="${ctx.t('instrument.actions')}"><button class="button button-compact btn-save" type="button" data-save-instrument="${ctx.escapeHtml(instrument.symbol)}">${ctx.t('instrument.save')}</button></td>
        </tr>`;
          })
          .join('')
      : `<tr><td colspan="${colCount}"><div class="empty-action-state"><span class="subtle">${ctx.t('instrument.empty')}</span><button class="button button-compact btn-save" type="button" data-open-onboarding>${ctx.t('instrument.create')}</button></div></td></tr>`;
  }

  function renderGroupRows() {
    ctx.state.visibleGroupIds = ctx.state.groups.map((group) => group.id);
    const visibleGroupIds = new Set(ctx.state.visibleGroupIds);
    ctx.state.selectedGroupIds = (ctx.state.selectedGroupIds || []).filter((id) => visibleGroupIds.has(id));
    const selectedGroups = new Set(ctx.state.selectedGroupIds || []);
    const selectedCount = selectedGroups.size;
    if (ctx.elements.groupSelectionCount) {
      ctx.elements.groupSelectionCount.textContent = ctx.tn('group.selection', selectedCount);
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
          <label class="row-select group-select"><input type="checkbox" data-select-group="${ctx.escapeHtml(group.id)}" ${selectedGroups.has(group.id) ? 'checked' : ''} aria-label="${ctx.escapeHtml(ctx.t('group.selectAria', { name: group.name }))}" /><span>${ctx.t('instrument.select')}</span></label>
          <input class="instrument-input group-name-input" data-group-field="name" value="${ctx.escapeHtml(group.name)}" aria-label="${ctx.t('group.nameAria')}" />
          <input class="instrument-input instrument-color" data-group-field="color" type="color" value="${ctx.escapeHtml(group.color)}" aria-label="${ctx.t('group.colorAria')}" ${ctx.state.brandPaletteEnabled ? 'disabled' : ''} />
          <details class="group-visual-options">
            <summary>${ctx.t('group.displayOptions')}</summary>
            <div class="group-card-options">
              <label class="switch-field"><input type="checkbox" data-group-field="showInDistribution" ${group.showInDistribution ? 'checked' : ''} /> ${ctx.t('group.showDashboard')}</label>
              <label class="switch-field"><input type="checkbox" data-group-field="showInMonthly" ${group.showInMonthly ? 'checked' : ''} /> ${ctx.t('group.showYtd')}</label>
              <label class="switch-field"><input type="checkbox" data-group-field="isExpandable" ${group.isExpandable ? 'checked' : ''} /> ${ctx.t('group.allowBreakdown')}</label>
            </div>
          </details>
          <button class="button button-compact btn-save" type="button" data-save-group="${ctx.escapeHtml(group.id)}">${ctx.t('instrument.save')}</button>
        </article>`,
          )
          .join('')
      : `<div class="empty-config-state">${ctx.t('group.empty')}</div>`;
  }

  function renderOperationsPreferenceControls() {
    const container = ctx.elements.operationsPreferenceControls;
    if (!container) return;

    const options = [
      'operations.metrics.marketValue.label',
      'operations.metrics.netContributed.label',
      'operations.metrics.totalGain.label',
      'operations.metrics.unrealizedGain.label',
      'operations.metrics.realizedGain.label',
      'operations.metrics.commissions.label',
    ];
    container.innerHTML = `
      <div class="pro-preference-group">
        ${options
          .map(
            (opt, i) => `
          <div class="pref-row">
            <span class="pref-label">${ctx.t('pro.preferences.position', { index: i + 1 })}</span>
            <select disabled>
              ${options.map((o) => `<option${o === opt ? ' selected' : ''}>${ctx.t(o)}</option>`).join('')}
            </select>
          </div>`,
          )
          .join('')}
      </div>`;
  }

  Object.assign(ctx, {
    renderPerformance,
    renderBackups,
    renderInstruments,
    renderGroupRows,
    renderOperationsPreferenceControls,
  });
}
