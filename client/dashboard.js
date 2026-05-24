export function attach(ctx) {
  function setBootState(status, message = '') {
    const { elements } = ctx;
    if (!elements.bootOverlay) return;
    const text = elements.bootOverlay.querySelector('span');
    if (text && message) text.textContent = message;
    elements.bootOverlay.classList.toggle('is-error', status === 'error');
    elements.bootOverlay.hidden = status === 'ready';
    if (elements.bootRetry) elements.bootRetry.hidden = status !== 'error';
  }

  async function refreshDashboard() {
    const { elements, state } = ctx;
    elements.refreshPrices.disabled = true;
    elements.priceStatus.textContent = 'Cargando precios online...';
    if (!state.initialLoadComplete) setBootState('loading', 'Preparando datos y cartera local.');

    try {
      const [summary, monthly, appInfo, transactionData, instrumentData, groupData, backupData, importData] = await Promise.all([
        ctx.fetchJson('/api/portfolio/summary'),
        ctx.fetchJson('/api/portfolio/monthly?year=2026'),
        ctx.fetchJson('/api/version'),
        ctx.fetchJson('/api/transactions'),
        ctx.fetchJson('/api/instruments'),
        ctx.fetchJson('/api/instrument-groups'),
        ctx.fetchJson('/api/backups'),
        ctx.fetchJson('/api/import/batches'),
      ]);
      state.summary = summary;
      state.onboarding = summary.onboarding || null;
      state.monthly = monthly;
      state.version = appInfo.version;
      state.transactions = transactionData.transactions || [];
      state.instruments = instrumentData.instruments || [];
      state.groups = groupData.groups || [];
      state.backups = backupData.backups || [];
      state.importBatches = importData.batches || [];
      state.autoPlans = summary.autoPlans || state.autoPlans;
      renderDashboard();
      state.initialLoadComplete = true;
      setBootState('ready');
    } catch (error) {
      elements.priceStatus.textContent = `No se pudieron cargar datos: ${ctx.normalizeErrorMessage(error)}`;
      if (!state.initialLoadComplete) setBootState('error', `No se pudieron cargar datos: ${ctx.normalizeErrorMessage(error)}`);
      try {
        state.onboarding = await ctx.fetchJson('/api/onboarding/status');
        elements.onboardingWizard.hidden = !state.onboarding?.needsSetup;
        if (elements.exportMenu) elements.exportMenu.hidden = Boolean(state.onboarding?.needsSetup);
      } catch {
        // Keep the previous toolbar state if even onboarding cannot be read.
      }
    } finally {
      elements.refreshPrices.disabled = false;
    }
  }

  function renderDashboard() {
    const { state, elements } = ctx;
    if (state.version) elements.appVersion.textContent = `v${state.version}`;
    elements.onboardingWizard.hidden = !state.onboarding?.needsSetup;
    if (elements.exportMenu) elements.exportMenu.hidden = Boolean(state.onboarding?.needsSetup);
    ctx.renderSummary();
    ctx.renderMonthly();
    ctx.renderHistory();
    ctx.renderLedger();
    ctx.renderPerformance();
    ctx.renderBackups();
    ctx.renderImportBatches();
    ctx.renderInstruments();
  }

  async function refreshHistory(options = {}) {
    const { state, elements } = ctx;
    const requestId = state.historyRequestId + 1;
    state.historyRequestId = requestId;
    state.historyAbortController?.abort('superseded');
    const cached = ctx.getCachedHistory(state.historyRange);
    if (cached && !options.force) {
      state.history = cached;
      ctx.cacheHistory(cached);
      ctx.renderHistory();
      return;
    }

    const controller = new AbortController();
    state.historyAbortController = controller;
    elements.historyStatus.textContent = 'Preparando histórico...';
    elements.historyGranularity.textContent = '';

    try {
      const history = await ctx.fetchJson(`/api/portfolio/history?range=${encodeURIComponent(state.historyRange)}`, {
        timeoutMs: 60000,
        signal: controller.signal,
      });
      if (requestId !== state.historyRequestId) return;
      state.history = history;
      ctx.cacheHistory(history);
      ctx.renderHistory();
    } catch (error) {
      if (requestId !== state.historyRequestId) return;
      elements.historyStatus.textContent = `No se pudo cargar histórico: ${ctx.normalizeErrorMessage(error)}`;
    } finally {
      if (requestId === state.historyRequestId) state.historyAbortController = null;
    }
  }

  Object.assign(ctx, { renderDashboard, refreshDashboard, refreshHistory, setBootState });
}
