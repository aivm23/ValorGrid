export function attach(ctx) {
  const { state, elements } = ctx;

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
  });
}
