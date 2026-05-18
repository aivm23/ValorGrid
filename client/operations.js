export function attach(ctx) {
  function renderPerformance() {
    const performance = ctx.state.summary?.performance;
    if (!performance) {
      ctx.elements.performanceSummary.innerHTML = '<article><span>Rentabilidad</span><strong>Pendiente</strong></article>';
      return;
    }
    ctx.elements.performanceSummary.innerHTML = `
      <article><span>Valor mercado</span><strong>${ctx.formatCurrency(ctx.state.summary.total)}</strong><small>valor actual estimado</small></article>
      <article><span>Aportado neto</span><strong>${ctx.formatCurrency(performance.netContributed)}</strong><small>compras + comisiones - ventas</small></article>
      <article><span>Resultado total</span><strong>${ctx.formatCurrency(performance.totalGain)}</strong><small>${ctx.formatPercent(performance.simpleReturnPct)}</small></article>
      <article><span>Plusvalia latente</span><strong>${ctx.formatCurrency(performance.unrealizedGain)}</strong><small>valor no realizado</small></article>
      <article><span>Plusvalia realizada</span><strong>${ctx.formatCurrency(performance.realizedGain)}</strong><small>FIFO estimado</small></article>
      <article><span>Comisiones</span><strong>${ctx.formatCurrency(performance.commissions)}</strong><small>${performance.transactionCount} movimientos</small></article>
    `;
  }

  function renderBackups() {
    if (!ctx.state.backups.length) {
      ctx.elements.backupList.innerHTML = '<span>No hay backups todavia.</span>';
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

  function renderInstruments() {
    renderGroupRows();
    ctx.elements.newInstrumentGroup.innerHTML = groupOptions(ctx.state.groups[0]?.id);
    const instruments = ctx.state.instruments.filter((instrument) => instrument.type !== 'fx');
    ctx.elements.instrumentRows.innerHTML = instruments.length
      ? instruments
          .map(
            (instrument) => `
        <tr data-instrument="${ctx.escapeHtml(instrument.symbol)}">
          <td data-label="Ticker"><strong>${ctx.escapeHtml(instrument.symbol)}</strong></td>
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
      : '<tr><td colspan="8"><div class="empty-action-state"><span class="subtle">Sin instrumentos. Crea el primero para empezar.</span><button class="button button-compact" type="button" data-open-onboarding>Crear instrumento</button></div></td></tr>';
  }

  function renderGroupRows() {
    ctx.elements.groupRows.innerHTML = ctx.state.groups.length
      ? ctx.state.groups
          .map(
            (group) => `
        <article class="group-card" data-group="${ctx.escapeHtml(group.id)}">
          <input class="instrument-input group-name-input" data-group-field="name" value="${ctx.escapeHtml(group.name)}" aria-label="Nombre del grupo" />
          <input class="instrument-input instrument-color" data-group-field="color" type="color" value="${ctx.escapeHtml(group.color)}" aria-label="Color del grupo" />
          <div class="group-card-options">
            <label class="switch-field"><input type="checkbox" data-group-field="showInDistribution" ${group.showInDistribution ? 'checked' : ''} /> Distribucion</label>
            <label class="switch-field"><input type="checkbox" data-group-field="showInMonthly" ${group.showInMonthly ? 'checked' : ''} /> Mensual</label>
            <label class="switch-field"><input type="checkbox" data-group-field="isExpandable" ${group.isExpandable ? 'checked' : ''} /> Desglose</label>
          </div>
          <button class="button button-compact" type="button" data-save-group="${ctx.escapeHtml(group.id)}">Guardar</button>
        </article>`,
          )
          .join('')
      : '<div class="empty-config-state">Sin grupos. Crea uno para clasificar instrumentos.</div>';
  }

  Object.assign(ctx, { renderPerformance, renderBackups, renderInstruments, renderGroupRows });
}
