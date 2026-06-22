export function attach(ctx) {
  function renderHistoryPreferenceControls() {
    const container = ctx.elements.historyPreferenceControls;
    if (!container) return;

    container.innerHTML = `
      <div class="pro-preference-group">
        <div class="admin-card-head">
          <h3>Histórico</h3>
        </div>
        <p class="subtle">Community muestra todos los marcadores de movimientos. Professional Edition permite ocultarlos o filtrarlos por instrumento y operación.</p>
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
