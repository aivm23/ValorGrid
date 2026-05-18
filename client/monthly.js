export function attach(ctx) {
  function renderMonthly() {
    const { state, elements } = ctx;
    if (!state.monthly) return;
    const columns = state.monthly.columns || [];
    const completedRows = state.monthly.rows.filter((row) => row.total !== null && Number.isFinite(Number(row.total)));
    const latest = completedRows[completedRows.length - 1];
    const first = completedRows[0];
    const change = latest && first ? latest.total - first.total : null;

    elements.monthlySummary.innerHTML = latest
      ? `
        <article><span>Ultimo mes</span><strong>${latest.label}</strong><small>${ctx.formatCurrency(latest.total)}</small></article>
        <article><span>Variacion anual</span><strong>${ctx.formatCurrency(change)}</strong><small>${completedRows.length} meses cerrados</small></article>
        <article><span>Columnas activas</span><strong>${columns.length}</strong><small>grupos configurados</small></article>
      `
      : '<article><span>Seguimiento</span><strong>Pendiente</strong><small>Configura instrumentos para empezar</small></article>';

    elements.monthlyHead.innerHTML = `
      <tr>
        <th>Mes</th>
        ${columns.map((column) => `<th>${ctx.escapeHtml(column.label)}</th>`).join('')}
        <th>Total</th>
      </tr>
    `;

    elements.monthlyTracking.innerHTML = columns.length
      ? completedRows
          .map((row) => {
            const cells = columns.map((column) => renderValueCell(row.cells?.[column.id])).join('');
            return `
              <tr>
                <td>${row.label}</td>
                ${cells}
                <td><span class="cell-main">${ctx.formatCurrency(row.total)}</span></td>
              </tr>
            `;
          })
          .join('')
      : '<tr><td colspan="2"><div class="empty-action-state"><span class="subtle">Sin columnas mensuales. Crea grupos e instrumentos para empezar.</span><button class="button button-compact" type="button" data-open-onboarding>Crear cartera</button></div></td></tr>';
  }

  function renderValueCell(item) {
    if (!item) return '<td><span class="pending">Pendiente</span></td>';
    const detail = item.priceEur ? `${ctx.formatCurrency(item.priceEur)}` : `${(item.positions || []).length} posiciones`;
    return `
      <td>
        <span class="cell-main">${ctx.formatCurrency(item.value)}</span>
        <span class="cell-price">${detail}</span>
        <span class="cell-date">${ctx.formatDate(item.marketDate)}</span>
      </td>
    `;
  }

  Object.assign(ctx, { renderMonthly, renderValueCell });
}
