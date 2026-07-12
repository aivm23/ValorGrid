export function attach(ctx) {
  const { assetColor, formatCurrency, formatInstrumentQuantity, formatPlainDate, escapeHtml, state, elements } = ctx;

  function buildConicGradient(items, total) {
    if (!total) return 'var(--track)';

    let start = 0;
    const segments = items
      .filter((item) => item.value > 0)
      .map((item) => {
        const end = start + (item.value / total) * 100;
        const segment = `${assetColor(item.symbol, item.color)} ${start.toFixed(3)}% ${end.toFixed(3)}%`;
        start = end;
        return segment;
      });

    return segments.length ? `conic-gradient(${segments.join(', ')})` : 'var(--track)';
  }

  function renderLegend(items, total, detailBuilder) {
    return [...items]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .map((item, index) => {
        const isStock = item.symbol === 'STOCK';
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        const hasSeparator = isStock && index > 0;

        return `${hasSeparator ? '<div class="legend-separator"></div>' : ''}
        <article class="legend-row ${isStock ? 'legend-row-button' : ''}" ${
          isStock ? 'role="button" tabindex="0" data-action="toggle-stock-detail"' : ''
        }>
          <span class="swatch" style="background: ${assetColor(item.symbol, item.color)}"></span>
          <span>
            <span class="legend-name">${item.name}</span>
            <span class="legend-detail">${detailBuilder(item)}</span>
          </span>
          <span class="legend-value">
            <strong>${pct.toFixed(1)}%</strong>
            <span>${formatCurrency(item.value || 0)}</span>
          </span>
        </article>`;
      })
      .join('');
  }

  function linePoint(series, index, scale) {
    const item = series[index];
    return `${scale.x(item.date).toFixed(2)},${scale.y(item.value).toFixed(2)}`;
  }

  function buildHistoryScale(history, width, height, padding) {
    const values = history.series.flatMap((item) =>
      Number.isFinite(Number(item.contributed)) ? [item.value, item.contributed] : [item.value],
    );
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valuePadding = Math.max((maxValue - minValue) * 0.08, 1);
    const yMin = minValue - valuePadding;
    const yMax = maxValue + valuePadding;
    const xMin = new Date(`${history.from}T00:00:00`).getTime();
    const xMax = new Date(`${history.to}T00:00:00`).getTime();

    return {
      x(date) {
        const value = new Date(`${date}T00:00:00`).getTime();
        if (xMax === xMin) return width / 2;
        return padding.left + ((value - xMin) / (xMax - xMin)) * (width - padding.left - padding.right);
      },
      y(value) {
        if (yMax === yMin) return height / 2;
        return padding.top + (1 - (value - yMin) / (yMax - yMin)) * (height - padding.top - padding.bottom);
      },
      minValue,
      maxValue,
    };
  }

  function middleDate(fromDate, toDate) {
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    const to = new Date(`${toDate}T00:00:00`).getTime();
    return new Date((from + to) / 2).toISOString().slice(0, 10);
  }

  function historyGuideValues(scale) {
    const spread = scale.maxValue - scale.minValue;
    if (!Number.isFinite(spread) || spread <= 0) return [scale.maxValue];
    return [scale.minValue, scale.minValue + spread / 2, scale.maxValue];
  }

  function nearestHistoryPoint(series, date) {
    return series.find((item) => item.date >= date) || series[series.length - 1];
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function eventGroupKey(event) {
    return event.plotDate || event.marketDate || event.date;
  }

  function eventOffset(index, total) {
    if (total <= 1) return 0;
    return (index - (total - 1) / 2) * 13;
  }

  function historyEventColor(event) {
    if (event.type === 'split') return '#f59e0b';
    if (event.type === 'dividend') return '#06b6d4';
    if (event.type === 'remove') return '#dc2626';
    return '#16a34a';
  }

  function historyEventLabel(type) {
    if (type === 'split') return ctx.t('history.events.split');
    if (type === 'dividend') return ctx.t('history.events.dividend');
    return type === 'remove' ? ctx.t('history.events.sell') : ctx.t('history.events.buy');
  }

  function eventTooltip(event) {
    if (event.type === 'split') {
      const oldShares = Number(event.price || 0);
      const newShares = Number(event.shares || 0);
      const ratio = oldShares > 0 ? newShares / oldShares : 0;
      return [
        `${ctx.t('history.events.split')} ${event.symbol}`,
        formatPlainDate(event.date),
        `${ctx.formatShareNumber(oldShares)} -> ${ctx.formatShareNumber(newShares)}`,
        ctx.t('history.tooltip.splitRatio', { value: `x${ctx.formatShareNumber(ratio)}` }),
        ctx.t('history.tooltip.origin', { value: ctx.t('history.origin.market') }),
      ].join('\n');
    }
    const type = historyEventLabel(event.type);
    const origin =
      event.origin === 'auto'
        ? ctx.t('history.origin.auto')
        : event.origin === 'import'
          ? ctx.t('history.origin.import')
          : ctx.t('history.origin.manual');
    const lines = [
      `${type} ${event.symbol}`,
      formatPlainDate(event.date),
      formatInstrumentQuantity(event.shares, event),
      formatCurrency(Number(event.valueEur)),
      ctx.t('history.tooltip.price', { value: formatCurrency(Number(event.price)) }),
      ctx.t('history.tooltip.origin', { value: origin }),
    ];
    if (event.marketDate && event.marketDate !== event.date) {
      lines.splice(2, 0, ctx.t('history.tooltip.market', { value: formatPlainDate(event.marketDate) }));
    }
    return lines.join('\n');
  }

  function eventGroupTooltip(events) {
    if (events.length === 1) return eventTooltip(events[0]);
    const date = events[0].plotDate || events[0].marketDate || events[0].date;
    return [
      ctx.tn('history.tooltip.movements', events.length, { date: formatPlainDate(date) }),
      '---',
      ...events
        .map((event) => {
          const type = historyEventLabel(event.type);
          if (event.type === 'split') {
            const oldShares = Number(event.price || 0);
            const newShares = Number(event.shares || 0);
            const ratio = oldShares > 0 ? newShares / oldShares : 0;
            return `${type} ${event.symbol}: ${ctx.formatShareNumber(oldShares)} -> ${ctx.formatShareNumber(newShares)} (${ctx.formatShareNumber(ratio)}x)`;
          }
          return `${type} ${event.symbol}: ${formatInstrumentQuantity(event.shares, event)}, ${formatCurrency(Number(event.valueEur))}`;
        })
        .flatMap((line, index) => (index === 0 ? [line] : ['---', line])),
    ].join('\n');
  }

  function metricInfo(label, tooltip, id) {
    const escapedLabel = escapeHtml(label);
    const escapedTooltip = escapeHtml(tooltip);
    return `
      <div class="metric-label">
        <span>${escapedLabel}</span>
        <button type="button" class="metric-info-button" aria-label="${escapeHtml(ctx.t('common.metricInfo'))}" aria-describedby="${id}">i</button>
        <span id="${id}" class="sr-only">${escapedTooltip}</span>
        <div class="metric-info-tooltip" role="tooltip" aria-hidden="true">${escapedTooltip}</div>
      </div>`;
  }

  function renderHistory() {
    const history = state.history;
    if (!history || history.range !== state.historyRange || !history.series?.length) {
      elements.historyChart.innerHTML = `<div class="history-empty">${escapeHtml(ctx.t('history.empty.insufficientData'))}</div>`;
      elements.historyStatus.textContent = ctx.t('history.status.pending');
      elements.historyGranularity.textContent = '';
      return;
    }

    const visibleEvents = ctx.getVisibleHistoryEvents(history);
    renderHistorySvg(history, visibleEvents);

    const last = history.series[history.series.length - 1];
    const first = history.series[0];
    const invested = visibleEvents.reduce((sum, event) => {
      const sign = event.type === 'add' ? 1 : event.type === 'remove' ? -1 : 0;
      return sum + sign * Number(event.valueEur || 0) + (event.type === 'add' ? Number(event.commissionEur || 0) : 0);
    }, 0);
    elements.historyStats.innerHTML = `
    <article class="has-border-accent">${metricInfo(
      ctx.t('history.stats.lastValue.label'),
      ctx.t('history.stats.lastValue.tooltip'),
      'history-last-value-info',
    )}<strong>${formatCurrency(last.value)}</strong></article>
    <article class="has-border-accent"><span>${escapeHtml(ctx.t('history.stats.visibleContributed'))}</span><strong>${formatCurrency(invested)}</strong></article>
    <article class="has-border-violet"><span>${escapeHtml(ctx.t('history.stats.visibleEvents'))}</span><strong>${visibleEvents.length}</strong></article>
  `;
    const quality =
      history.meta?.dataQuality && history.meta.dataQuality !== 'ok'
        ? ctx.t('history.status.quality', { quality: history.meta.dataQuality })
        : '';
    elements.historyStatus.textContent = ctx.tn('history.status.points', history.series.length, {
      value: formatCurrency(last.value),
      quality,
    });
    elements.historyGranularity.textContent =
      history.granularity === 'weekly' ? ctx.t('history.granularity.weekly') : ctx.t('history.granularity.daily');
    if (elements.historySubtitle) {
      elements.historySubtitle.textContent = ctx.t('history.subtitle.fromDate', { date: formatPlainDate(first.date) });
    }
  }

  function renderHistorySvg(history, visibleEvents) {
    const width = 900;
    const height = 320;
    const padding = { top: 24, right: 24, bottom: 38, left: 68 };
    const scale = buildHistoryScale(history, width, height, padding);
    const path = history.series
      .map((_, index) => `${index === 0 ? 'M' : 'L'} ${linePoint(history.series, index, scale)}`)
      .join(' ');
    const contributedPath = history.series
      .filter((item) => Number.isFinite(Number(item.contributed)))
      .map(
        (item, index) =>
          `${index === 0 ? 'M' : 'L'} ${scale.x(item.date).toFixed(2)},${scale.y(item.contributed).toFixed(2)}`,
      )
      .join(' ');
    const firstLinePoint = linePoint(history.series, 0, scale);
    const lastLinePoint = linePoint(history.series, history.series.length - 1, scale);
    const areaPath = `${path} L ${lastLinePoint.split(',')[0]},${height - padding.bottom} L ${
      firstLinePoint.split(',')[0]
    },${height - padding.bottom} Z`;
    const first = history.series[0];
    const last = history.series[history.series.length - 1];
    const events = visibleEvents || [];
    const groupedEvents = events.reduce((groups, event) => {
      const key = eventGroupKey(event);
      const items = groups.get(key) || [];
      items.push(event);
      groups.set(key, items);
      return groups;
    }, new Map());
    const guideLines = historyGuideValues(scale)
      .map((value) => {
        const y = scale.y(value);
        return `
        <line class="history-reference-line" x1="${padding.left}" y1="${y.toFixed(2)}" x2="${
          width - padding.right
        }" y2="${y.toFixed(2)}"></line>
        <text class="history-guide-label" x="${padding.left - 8}" y="${(y + 4).toFixed(2)}">${formatCurrency(
          value,
        )}</text>
      `;
      })
      .join('');
    const midDate = middleDate(first.date, last.date);

    const eventDots = [...groupedEvents.entries()]
      .map(([plotDate, group], index) => {
        const point = nearestHistoryPoint(history.series, plotDate);
        if (!point) return '';
        const x = clamp(scale.x(plotDate), padding.left, width - padding.right);
        const y = scale.y(point.value);
        const tooltip = escapeHtml(eventGroupTooltip(group));
        const eventColor = group.length > 1 ? 'url(#historyEventMultiGrad)' : historyEventColor(group[0]);
        const eventType = group.every((event) => event.type === 'split')
          ? 'split'
          : group.some((event) => event.type === 'remove')
            ? 'remove'
            : 'add';
        const r = group.length > 1 ? 6 : 5;
        return `
        <circle
          class="history-event-ring history-event-ring-${eventType}"
          cx="${x.toFixed(2)}"
          cy="${y.toFixed(2)}"
          r="${r + 2}"
          style="--event-color: ${eventColor}"
        ></circle>
        <circle
          class="history-event history-event-${eventType}"
          cx="${x.toFixed(2)}"
          cy="${y.toFixed(2)}"
          r="${r}"
          style="--event-color: ${eventColor}"
          data-tooltip="${tooltip}"
          data-event-color="${eventColor}"
          data-event-index="${index}"
        ></circle>
      `;
      })
      .join('');

    elements.historyChart.innerHTML = `
    <svg class="history-svg" viewBox="0 0 ${width} ${height}" role="presentation" focusable="false">
      <defs>
        <linearGradient id="historyLineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#06b6d4"/>
          <stop offset="100%" stop-color="#8b5cf6"/>
        </linearGradient>
        <linearGradient id="historyAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.01"/>
        </linearGradient>
        <linearGradient id="historyEventMultiGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#06b6d4"/>
          <stop offset="52%" stop-color="#22c55e"/>
          <stop offset="100%" stop-color="#8b5cf6"/>
        </linearGradient>
      </defs>
      <line class="history-grid-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${
        height - padding.bottom
      }"></line>
      <line class="history-grid-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${
        width - padding.right
      }" y2="${height - padding.bottom}"></line>
      ${guideLines}
      <path class="history-area" d="${areaPath}"></path>
      ${contributedPath ? `<path class="history-contributed-line" d="${contributedPath}"></path>` : ''}
      <text class="history-axis-label" x="${padding.left}" y="${height - 8}">${formatPlainDate(first.date)}</text>
      <text class="history-axis-label history-axis-label-mid" x="${scale.x(midDate).toFixed(2)}" y="${
        height - 8
      }">${formatPlainDate(midDate)}</text>
      <text class="history-axis-label history-axis-label-end" x="${width - padding.right}" y="${height - 8}">${formatPlainDate(
        last.date,
      )}</text>
      <path class="history-line" d="${path}"></path>
      ${eventDots}
    </svg>
  `;
  }

  Object.assign(ctx, {
    buildConicGradient,
    renderLegend,
    linePoint,
    buildHistoryScale,
    middleDate,
    historyGuideValues,
    nearestHistoryPoint,
    clamp,
    eventGroupKey,
    eventOffset,
    historyEventColor,
    eventTooltip,
    eventGroupTooltip,
    renderHistory,
    renderHistorySvg,
  });
}
