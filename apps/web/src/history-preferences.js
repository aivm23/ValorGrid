const DEFAULT_HISTORY_FILTERS = { mode: 'all', assetTypes: ['stock', 'etf', 'crypto'], transactionTypes: ['add', 'remove'] };

export function attach(ctx) {
  function renderHistoryPreferenceControls() {
    const container = ctx.elements.historyPreferenceControls;
    if (!container) return;

    const filters = ctx.state.historyEventFilters || DEFAULT_HISTORY_FILTERS;
    const isEditable = ctx.state.uiPreferencesEditable !== false;
    const mode = filters.mode || (isEditable ? 'all' : 'custom');
    const assetTypes = filters.assetTypes || ['stock', 'etf', 'crypto'];
    const transactionTypes = filters.transactionTypes || ['add', 'remove'];

    const disabledAttr = isEditable ? '' : 'disabled';

    const modeOptions = ['all', 'none', 'custom']
      .map((m) => {
        const labels = { all: 'Todos', none: 'Ocultos', custom: 'Personalizados' };
        return `<option value="${m}" ${m === mode ? 'selected' : ''}>${labels[m]}</option>`;
      })
      .join('');

    const assetTypeCheckboxes = ['stock', 'etf', 'crypto']
      .map((t) => {
        const labels = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto' };
        const checked = assetTypes.includes(t) ? 'checked' : '';
        return `<label class="history-filter-checkbox"><input type="checkbox" data-filter-asset="${t}" ${checked} ${disabledAttr} /> ${labels[t]}</label>`;
      })
      .join('');

    const transactionTypeCheckboxes = ['add', 'remove']
      .map((t) => {
        const labels = { add: 'Compras', remove: 'Ventas' };
        const checked = transactionTypes.includes(t) ? 'checked' : '';
        return `<label class="history-filter-checkbox"><input type="checkbox" data-filter-transaction="${t}" ${checked} ${disabledAttr} /> ${labels[t]}</label>`;
      })
      .join('');

    container.innerHTML = `
      <div class="pro-preference-group">
        <div class="admin-card-head">
          <h3>Historico</h3>
        </div>
        <div class="history-filter-main">
          <label class="field preference-field">
            <span>Marcadores de movimientos</span>
            <select id="history-event-mode" ${disabledAttr}>${modeOptions}</select>
          </label>
        </div>
        <div class="history-filter-grid" style="display: ${mode === 'custom' ? 'flex' : 'none'}">
          <div class="history-filter-group">
            <span class="history-filter-group-label">Instrumento</span>
            <div class="history-filter-checkboxes">${assetTypeCheckboxes}</div>
          </div>
          <div class="history-filter-group">
            <span class="history-filter-group-label">Operacion</span>
            <div class="history-filter-checkboxes">${transactionTypeCheckboxes}</div>
          </div>
        </div>
      </div>`;

    if (isEditable) {
      const modeSelect = container.querySelector('#history-event-mode');
      if (modeSelect) {
        modeSelect.addEventListener('change', (event) => handleHistoryEventModeChange(event));
      }
      container.querySelectorAll('[data-filter-asset]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => handleHistoryFilterChange());
      });
      container.querySelectorAll('[data-filter-transaction]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => handleHistoryFilterChange());
      });
    }
  }

  function handleHistoryEventModeChange(event) {
    const newMode = event.target.value;
    const currentFilters = { ...ctx.state.historyEventFilters, mode: newMode };
    ctx.state.historyEventFilters = currentFilters;
    const filterGrid = ctx.elements.historyPreferenceControls?.querySelector('.history-filter-grid');
    if (filterGrid) {
      filterGrid.style.display = newMode === 'custom' ? 'flex' : 'none';
    }
    ctx.renderHistory();
  }

  async function handleHistoryFilterChange() {
    const container = ctx.elements.historyPreferenceControls;
    if (!container) return;
    const checkedAssets = [...container.querySelectorAll('[data-filter-asset]:checked')].map((el) => el.dataset.filterAsset);
    const checkedTransactions = [...container.querySelectorAll('[data-filter-transaction]:checked')].map((el) => el.dataset.filterTransaction);
    const currentFilters = { ...ctx.state.historyEventFilters };
    currentFilters.mode = 'custom';
    currentFilters.assetTypes = checkedAssets;
    currentFilters.transactionTypes = checkedTransactions;
    ctx.state.historyEventFilters = currentFilters;
    try {
      await ctx.sendJson('/api/preferences/ui', 'PUT', { historyEventFilters: currentFilters });
      ctx.state.uiPreferencesEditable = true;
    } catch {
      ctx.renderHistoryPreferenceControls();
      return;
    }
    ctx.renderHistory();
  }

  ctx.renderHistoryPreferenceControls = renderHistoryPreferenceControls;
  ctx.handleHistoryEventModeChange = handleHistoryEventModeChange;
  ctx.handleHistoryFilterChange = handleHistoryFilterChange;
}
