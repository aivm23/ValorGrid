export function attach(ctx) {
  function accounts() {
    return ctx.state.liquidity?.accounts || [];
  }

  function setLiquidityFeedback(message = '', tone = 'info') {
    if (!ctx.elements.liquidityFeedback) return;
    ctx.elements.liquidityFeedback.textContent = message;
    ctx.elements.liquidityFeedback.dataset.state = tone === 'error' ? 'error' : tone === 'success' ? 'ok' : 'info';
    ctx.elements.liquidityFeedback.hidden = !message;
  }

  function renderLiquidity() {
    if (!ctx.elements.liquidityAccounts) return;
    const list = accounts();
    const visibleSymbols = new Set(list.map((account) => account.symbol));
    ctx.state.selectedLiquiditySymbols = (ctx.state.selectedLiquiditySymbols || []).filter((symbol) =>
      visibleSymbols.has(symbol),
    );
    const total = ctx.state.liquidity?.totalEur || 0;
    if (ctx.elements.liquiditySummary) {
      ctx.elements.liquiditySummary.innerHTML = `
        <span>${list.length} cuenta${list.length === 1 ? '' : 's'}</span>
        <strong>${ctx.formatCurrency(total)}</strong>`;
    }
    ctx.elements.liquidityAccounts.innerHTML = list.length
      ? renderLiquidityTable(list)
      : `<div class="empty-config-state">No hay liquidez registrada.</div>`;
  }

  function renderLiquidityTable(list) {
    const selected = new Set(ctx.state.selectedLiquiditySymbols || []);
    const selectedCount = selected.size;
    const allSelected = list.length > 0 && selectedCount === list.length;
    return `
      <div class="bulk-toolbar liquidity-bulk-toolbar">
        <span class="subtle">${selectedCount} cuenta${selectedCount === 1 ? '' : 's'} seleccionada${selectedCount === 1 ? '' : 's'}</span>
        <button class="button button-compact" type="button" data-select-visible-liquidity ${selectedCount === 0 || allSelected ? 'hidden' : ''}>Seleccionar visibles</button>
        <button class="button button-compact" type="button" data-deselect-all-liquidity ${selectedCount === 0 ? 'hidden' : ''}>Deseleccionar todos</button>
        <button class="button icon-bulk-delete" type="button" data-delete-selected-liquidity ${selectedCount === 0 ? 'hidden' : ''}>
          <svg class="toolbar-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 7h16"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M6 7l1 14h10l1-14"></path>
            <path d="M9 7V4h6v3"></path>
          </svg>
          <span>Eliminar</span>
        </button>
      </div>
      <div class="table-wrap compact-table liquidity-table-wrap">
        <table class="instrument-table liquidity-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cuenta</th>
              <th>Saldo</th>
              <th>Divisa</th>
              <th>Valor actual</th>
              <th>Mostrar</th>
              <th>Color</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(renderLiquidityAccount).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderLiquidityAccount(account) {
    const selected = new Set(ctx.state.selectedLiquiditySymbols || []);
    return `
      <tr data-liquidity-symbol="${ctx.escapeHtml(account.symbol)}">
        <td data-label="ID">
          <label class="row-select">
            <input type="checkbox" data-select-liquidity="${ctx.escapeHtml(account.symbol)}" ${selected.has(account.symbol) ? 'checked' : ''} aria-label="Seleccionar ${ctx.escapeHtml(account.symbol)}" />
            <strong class="instrument-symbol-label" title="${ctx.escapeHtml(account.symbol)}">${ctx.escapeHtml(account.symbol)}</strong>
          </label>
        </td>
        <td data-label="Cuenta">
          <input class="instrument-input" data-liquidity-field="name" value="${ctx.escapeHtml(account.name)}" aria-label="Nombre de liquidez" />
        </td>
        <td data-label="Saldo">
          <input class="instrument-input liquidity-balance-input" data-liquidity-field="cashBalance" type="number" min="0" step="0.01" value="${ctx.escapeHtml(account.cashBalance)}" aria-label="Saldo actual" />
        </td>
        <td data-label="Divisa">
          <input class="instrument-input liquidity-currency-input" data-liquidity-field="currency" value="${ctx.escapeHtml(account.currency)}" aria-label="Divisa" />
        </td>
        <td data-label="Valor actual">
          <span class="liquidity-value"><strong>${ctx.formatCurrency(account.valueEur || 0)}</strong></span>
        </td>
        <td data-label="Mostrar">
          <label class="row-select row-select-only">
            <input type="checkbox" data-liquidity-field="showInDistribution" ${account.showInDistribution ? 'checked' : ''} aria-label="Mostrar ${ctx.escapeHtml(account.name)} en dashboard" />
          </label>
        </td>
        <td data-label="Color">
          <input class="instrument-input instrument-color" data-liquidity-field="color" type="color" value="${ctx.escapeHtml(account.color)}" aria-label="Color de liquidez" />
        </td>
        <td data-label="Acciones">
          <div class="liquidity-row-actions">
            <button class="button button-compact btn-save" type="button" data-save-liquidity="${ctx.escapeHtml(account.symbol)}">Guardar</button>
          </div>
        </td>
      </tr>`;
  }

  function updateLiquiditySelection(event) {
    const checkbox = event.target.closest('[data-select-liquidity]');
    if (!checkbox) return;
    const selected = new Set(ctx.state.selectedLiquiditySymbols || []);
    if (checkbox.checked) selected.add(checkbox.dataset.selectLiquidity);
    else selected.delete(checkbox.dataset.selectLiquidity);
    ctx.state.selectedLiquiditySymbols = [...selected];
    renderLiquidity();
  }

  function selectVisibleLiquidity() {
    ctx.state.selectedLiquiditySymbols = [
      ...new Set([...(ctx.state.selectedLiquiditySymbols || []), ...accounts().map((account) => account.symbol)]),
    ];
    renderLiquidity();
  }

  function deselectAllLiquidity() {
    ctx.state.selectedLiquiditySymbols = [];
    renderLiquidity();
  }

  function liquidityPayloadFromRow(row) {
    return {
      name: row.querySelector('[data-liquidity-field="name"]')?.value,
      cashBalance: Number(row.querySelector('[data-liquidity-field="cashBalance"]')?.value || 0),
      currency: row.querySelector('[data-liquidity-field="currency"]')?.value,
      color: row.querySelector('[data-liquidity-field="color"]')?.value,
      showInDistribution: row.querySelector('[data-liquidity-field="showInDistribution"]')?.checked,
    };
  }

  async function createLiquidityAccount() {
    setLiquidityFeedback('');
    const body = {
      name: ctx.elements.newLiquidityName?.value,
      cashBalance: Number(ctx.elements.newLiquidityBalance?.value || 0),
      currency: ctx.elements.newLiquidityCurrency?.value || 'EUR',
      color: ctx.elements.newLiquidityColor?.value || '#06b6d4',
    };
    try {
      const result = await ctx.api.liquidity.create(body);
      ctx.state.liquidity = result.state || ctx.state.liquidity;
      if (ctx.elements.newLiquidityName) ctx.elements.newLiquidityName.value = '';
      if (ctx.elements.newLiquidityBalance) ctx.elements.newLiquidityBalance.value = '';
      setLiquidityFeedback('Liquidez creada.', 'success');
      await ctx.refreshDashboard();
    } catch (error) {
      setLiquidityFeedback(ctx.normalizeErrorMessage(error), 'error');
    }
  }

  async function saveLiquidityAccount(symbol) {
    const row = [...(ctx.elements.liquidityAccounts?.querySelectorAll('[data-liquidity-symbol]') || [])].find(
      (item) => item.dataset.liquiditySymbol === symbol,
    );
    if (!row) return;
    try {
      const result = await ctx.api.liquidity.update(symbol, liquidityPayloadFromRow(row));
      ctx.state.liquidity = result.state || ctx.state.liquidity;
      setLiquidityFeedback('Liquidez actualizada.', 'success');
      await ctx.refreshDashboard();
    } catch (error) {
      setLiquidityFeedback(ctx.normalizeErrorMessage(error), 'error');
    }
  }

  async function deleteSelectedLiquidityAccounts() {
    const symbols = ctx.state.selectedLiquiditySymbols || [];
    if (!symbols.length) return;
    const confirmed = await ctx.confirmAction({
      title: ctx.t('liquidity.delete.title'),
      message: ctx.tn('liquidity.delete.confirm', symbols.length),
      confirmLabel: ctx.t('liquidity.delete.action'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      let nextState = ctx.state.liquidity;
      for (const symbol of symbols) {
        const result = await ctx.api.liquidity.remove(symbol);
        nextState = result.state || nextState;
      }
      ctx.state.liquidity = nextState;
      ctx.state.selectedLiquiditySymbols = [];
      setLiquidityFeedback('Liquidez eliminada.', 'success');
      await ctx.refreshDashboard();
    } catch (error) {
      setLiquidityFeedback(ctx.normalizeErrorMessage(error), 'error');
    }
  }

  ctx.elements.createLiquidityAccount?.addEventListener('click', createLiquidityAccount);
  ctx.elements.liquidityAccounts?.addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-save-liquidity]');
    const selectVisibleButton = event.target.closest('[data-select-visible-liquidity]');
    const deselectAllButton = event.target.closest('[data-deselect-all-liquidity]');
    const deleteSelectedButton = event.target.closest('[data-delete-selected-liquidity]');
    if (saveButton) saveLiquidityAccount(saveButton.dataset.saveLiquidity);
    if (selectVisibleButton) selectVisibleLiquidity();
    if (deselectAllButton) deselectAllLiquidity();
    if (deleteSelectedButton) deleteSelectedLiquidityAccounts();
  });
  ctx.elements.liquidityAccounts?.addEventListener('change', updateLiquiditySelection);

  Object.assign(ctx, {
    renderLiquidity,
    createLiquidityAccount,
    saveLiquidityAccount,
    selectVisibleLiquidity,
    deselectAllLiquidity,
    deleteSelectedLiquidityAccounts,
  });
}
