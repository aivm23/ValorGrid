export function attach(ctx) {
  function renderHistoryPreferenceControls() {
    const container = ctx.elements.historyPreferenceControls;
    if (!container) return;

    container.innerHTML = `
      <div class="pro-preference-group">
        <div class="pref-section">
          <span class="pref-section-title">Marcadores de movimientos</span>
          <select disabled>
            <option>Personalizados</option>
            <option>Por defecto</option>
          </select>
        </div>
        <div class="pref-filters">
          <div class="pref-filter-group">
            <span class="pref-filter-label">Instrumento</span>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> Stock</label>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> ETF</label>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> Crypto</label>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> Commodity</label>
          </div>
          <div class="pref-filter-group">
            <span class="pref-filter-label">Operación</span>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> Compras</label>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> Ventas</label>
          </div>
        </div>
      </div>`;
  }

  ctx.renderHistoryPreferenceControls = renderHistoryPreferenceControls;

  ctx.syncProPreferencesPanel = function syncProPreferencesPanel() {
    const card = ctx.elements.proPreferencesCard;
    if (!card) return;
    const isPro = ctx.state.edition === 'professional';

    card.classList.toggle('is-pro-edition', isPro);
    card.classList.toggle('is-community-edition', !isPro);

    if (isPro) {
      card.open = true;
      card.dataset.fixed = 'true';
    } else {
      card.open = false;
      delete card.dataset.fixed;
    }
    ctx.initReturnBreakdownToggle?.();
  };
}
