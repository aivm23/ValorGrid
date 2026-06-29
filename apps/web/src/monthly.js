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
      elements.ytdSubtitle.textContent =
        monthCount > 0
          ? ctx.t('monthly.subtitle.withData', { count: monthCount })
          : ctx.t('monthly.subtitle.empty');
    }

    if (!displayMonths.length) {
      elements.monthlyTracking.innerHTML = `
        <div class="empty-action-state ytd-empty">
          <span class="subtle">${ctx.t('monthly.empty')}</span>
          <button class="button button-compact btn-save" type="button" data-open-onboarding>${ctx.t('summary.empty.createPortfolio')}</button>
        </div>
      `;
      return;
    }

    const latestMonth = displayMonths[displayMonths.length - 1]?.month;
    const zeroNotice = omittedZeroMonths > 0 ? renderYtdZeroNotice(omittedZeroMonths) : '';
    elements.monthlyTracking.innerHTML =
      zeroNotice +
      displayMonths
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
        <strong>${ctx.tn('monthly.zeroNotice', count)}</strong>
        <span>${ctx.t('monthly.zeroNotice.description')}</span>
      </div>`;
  }

  function renderYtdSummary(summary) {
    const currentValue = Number(summary.currentValue || 0);
    const valueStart = Number(summary.valueStart || 0);
    const ytdPct = valueStart > 0 ? (((currentValue - valueStart) / valueStart) * 100).toFixed(1) : '0.0';
    const completedMonths = Number(summary.completedMonths || 0);
    return `
      <article class="has-border-accent"><span>${ctx.t('monthly.valueStart')}</span><strong>${ctx.formatCurrency(valueStart)}</strong><small class="metric-micro">${ctx.t('monthly.valueStart.micro')}</small></article>
      <article class="has-border-accent"><span>${ctx.t('operations.metrics.netContributed.label')}</span><strong class="${ctx.moneyClass(Number(summary.netContributed || 0))}">${ctx.formatCurrency(Number(summary.netContributed || 0))}</strong><small class="metric-micro">${ctx.t('monthly.completedMonths', { count: completedMonths })}</small></article>
      <article class="has-border-accent"><span>${ctx.t('monthly.currentValue')}</span><strong>${ctx.formatCurrency(currentValue)}</strong><small class="metric-micro">${ytdPct}% YTD</small></article>
      <article class="has-border-positive"><span>${ctx.t('monthly.contributions')}</span><strong>${ctx.formatCurrency(Number(summary.contributions || 0))}</strong><small class="metric-micro">${ctx.t('monthly.contributions.micro')}</small></article>
      <article class="has-border-negative"><span>${ctx.t('monthly.withdrawals')}</span><strong class="${ctx.moneyClass(Number(summary.withdrawals || 0))}">${ctx.formatCurrency(Number(summary.withdrawals || 0))}</strong><small class="metric-micro">${ctx.t('monthly.withdrawals.micro')}</small></article>
      <article class="has-border-accent"><span>${ctx.t('monthly.dividends')}</span><strong>${ctx.formatCurrency(Number(summary.dividends || 0))}</strong><small class="metric-micro">${ctx.t('monthly.dividends.micro', { count: Number(summary.dividendCount || 0) })}</small></article>
      <article class="${Number(summary.resultYtd || 0) >= 0 ? 'has-border-positive' : 'has-border-negative'}"><span>${ctx.t('monthly.resultYtd')}</span><strong class="${ctx.moneyClass(Number(summary.resultYtd || 0))}">${ctx.formatCurrency(Number(summary.resultYtd || 0))}</strong><small>${ctx.t('monthly.visibleMonths', { count: completedMonths })}</small></article>
    `;
  }

  function renderMonthCard(month, isOpen) {
    const groupsEnabled = ctx.state.groupsEnabled !== false;
    const variation =
      month.variation !== null && month.variation !== undefined && Number.isFinite(Number(month.variation))
        ? Number(month.variation)
        : null;
    const variationClass = variation === null ? '' : variation >= 0 ? 'is-positive' : 'is-negative';
    const topGroup = topGroupLabel(month, groupsEnabled);

    return `
      <details class="ytd-month-card" ${isOpen ? 'open' : ''}>
        <summary>
          <span class="ytd-month-title">${ctx.escapeHtml(formatMonthLabel(month))}</span>
          <span><small>${ctx.t('monthly.finalValue')}</small><strong>${ctx.formatCurrency(Number(month.total || 0))}</strong></span>
          <span><small>${ctx.t('monthly.contributions')}</small><strong>${ctx.formatCurrency(Number(month.contributions || 0))}</strong></span>
          <span><small>${ctx.t('monthly.withdrawals')}</small><strong class="${ctx.moneyClass(Number(month.withdrawals || 0))}">${ctx.formatCurrency(Number(month.withdrawals || 0))}</strong></span>
          <span><small>${ctx.t('monthly.dividends')}</small><strong>${ctx.formatCurrency(Number(month.dividends || 0))}</strong></span>
          <span><small>${ctx.t('monthly.variation')}</small><strong class="${variationClass}">${variation === null ? ctx.t('monthly.start') : ctx.formatCurrency(variation)}</strong></span>
          <span><small>${ctx.t('monthly.automatic')}</small><strong>${ctx.escapeHtml(formatAutoStatus(month.autoStatus))}</strong></span>
        </summary>
        <div class="ytd-month-body">
          <div class="ytd-month-meta">
            <span>${ctx.t('monthly.valuationDate', { date: ctx.formatDate(month.asOfDate) })}</span>
            <span>${ctx.t('monthly.mainDriver', { value: topGroup })}</span>
            <span>${ctx.t('monthly.fees', { value: ctx.formatCurrencySpan(Number(month.commissions || 0)) })}</span>
          </div>
          ${renderGroupBreakdown(month.groups || [], groupsEnabled)}
        </div>
      </details>
    `;
  }

  function topGroupLabel(month, groupsEnabled) {
    if (groupsEnabled && month.topGroup) {
      return `<span class="ytd-driver-dot" style="--driver-color:${ctx.escapeHtml(month.topGroup.color || '#64748b')}"></span>${ctx.escapeHtml(month.topGroup.label)} ${ctx.formatCurrency(Number(month.topGroup.variation || 0))}`;
    }
    return groupsEnabled ? ctx.t('monthly.noDominantGroup') : ctx.t('monthly.noGroupBreakdown');
  }

  function renderGroupBreakdown(groups, groupsEnabled) {
    if (!groups.length) return `<p class="subtle">${ctx.t(groupsEnabled ? 'monthly.emptyGroups' : 'monthly.emptyInstruments')}</p>`;
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
          <small>${Number(group.pct || 0).toLocaleString(typeof ctx.locale === 'function' ? ctx.locale() : 'es-ES', { maximumFractionDigits: 1 })}% ${ctx.t('del mes')}</small>
        </div>
        <div><small>${ctx.t('monthly.value')}</small><strong>${ctx.formatCurrency(Number(group.value || 0))}</strong></div>
        <div><small>${ctx.t('monthly.contributed')}</small><strong class="${ctx.moneyClass(Number(group.contributions || 0))}">${ctx.formatCurrency(Number(group.contributions || 0))}</strong></div>
        <div><small>${ctx.t('monthly.dividends')}</small><strong>${ctx.formatCurrency(Number(group.dividends || 0))}</strong></div>
        <div><small>${ctx.t('monthly.net')}</small><strong class="${ctx.moneyClass(Number(group.netContribution || 0))}">${ctx.formatCurrency(Number(group.netContribution || 0))}</strong></div>
        <ul>${positions || `<li><span>${ctx.t('monthly.noValuePositions')}</span></li>`}</ul>
      </article>
    `;
  }

  function formatMonthLabel(month) {
    const [year, monthPart] = String(month?.month || month || '').split('-');
    const date = new Date(Number(year), Number(monthPart) - 1, 1);
    if (!Number.isFinite(date.getTime())) return month?.label || '';
    const label = new Intl.DateTimeFormat(typeof ctx.locale === 'function' ? ctx.locale() : 'es-ES', {
      month: 'long',
    }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function formatAutoStatus(value) {
    const text = String(value || '').trim();
    if (!text || text === 'Sin automáticas') return ctx.t('monthly.autoStatus.none');
    if (text === 'Sin datos') return ctx.t('monthly.autoStatus.noData');
    const match = text.match(/^(\d+)\s+autom[aá]ticas$/i);
    if (match) return ctx.tn('monthly.autoStatus', Number(match[1]));
    return ctx.t(text);
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
