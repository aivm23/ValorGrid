export function renderConfirmStep(ctx, preview) {
  const impact = preview.impactPreview || { instruments: [] };
  const canCommit = preview.canCommit;
  // hasNewRows unused — automatic backup notices disabled
  // const hasNewRows = (preview.summary || {}).buys > 0 || (preview.summary || {}).sells > 0;
  const fatalRows = (preview.rows || []).filter((row) => ['error', 'blocked', 'needs_mapping'].includes(row.status));
  const selectedRows = (preview.rows || []).filter((row) => row.status === 'valid');
  const ignoredRows = (preview.rows || []).filter((row) => row.status === 'ignored' || row.status === 'duplicate' || row.status === 'skipped');

  return `
    <div class="import-confirm-hero">
      <div>
        <span>Listo para guardar</span>
        <strong>${selectedRows.length} operaciones seleccionadas</strong>
        <p>${impact.instrumentCount || 0} instrumentos afectados · ${ignoredRows.length} filas omitidas o ya existentes</p>
      </div>
      <div class="import-confirm-total">
        <span>Cash-flow neto</span>
        <strong>${ctx.formatCurrency(impact.totalCashFlowEur || 0)}</strong>
      </div>
    </div>
    <div class="import-confirm-grid">
      <article class="metric-card"><span>Compras</span><strong>${impact.buyCount || 0}</strong></article>
      <article class="metric-card"><span>Ventas</span><strong>${impact.sellCount || 0}</strong></article>
      <article class="metric-card"><span>Valor bruto</span><strong>${ctx.formatCurrency(impact.totalValueEur || 0)}</strong></article>
      <article class="metric-card"><span>Comisiones</span><strong>${ctx.formatCurrency(impact.totalCommissionEur || 0)}</strong></article>
    </div>
    ${!canCommit && fatalRows.length ? `<div class="import-warning-banner"><div>No se puede importar: hay ${fatalRows.length} filas pendientes (${fatalRows.some((r) => r.status === 'needs_mapping') ? 'instrumentos sin asignar' : 'con errores'}). Resuélvelas en los pasos anteriores.</div></div>` : ''}
    <div class="import-impact-list">
      ${(impact.instruments || [])
        .map((item) => {
          const liquidated = Math.abs(item.afterShares || 0) < 0.000001 && (item.beforeShares || 0) > 0;
          return `
            <article class="import-impact-card">
              <div>
                <strong>${ctx.escapeHtml(item.symbol)}</strong>
                <small>${item.buys || 0} compras · ${item.sells || 0} ventas</small>
              </div>
              <div class="import-impact-shares">
                <b>Acciones</b>
                <span><small>Antes</small>${ctx.formatShareNumber(item.beforeShares || 0)}</span>
                <span><small>Cambio</small>${ctx.formatShareNumber(item.deltaShares || 0)}</span>
                <span><small>Después</small>${ctx.formatShareNumber(item.afterShares || 0)}</span>
              </div>
              ${liquidated ? '<small class="import-warning-text">Posición liquidada en la importación</small>' : ''}
            </article>`;
        })
        .join('') || '<div class="subtle">No hay operaciones seleccionadas para importar.</div>'}
    </div>`;
}
