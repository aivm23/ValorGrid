export function attach(ctx) {
  function renderReturnBreakdownPreferenceControls() {
    const container = ctx.elements.returnBreakdownPreferenceControls;
    if (!container) return;

    container.innerHTML = `
      <div class="pro-preference-group">
        <label class="checkbox-label"><input type="checkbox" disabled checked /> Mostrar Rentabilidad avanzada</label>
        <div class="pref-section">
          <span class="pref-section-title">Vista inicial</span>
          <select disabled>
            <option>Grupos</option>
            <option>Instrumentos</option>
          </select>
        </div>
        <div class="pref-section">
          <span class="pref-section-title">Ordenar por</span>
          <select disabled>
            <option selected>Resultado total</option>
            <option>Aportado</option>
            <option>Plusvalía</option>
          </select>
        </div>
        <label class="checkbox-label"><input type="checkbox" disabled checked /> Incluir posiciones cerradas</label>
      </div>`;
  }

  Object.assign(ctx, { renderReturnBreakdownPreferenceControls });
}
