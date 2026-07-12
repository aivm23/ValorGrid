export function attach(ctx) {
  function renderHistoryPreferenceControls() {
    const container = ctx.elements.historyPreferenceControls;
    if (!container) return;

    container.innerHTML = `
      <div class="pro-preference-group">
        <div class="pref-section">
          <span class="pref-section-title">${ctx.t('pro.history.markers')}</span>
          <select disabled>
            <option>${ctx.t('pro.history.mode.custom')}</option>
            <option>${ctx.t('pro.history.mode.default')}</option>
          </select>
        </div>
        <div class="pref-filters">
          <div class="pref-filter-group">
            <span class="pref-filter-label">${ctx.t('pro.history.group.instrument')}</span>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> Stock</label>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> ETF</label>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> Crypto</label>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> Commodity</label>
          </div>
          <div class="pref-filter-group">
            <span class="pref-filter-label">${ctx.t('pro.history.group.operation')}</span>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> ${ctx.t('Compras')}</label>
            <label class="checkbox-label"><input type="checkbox" disabled checked /> ${ctx.t('Ventas')}</label>
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

    const proRequestCard = ctx.document.querySelector('.admin-card--pro-request');
    if (proRequestCard) proRequestCard.hidden = isPro;

    ctx.initReturnBreakdownToggle?.();
  };
}
