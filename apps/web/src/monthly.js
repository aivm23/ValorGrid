export function attach(ctx) {
  function renderMonthly() {
    const { state, elements } = ctx;
    if (!state.monthly) return;

    const months = state.monthly.months || buildLegacyMonths(state.monthly);
    const completedMonths = months.filter((month) => month.total !== null && Number.isFinite(Number(month.total)));
    const visibleMonths = completedMonths.filter(monthHasActivity);
    const displayMonths = visibleMonths.length ? visibleMonths : completedMonths.slice(-1);
    const omittedZeroMonths = completedMonths.length - displayMonths.length;
    const summary = state.monthly.summary || buildLegacySummary(state.monthly, completedMonths);

    elements.monthlySummary.innerHTML = renderYtdSummary(summary);

    const monthCount = displayMonths.length;
    if (elements.ytdSubtitle) {
      elements.ytdSubtitle.textContent = monthCount > 0
        ? `Evolución del año en curso, flujos y desglose mensual por grupos. ${monthCount} de 12 meses con datos.`
        : 'A la espera del primer movimiento del año.';
    }

    if (!displayMonths.length) {
      elements.monthlyTracking.innerHTML = `
        <div class="empty-action-state ytd-empty">
          <span class="subtle">Sin movimientos ni valoraciones para el año en curso.</span>
          <button class="button button-compact btn-save" type="button" data-open-onboarding>Crear cartera</button>
        </div>
      `;
      return;
    }

    const latestMonth = displayMonths[displayMonths.length - 1]?.month;
    const zeroNotice = omittedZeroMonths > 0 ? renderYtdZeroNotice(omittedZeroMonths) : '';
    elements.monthlyTracking.innerHTML = zeroNotice + displayMonths
      .map((month) => renderMonthCard(month, month.month === latestMonth))
      .join('');
  }

  function monthHasActivity(month) {
    return (
      Number(month.total || 0) > 0 ||
      Number(month.contributions || 0) > 0 ||
      Number(month.withdrawals || 0) > 0 ||
      Number(month.dividends || 0) > 0 ||
      (month.groups || []).some((group) => Number(group.value || 0) > 0)
    );
  }

  function renderYtdZeroNotice(count) {
    return `
      <div class="ytd-zero-notice">
        <strong>${count} ${count === 1 ? 'mes anterior está' : 'meses anteriores están'} a cero</strong>
        <span>No se muestran para mantener la revisión centrada en los meses con cartera o movimientos.</span>
      </div>`;
  }

  function renderYtdSummary(summary) {
    const currentValue = Number(summary.currentValue || 0);
    const valueStart = Number(summary.valueStart || 0);
    const ytdPct = valueStart > 0 ? ((currentValue - valueStart) / valueStart * 100).toFixed(1) : '0.0';
    return `
      <article class="has-border-accent"><span>Valor inicial</span><strong>${ctx.formatCurrency(valueStart)}</strong><small class="metric-micro">inicio del año</small></article>
      <article class="has-border-accent"><span>Aportado neto</span><strong class="${ctx.moneyClass(Number(summary.netContributed || 0))}">${ctx.formatCurrency(Number(summary.netContributed || 0))}</strong><small class="metric-micro">${Number(summary.completedMonths || 0)} meses</small></article>
      <article class="has-border-accent"><span>Valor actual</span><strong>${ctx.formatCurrency(currentValue)}</strong><small class="metric-micro">${ytdPct}% YTD</small></article>
      <article class="has-border-positive"><span>Aportaciones</span><strong>${ctx.formatCurrency(Number(summary.contributions || 0))}</strong><small class="metric-micro">compras del año</small></article>
      <article class="has-border-negative"><span>Retiradas</span><strong class="${ctx.moneyClass(Number(summary.withdrawals || 0))}">${ctx.formatCurrency(Number(summary.withdrawals || 0))}</strong><small class="metric-micro">ventas del año</small></article>
      <article class="has-border-accent"><span>Dividendos</span><strong>${ctx.formatCurrency(Number(summary.dividends || 0))}</strong><small class="metric-micro">${Number(summary.dividendCount || 0)} cobrados</small></article>
      <article class="${Number(summary.resultYtd || 0) >= 0 ? 'has-border-positive' : 'has-border-negative'}"><span>Resultado YTD</span><strong class="${ctx.moneyClass(Number(summary.resultYtd || 0))}">${ctx.formatCurrency(Number(summary.resultYtd || 0))}</strong><small>${Number(summary.completedMonths || 0)} meses visibles</small></article>
    `;
  }

  function renderMonthCard(month, isOpen) {
    const groupsEnabled = ctx.state.groupsEnabled !== false;
    const variation =
      month.variation !== null && month.variation !== undefined && Number.isFinite(Number(month.variation))
        ? Number(month.variation)
        : null;
    const variationClass = variation === null ? '' : variation >= 0 ? 'is-positive' : 'is-negative';
    const topGroup = groupsEnabled && month.topGroup
      ? `<span class="ytd-driver-dot" style="--driver-color:${ctx.escapeHtml(month.topGroup.color || '#64748b')}"></span>${ctx.escapeHtml(month.topGroup.label)} ${ctx.formatCurrency(Number(month.topGroup.variation || 0))}`
      : groupsEnabled ? 'Sin grupo dominante' : 'Sin desglose por grupo';

    return `
      <details class="ytd-month-card" ${isOpen ? 'open' : ''}>
        <summary>
          <span class="ytd-month-title">${ctx.escapeHtml(month.label)}</span>
          <span><small>Valor final</small><strong>${ctx.formatCurrency(Number(month.total || 0))}</strong></span>
          <span><small>Aportaciones</small><strong>${ctx.formatCurrency(Number(month.contributions || 0))}</strong></span>
          <span><small>Retiradas</small><strong class="${ctx.moneyClass(Number(month.withdrawals || 0))}">${ctx.formatCurrency(Number(month.withdrawals || 0))}</strong></span>
          <span><small>Dividendos</small><strong>${ctx.formatCurrency(Number(month.dividends || 0))}</strong></span>
          <span><small>Variación</small><strong class="${variationClass}">${variation === null ? 'Inicio' : ctx.formatCurrency(variation)}</strong></span>
          <span><small>Automáticas</small><strong>${ctx.escapeHtml(month.autoStatus || 'Sin automáticas')}</strong></span>
        </summary>
        <div class="ytd-month-body">
          <div class="ytd-month-meta">
            <span>Fecha de valoración: ${ctx.formatDate(month.asOfDate)}</span>
            <span>Motor principal: ${topGroup}</span>
            <span>Comisiones: ${ctx.formatCurrencySpan(Number(month.commissions || 0))}</span>
          </div>
          ${renderGroupBreakdown(month.groups || [], groupsEnabled)}
        </div>
      </details>
    `;
  }

  function renderGroupBreakdown(groups, groupsEnabled) {
    if (!groups.length) return `<p class="subtle">${groupsEnabled ? 'Sin grupos' : 'Sin instrumentos'} con valor en este mes.</p>`;
    return `
      <div class="ytd-group-list">
        ${groups.map((group) => renderGroupRow(group)).join('')}
      </div>
    `;
  }

  function renderGroupRow(group) {
    const positions = (group.positions || [])
      .filter((position) => Number(position.value || 0) > 0 && Math.abs(Number(position.shares || 0)) > 0.0000001)
      .map(
        (position) => `
          <li>
            <span>${ctx.escapeHtml(position.name || position.symbol)}</span>
            <small>${ctx.escapeHtml(position.symbol)} · ${ctx.formatInstrumentQuantity(position.shares, position)} · ${ctx.formatCurrency(Number(position.priceEur || 0))}</small>
          </li>
        `,
      )
      .join('');

    return `
      <article class="ytd-group-row">
        <div>
          <span class="ytd-group-name"><i style="--group-color:${ctx.escapeHtml(group.color || '#64748b')}"></i>${ctx.escapeHtml(group.label)}</span>
          <small>${Number(group.pct || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })}% del mes</small>
        </div>
        <div><small>Valor</small><strong>${ctx.formatCurrency(Number(group.value || 0))}</strong></div>
        <div><small>Aportado</small><strong class="${ctx.moneyClass(Number(group.contributions || 0))}">${ctx.formatCurrency(Number(group.contributions || 0))}</strong></div>
        <div><small>Dividendos</small><strong>${ctx.formatCurrency(Number(group.dividends || 0))}</strong></div>
        <div><small>Neto</small><strong class="${ctx.moneyClass(Number(group.netContribution || 0))}">${ctx.formatCurrency(Number(group.netContribution || 0))}</strong></div>
        <ul>${positions || '<li><span>Sin posiciones con valor</span></li>'}</ul>
      </article>
    `;
  }

  function buildLegacyMonths(monthly) {
    const columns = monthly.columns || [];
    return (monthly.rows || [])
      .filter((row) => row.total !== null && Number.isFinite(Number(row.total)))
      .map((row, index, rows) => {
        const groups = columns
          .map((column) => {
            const cell = row.cells?.[column.id];
            if (!cell || cell.empty || Number(cell.value || 0) <= 0) return null;
            return {
              id: column.id,
              label: column.label,
              color: column.color,
              value: Number(cell.value || 0),
              pct: row.total > 0 ? (Number(cell.value || 0) / row.total) * 100 : 0,
              contributions: 0,
              withdrawals: 0,
              dividends: 0,
              dividendCount: 0,
              commissions: 0,
              netContribution: 0,
              positions: cell.positions || [],
            };
          })
          .filter(Boolean);
        return {
          month: row.month,
          label: row.label,
          asOfDate: firstGroupDate(row, columns),
          total: row.total,
          contributions: 0,
          withdrawals: 0,
          dividends: 0,
          dividendCount: 0,
          commissions: 0,
          netContribution: 0,
          variation: index === 0 ? null : row.total - rows[index - 1].total,
          topGroup: groups[0] || null,
          autoStatus: 'Sin datos',
          groups,
        };
      });
  }

  function firstGroupDate(row, columns) {
    return columns.map((column) => row.cells?.[column.id]?.marketDate).find(Boolean) || null;
  }

  function buildLegacySummary(monthly, months) {
    const latest = months[months.length - 1] || null;
    const first = months[0] || null;
    return {
      valueStart: first ? Number(first.total || 0) : 0,
      currentValue: latest ? Number(latest.total || 0) : 0,
      contributions: 0,
      withdrawals: 0,
      dividends: 0,
      dividendCount: 0,
      commissions: 0,
      netContributed: 0,
      resultYtd: latest && first ? latest.total - first.total : 0,
      completedMonths: months.length,
      latestMonth: latest?.label || null,
      activeGroups: monthly.columns?.length || 0,
    };
  }

  Object.assign(ctx, { renderMonthly });
}
