export function attach(ctx) {
  function renderReturnBreakdownPreferenceControls() {
    const container = ctx.elements.returnBreakdownPreferenceControls;
    if (!container) return;

    container.innerHTML = `
      <div class="pro-preference-group">
        <div class="admin-card-head">
          <h3>Rentabilidad avanzada</h3>
        </div>
        <p class="subtle">Community mantiene el resumen global. Professional Edition permite analizar rentabilidad por instrumento y por grupo.</p>
      </div>`;
  }

  Object.assign(ctx, { renderReturnBreakdownPreferenceControls });
}
