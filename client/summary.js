export function attach(ctx) {
  function expandableGroup() {
    const groups = (ctx.state.summary?.portfolio || []).filter((item) => item.isExpandable);
    if (!ctx.state.expandedGroupId) return null;
    return groups.find((item) => item.groupId === ctx.state.expandedGroupId) || null;
  }

  function renderPortfolioLegend(items, total, detailBuilder) {
    return [...items]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .map((item) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        const color = ctx.assetColor(item.symbol, item.color);
        const expandable = item.isExpandable;
        const selected = expandable && ctx.state.expandedGroupId === item.groupId;
        return `
          <article class="legend-row ${expandable ? 'legend-row-button' : ''} ${selected ? 'legend-row-selected' : ''}"
            ${expandable ? `role="button" tabindex="0" data-action="toggle-stock-detail" data-group-id="${ctx.escapeHtml(item.groupId)}"` : ''}>
            <span class="swatch" style="background: ${color}"></span>
            <span>
              <span class="legend-name">${ctx.escapeHtml(item.name)}</span>
              <span class="legend-detail">${detailBuilder(item)}</span>
            </span>
            <span class="legend-value">
              <strong>${pct.toFixed(1)}%</strong>
              <span>${ctx.formatCurrency(item.value || 0)}</span>
            </span>
          </article>
        `;
      })
      .join('');
  }

  function renderSummary() {
    const { state, elements } = ctx;
    const summary = state.summary;
    if (!summary) return;

    const portfolio = ctx.withAssetColors(summary.portfolio || []);
    const group = expandableGroup();
    const detailPositions = group ? ctx.withAssetColors(summary.groupedPositions?.[group.groupId] || []) : [];
    const detailTotal = detailPositions.reduce((sum, item) => sum + Number(item.value || 0), 0);

    elements.portfolioTotal.textContent = ctx.formatCurrency(summary.total);
    elements.portfolioTotalCenter.textContent = ctx.formatCurrency(summary.total);
    elements.stockTotalCenter.textContent = ctx.formatCurrency(detailTotal);
    elements.chart.style.background = ctx.buildConicGradient(portfolio, summary.total);
    elements.stockChart.style.background = ctx.buildConicGradient(detailPositions, detailTotal);

    if (portfolio.length) {
      elements.legend.innerHTML = renderPortfolioLegend(portfolio, summary.total, (item) => {
          if (item.isExpandable) return 'Desglose disponible';
          return item.shares == null ? 'Grupo de cartera' : `${item.symbol}: ${ctx.formatCurrency(item.priceEur)} x ${ctx.formatShares(item)}`;
        });
    } else if (summary.onboarding?.needsSetup) {
      elements.legend.innerHTML = `<div class="empty-action-state">
          <p class="subtle">Sin posiciones todavia. Crea tu primer instrumento y anade tu primer movimiento.</p>
          <button class="button" type="button" data-open-onboarding>Crear cartera</button>
        </div>`;
    } else {
      elements.legend.innerHTML = '<p class="subtle">Sin posiciones todavia. Usa Anadir para registrar el primer movimiento.</p>';
    }

    elements.stockDetail.hidden = !state.expandedGroupId || !group;
    if (group) {
      elements.stockDetailTitle.textContent = group.name;
    }
    elements.stockLegend.innerHTML = detailPositions.length
      ? ctx.renderLegend(detailPositions, detailTotal, (item) => {
          const sharesText = `${ctx.formatShares(item)} acciones`;
          return `${item.symbol}: ${ctx.formatCurrency(item.priceEur)} x ${sharesText}`;
        })
      : '<p class="subtle">Sin posiciones para desglosar.</p>';

    elements.priceStatus.textContent = `Precios actualizados desde Yahoo Finance - ${ctx.formatDateTime(summary.updatedAt)}`;
  }

  Object.assign(ctx, { renderSummary });
}
