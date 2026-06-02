export function attach(ctx) {
  function renderPerformance() {
    const performance = ctx.state.summary?.performance;
    if (!performance) {
      ctx.elements.performanceSummary.innerHTML = '<article><span>Rentabilidad</span><strong>Pendiente</strong></article>';
      return;
    }
    const returnCopy = performance.netContributed > 0
      ? ctx.formatPercent(performance.simpleReturnPct)
      : 'sin base de aportación';
    const commissionCopy = performance.commissions > 0 && performance.transactionCount > 0
      ? `${(performance.commissions / performance.transactionCount).toFixed(2)} €/movimiento`
      : 'sin comisiones';
    ctx.elements.performanceSummary.innerHTML = `
      <article class="has-border-accent"><span>Valor mercado</span><strong>${ctx.formatCurrency(ctx.state.summary.total)}</strong><small class="metric-micro">a precios actuales</small></article>
      <article class="has-border-accent"><span>Aportado neto</span><strong class="${ctx.moneyClass(performance.netContributed)}">${ctx.formatCurrency(performance.netContributed)}</strong><small class="metric-micro">compras - ventas</small></article>
      <article class="${performance.totalGain >= 0 ? 'has-border-positive' : 'has-border-negative'}"><span>Resultado total</span><strong class="${ctx.moneyClass(performance.totalGain)}">${ctx.formatCurrency(performance.totalGain)}</strong><small>${returnCopy}</small></article>
      <article class="${performance.unrealizedGain >= 0 ? 'has-border-positive' : 'has-border-negative'}"><span>Plusvalía latente</span><strong class="${ctx.moneyClass(performance.unrealizedGain)}">${ctx.formatCurrency(performance.unrealizedGain)}</strong><small class="metric-micro">no realizada</small></article>
      <article class="${performance.realizedGain >= 0 ? 'has-border-positive' : 'has-border-negative'}"><span>Plusvalía realizada</span><strong class="${ctx.moneyClass(performance.realizedGain)}">${ctx.formatCurrency(performance.realizedGain)}</strong><small>ventas FIFO</small></article>
      <article class="has-border-amber"><span>Comisiones</span><strong>${ctx.formatCurrency(performance.commissions)}</strong><small class="metric-micro">${commissionCopy}</small></article>
    `;
  }

  function renderBackups() {
    if (!ctx.state.backups.length) {
      ctx.elements.backupList.innerHTML = '<span>No hay backups todavía.</span>';
      return;
    }
    ctx.elements.backupList.innerHTML = ctx.state.backups
      .slice(0, 5)
      .map(
        (backup) =>
          `<a href="/api/backups/${encodeURIComponent(backup.file)}">${ctx.escapeHtml(backup.file)}</a><span>${ctx.formatFileSize(backup.size)}</span>`,
      )
      .join('');
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
          <td data-label="Ticker"><label class="row-select"><input type="checkbox" data-select-instrument="${ctx.escapeHtml(instrument.symbol)}" ${selectedInstruments.has(instrument.symbol) ? 'checked' : ''} aria-label="Seleccionar ${ctx.escapeHtml(instrument.symbol)}" /><strong>${ctx.escapeHtml(instrument.symbol)}</strong></label></td>
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
          <td data-label="Acciones"><button class="button button-compact" type="button" data-save-instrument="${ctx.escapeHtml(instrument.symbol)}">Guardar</button></td>
        </tr>`,
          )
          .join('')
      : '<tr><td colspan="8"><div class="empty-action-state"><span class="subtle">Sin valores para este filtro.</span><button class="button button-compact" type="button" data-open-onboarding>Crear valor</button></div></td></tr>';
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
          <button class="button button-compact" type="button" data-save-group="${ctx.escapeHtml(group.id)}">Guardar</button>
        </article>`,
          )
          .join('')
      : '<div class="empty-config-state">Sin grupos. Crea uno para clasificar valores.</div>';
  }

  Object.assign(ctx, { renderPerformance, renderBackups, renderInstruments, renderGroupRows });
}
