export function attach(ctx) {
  const { state, elements } = ctx;

  function matchesHistoryEventFilters(event, filters) {
    if (!filters) return true;
    const { mode, assetTypes, transactionTypes } = filters;
    if (mode === 'all') return true;
    if (mode === 'none') return false;
    if (mode === 'custom') {
      if (!assetTypes || !transactionTypes) return false;
      const instrumentType = event.instrumentType;
      if (!instrumentType) return false;
      const typeMatch = assetTypes.includes(instrumentType);
      const eventTransactionType = event.type === 'add' ? 'add' : 'remove';
      const transactionTypeMatch = transactionTypes.includes(eventTransactionType);
      return typeMatch && transactionTypeMatch;
    }
    return true;
  }

  function getVisibleHistoryEvents(history) {
    if (!history || !history.events) return [];
    const filters = state.historyEventFilters;
    if (!filters || filters.mode === 'all') return history.events;
    if (filters.mode === 'none') return [];
    return history.events.filter((event) => matchesHistoryEventFilters(event, filters));
  }

  function setHistoryRange(range) {
    state.historyRange = range;
    elements.historyRangeButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.historyRange === range);
    });
    if (state.history?.range !== range) {
      state.history = null;
    }
    ctx.refreshHistory();
  }

  function showHistoryTooltip(event) {
    const target = event.target.closest?.('[data-tooltip]');
    if (!target) return;
    elements.historyTooltip.textContent = target.dataset.tooltip;
    elements.historyTooltip.hidden = false;
    elements.historyEventPanel.textContent = target.dataset.tooltip;
    elements.historyEventPanel.hidden = false;
  }

  function moveHistoryTooltip(event) {
    if (elements.historyTooltip.hidden) return;
    const bounds = elements.historyChart.getBoundingClientRect();
    elements.historyTooltip.style.left = `${event.clientX - bounds.left + 12}px`;
    elements.historyTooltip.style.top = `${event.clientY - bounds.top + 12}px`;
  }

  function hideHistoryTooltip() {
    elements.historyTooltip.hidden = true;
  }

  Object.assign(ctx, {
    setHistoryRange,
    showHistoryTooltip,
    moveHistoryTooltip,
    hideHistoryTooltip,
    matchesHistoryEventFilters,
    getVisibleHistoryEvents,
  });
}
