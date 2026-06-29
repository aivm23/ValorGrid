export function attach(ctx) {
  function renderReturnBreakdownPreferenceControls() {
    const container = ctx.elements.returnBreakdownPreferenceControls;
    if (!container) return;

    container.innerHTML = `
      <div class="pro-preference-group">
        <label class="checkbox-label"><input type="checkbox" disabled checked /> ${ctx.t('pro.returnBreakdown.visible')}</label>
        <div class="pref-section">
          <span class="pref-section-title">${ctx.t('pro.returnBreakdown.initialView')}</span>
          <select disabled>
            <option>${ctx.t('pro.returnBreakdown.scope.group')}</option>
            <option>${ctx.t('pro.returnBreakdown.scope.instrument')}</option>
          </select>
        </div>
        <div class="pref-section">
          <span class="pref-section-title">${ctx.t('pro.returnBreakdown.sort.label')}</span>
          <select disabled>
            <option selected>${ctx.t('pro.returnBreakdown.sort.totalGain')}</option>
            <option>${ctx.t('pro.returnBreakdown.sort.contributed')}</option>
            <option>${ctx.t('pro.returnBreakdown.sort.unrealizedGain')}</option>
          </select>
        </div>
        <label class="checkbox-label"><input type="checkbox" disabled checked /> ${ctx.t('pro.returnBreakdown.includeClosed')}</label>
      </div>`;
  }

  Object.assign(ctx, { renderReturnBreakdownPreferenceControls });
}
