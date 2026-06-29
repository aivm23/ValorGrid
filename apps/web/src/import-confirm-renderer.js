export function renderConfirmStep(ctx, preview) {
  const impact = preview.impactPreview || { instruments: [] };
  const canCommit = preview.canCommit;
  const fatalRows = (preview.rows || []).filter((row) => ['error', 'blocked', 'needs_mapping'].includes(row.status));
  const selectedRows = (preview.rows || []).filter((row) => row.status === 'valid');
  const ignoredRows = (preview.rows || []).filter((row) => row.status === 'ignored' || row.status === 'duplicate' || row.status === 'skipped');

  return `
    <div class="import-confirm-hero">
      <div>
        <span>${ctx.t('import.confirm.ready')}</span>
        <strong>${ctx.t('import.confirm.selectedOperations', { count: selectedRows.length })}</strong>
        <p>${ctx.t('import.confirm.impactSummary', {
          instruments: impact.instrumentCount || 0,
          ignored: ignoredRows.length,
        })}</p>
      </div>
      <div class="import-confirm-total">
        <span>${ctx.t('import.confirm.netCashFlow')}</span>
        <strong>${ctx.formatCurrency(impact.totalCashFlowEur || 0)}</strong>
      </div>
    </div>
    <div class="import-confirm-grid">
      <article class="metric-card"><span>${ctx.t('import.confirm.buys')}</span><strong>${impact.buyCount || 0}</strong></article>
      <article class="metric-card"><span>${ctx.t('import.confirm.sells')}</span><strong>${impact.sellCount || 0}</strong></article>
      <article class="metric-card"><span>${ctx.t('import.confirm.grossValue')}</span><strong>${ctx.formatCurrency(impact.totalValueEur || 0)}</strong></article>
      <article class="metric-card"><span>${ctx.t('import.confirm.fees')}</span><strong>${ctx.formatCurrency(impact.totalCommissionEur || 0)}</strong></article>
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
                <small>${item.buys || 0} ${ctx.t('import.confirm.buys').toLowerCase()} · ${item.sells || 0} ${ctx.t('import.confirm.sells').toLowerCase()}</small>
              </div>
              <div class="import-impact-shares">
                <b>${ctx.t('import.confirm.quantity')}</b>
                <span><small>${ctx.t('import.confirm.before')}</small>${ctx.formatShareNumber(item.beforeShares || 0)}</span>
                <span><small>${ctx.t('import.confirm.change')}</small>${ctx.formatShareNumber(item.deltaShares || 0)}</span>
                <span><small>${ctx.t('import.confirm.after')}</small>${ctx.formatShareNumber(item.afterShares || 0)}</span>
              </div>
              ${liquidated ? `<small class="import-warning-text">${ctx.t('import.confirm.liquidated')}</small>` : ''}
            </article>`;
        })
        .join('') || `<div class="subtle">${ctx.t('import.confirm.noOperations')}</div>`}
    </div>`;
}
