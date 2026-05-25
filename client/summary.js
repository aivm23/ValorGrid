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
            ${item.groupId ? `data-group-id="${ctx.escapeHtml(item.groupId)}"` : ''}
            ${expandable ? 'role="button" tabindex="0" data-action="toggle-stock-detail"' : ''}>
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

  function effectiveGroupComponents(groupId) {
    return (ctx.state.summary?.groupedPositions?.[groupId] || [])
      .filter((item) => Number(item.value || 0) > 0 && Math.abs(Number(item.shares || 0)) > 0.0000001)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  }

  function donutTooltipHtml(item) {
    if (!item) return '';
    const total = Number(item.value || 0);
    const components = item.groupId ? effectiveGroupComponents(item.groupId) : [item].filter((entry) => entry.symbol);
    const rows = components.length
      ? components
          .map((component) => {
            const pct = total > 0 ? (Number(component.value || 0) / total) * 100 : 0;
            return `<li>
              <span>${ctx.escapeHtml(component.name || component.symbol)}</span>
              <strong>${ctx.formatCurrency(Number(component.value || 0))} · ${pct.toFixed(1)}%</strong>
            </li>`;
          })
          .join('')
      : '<li><span>Sin posiciones con valor</span></li>';
    return `
      <div class="donut-tooltip-title">${ctx.escapeHtml(item.name)}</div>
      <div class="donut-tooltip-total">${ctx.formatCurrency(total)}</div>
      <ul>${rows}</ul>
    `;
  }

  function portfolioItemByGroupId(groupId) {
    return (ctx.state.summary?.portfolio || []).find((item) => item.groupId === groupId) || null;
  }

  function portfolioItemFromChartPoint(event) {
    const portfolio = ctx.withAssetColors(ctx.state.summary?.portfolio || []).filter((item) => Number(item.value || 0) > 0);
    const total = portfolio.reduce((sum, item) => sum + Number(item.value || 0), 0);
    if (!portfolio.length || total <= 0) return null;

    const rect = ctx.elements.chart.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const radius = rect.width / 2;
    const distance = Math.sqrt(x * x + y * y);
    if (distance > radius || distance < radius * 0.38) return null;

    const angle = (Math.atan2(y, x) * 180) / Math.PI;
    const pct = ((angle + 90 + 360) % 360) / 360;
    let accumulated = 0;
    return portfolio.find((item) => {
      accumulated += Number(item.value || 0) / total;
      return pct <= accumulated + 0.000001;
    }) || portfolio[portfolio.length - 1];
  }

  function showDonutTooltipForItem(item, event, options = {}) {
    const { pinned = false, activateSegment = false } = options;
    const tooltip = ctx.elements.donutTooltip;
    const html = donutTooltipHtml(item);
    if (!html) {
      hideDonutTooltip();
      return;
    }
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    tooltip.classList.toggle('is-touch', pinned);
    tooltip.dataset.pinned = pinned ? 'true' : 'false';
    if (activateSegment) setActiveDonutSegment(item);
    else clearActiveDonutSegment();
    moveDonutTooltip(event);
  }

  function showDonutTooltip(event) {
    const visibleGroups = (ctx.state.summary?.portfolio || []).filter((entry) => Number(entry.value || 0) > 0);
    if (visibleGroups.length <= 1) {
      hideDonutTooltip();
      return;
    }
    const item = portfolioItemFromChartPoint(event);
    if (!item) {
      hideDonutTooltip();
      return;
    }
    showDonutTooltipForItem(item, event, { activateSegment: true });
  }

  function showDonutTooltipFromLegend(event) {
    const row = event.target.closest('[data-group-id]');
    if (!row) return;
    const item = portfolioItemByGroupId(row.dataset.groupId);
    if (!item) return;
    showDonutTooltipForItem(item, event);
  }

  function pinDonutTooltip(event) {
    const chartItem = portfolioItemFromChartPoint(event);
    const item =
      chartItem ||
      portfolioItemByGroupId(event.target.closest('[data-group-id]')?.dataset.groupId);
    if (!item) return;
    showDonutTooltipForItem(item, event, {
      pinned: true,
      activateSegment: Boolean(chartItem),
    });
  }

  function moveDonutTooltip(event) {
    const tooltip = ctx.elements.donutTooltip;
    if (tooltip.hidden || tooltip.dataset.pinned === 'true') return;
    tooltip.style.left = `${Math.min(event.clientX + 14, ctx.window.innerWidth - 280)}px`;
    tooltip.style.top = `${Math.max(12, event.clientY + 14)}px`;
  }

  function hideDonutTooltip() {
    if (!ctx.elements.donutTooltip) return;
    if (ctx.elements.donutTooltip.dataset.pinned === 'true') return;
    ctx.elements.donutTooltip.hidden = true;
    ctx.elements.donutTooltip.dataset.pinned = 'false';
    ctx.elements.donutTooltip.classList.remove('is-touch');
    clearActiveDonutSegment();
  }

  function closeDonutTooltip() {
    if (!ctx.elements.donutTooltip) return;
    ctx.elements.donutTooltip.hidden = true;
    ctx.elements.donutTooltip.dataset.pinned = 'false';
    ctx.elements.donutTooltip.classList.remove('is-touch');
    clearActiveDonutSegment();
  }

  function activeSegmentData(item) {
    const portfolio = ctx.withAssetColors(ctx.state.summary?.portfolio || []).filter((entry) => Number(entry.value || 0) > 0);
    const total = portfolio.reduce((sum, entry) => sum + Number(entry.value || 0), 0);
    if (!item || !portfolio.length || total <= 0) return null;

    let start = 0;
    let matchedSegment = null;
    const mutedSegments = [];
    for (const entry of portfolio) {
      const end = start + (Number(entry.value || 0) / total) * 360;
      const matches = entry.groupId ? entry.groupId === item.groupId : entry.symbol === item.symbol;
      const color = matches ? 'var(--track)' : ctx.assetColor(entry.symbol, entry.color);
      mutedSegments.push(`${color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
      if (matches) {
        const mid = ((start + end) / 2 - 90) * (Math.PI / 180);
        matchedSegment = {
          color: ctx.assetColor(entry.symbol, entry.color),
          start,
          end,
          dx: Math.cos(mid) * 15,
          dy: Math.sin(mid) * 15,
        };
      }
      start = end;
    }
    if (!matchedSegment) return null;
    return {
      ...matchedSegment,
      mutedBackground: `conic-gradient(${mutedSegments.join(', ')})`,
    };
  }

  function setActiveDonutSegment(item) {
    const segment = activeSegmentData(item);
    const chart = ctx.elements.chart;
    if (!segment) {
      clearActiveDonutSegment();
      return;
    }
    if (!chart.dataset.baseBackground) chart.dataset.baseBackground = chart.style.background || '';
    chart.style.background = segment.mutedBackground;
    chart.classList.add('donut-chart-active');
    chart.style.setProperty('--donut-active-color', segment.color);
    chart.style.setProperty('--donut-active-start', `${segment.start.toFixed(2)}deg`);
    chart.style.setProperty('--donut-active-end', `${segment.end.toFixed(2)}deg`);
    chart.style.setProperty('--donut-active-x', `${segment.dx.toFixed(2)}px`);
    chart.style.setProperty('--donut-active-y', `${segment.dy.toFixed(2)}px`);
  }

  function clearActiveDonutSegment() {
    const chart = ctx.elements.chart;
    if (!chart) return;
    chart.classList.remove('donut-chart-active');
    if (chart.dataset.baseBackground) {
      chart.style.background = chart.dataset.baseBackground;
      delete chart.dataset.baseBackground;
    }
    chart.style.removeProperty('--donut-active-color');
    chart.style.removeProperty('--donut-active-start');
    chart.style.removeProperty('--donut-active-end');
    chart.style.removeProperty('--donut-active-x');
    chart.style.removeProperty('--donut-active-y');
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
          <p class="subtle">Sin posiciones todavía. Crea tu primer instrumento y añade tu primer movimiento.</p>
          <button class="button" type="button" data-open-onboarding>Crear cartera</button>
        </div>`;
    } else {
      elements.legend.innerHTML = '<p class="subtle">Sin posiciones todavía. Usa Añadir para registrar el primer movimiento.</p>';
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

  Object.assign(ctx, {
    renderSummary,
    showDonutTooltip,
    showDonutTooltipFromLegend,
    pinDonutTooltip,
    moveDonutTooltip,
    hideDonutTooltip,
    closeDonutTooltip,
  });
}
