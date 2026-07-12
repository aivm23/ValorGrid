export function createApiClient({ fetchBlob, fetchJson, sendJson }) {
  const portfolio = {
    summary: () => fetchJson('/api/portfolio/summary'),
    monthly: (year) => fetchJson(`/api/portfolio/monthly?year=${year}`),
    performance: () => fetchJson('/api/portfolio/performance'),
    history: (range, granularity = 'auto', options = {}) =>
      fetchJson(
        `/api/portfolio/history?range=${encodeURIComponent(range)}&granularity=${encodeURIComponent(granularity)}`,
        options,
      ),
    onboardingStatus: () => fetchJson('/api/onboarding/status'),
  };

  const transactions = {
    list: (options) => fetchJson('/api/transactions', options),
    create: (payload) => sendJson('/api/transactions', 'POST', payload),
    preview: (payload, options) => sendJson('/api/transactions/preview', 'POST', payload, options),
    previewEdit: (id, payload, options) =>
      sendJson(`/api/transactions/${encodeURIComponent(id)}/preview`, 'POST', payload, options),
    update: (id, payload) => sendJson(`/api/transactions/${encodeURIComponent(id)}`, 'PUT', payload),
    removeMany: (ids) => sendJson('/api/transactions', 'DELETE', { ids }),
    autoPlans: {
      list: () => fetchJson('/api/auto-plans'),
      preview: (autoPlans) => sendJson('/api/auto-plans/preview', 'POST', { autoPlans }),
      save: (autoPlans) => sendJson('/api/auto-plans', 'PUT', { autoPlans }),
    },
  };

  const instruments = {
    list: () => fetchJson('/api/instruments'),
    create: (payload) => sendJson('/api/instruments', 'POST', payload),
    update: (symbol, payload) => sendJson(`/api/instruments/${encodeURIComponent(symbol)}`, 'PUT', payload),
    removeMany: (symbols) => sendJson('/api/instruments', 'DELETE', { symbols }),
    previewDelete: (symbols) => sendJson('/api/instruments/preview-delete', 'POST', { symbols }),
    setBrandPalette: (enabled) => sendJson('/api/instruments/brand-palette', 'PUT', { enabled }),
    groups: {
      list: () => fetchJson('/api/instrument-groups'),
      create: (payload) => sendJson('/api/instrument-groups', 'POST', payload),
      update: (id, payload) => sendJson(`/api/instrument-groups/${encodeURIComponent(id)}`, 'PUT', payload),
      removeMany: (ids) => sendJson('/api/instrument-groups', 'DELETE', { ids }),
      setEnabled: (enabled) => sendJson('/api/instrument-groups/settings', 'PUT', { enabled }),
    },
  };

  const imports = {
    sources: () => fetchJson('/api/import/sources'),
    preview: (payload) => sendJson('/api/import/preview', 'POST', payload),
    commit: (payload) => sendJson('/api/import/commit', 'POST', payload, { timeoutMs: 60000 }),
    batches: () => fetchJson('/api/import/batches'),
    rollbackLog: () => fetchJson('/api/import/rollback-log'),
    rollback: (id) => sendJson(`/api/import/batches/${encodeURIComponent(id)}/rollback`, 'POST', {}),
    template: () => fetchBlob('/api/import/template.xlsx'),
  };

  const liquidity = {
    list: () => fetchJson('/api/liquidity'),
    create: (payload) => sendJson('/api/liquidity/accounts', 'POST', payload),
    update: (symbol, payload) => sendJson(`/api/liquidity/accounts/${encodeURIComponent(symbol)}`, 'PUT', payload),
    remove: (symbol) => sendJson(`/api/liquidity/accounts/${encodeURIComponent(symbol)}`, 'DELETE', {}),
  };

  const dividends = {
    summary: (options) => fetchJson('/api/dividends/summary', options),
    scan: (mode, options) => sendJson('/api/dividends/scan', 'POST', { mode }, options),
    drafts: (options) => fetchJson('/api/dividends/drafts', options),
    updateDraft: (id, payload) => sendJson(`/api/dividends/drafts/${encodeURIComponent(id)}`, 'PATCH', payload),
    confirmDraft: (id, autoIncludeNext) =>
      sendJson(`/api/dividends/drafts/${encodeURIComponent(id)}/confirm`, 'POST', { autoIncludeNext }),
    ignoreDraft: (id) => sendJson(`/api/dividends/drafts/${encodeURIComponent(id)}/ignore`, 'POST', {}),
    updateSettings: (symbol, payload) =>
      sendJson(`/api/dividends/settings/${encodeURIComponent(symbol)}`, 'PUT', payload),
  };

  const onboarding = {
    status: portfolio.onboardingStatus,
    preview: (payload, options) => sendJson('/api/onboarding/wizard/preview', 'POST', payload, options),
    commit: (payload, options) => sendJson('/api/onboarding/wizard/commit', 'POST', payload, options),
  };

  const admin = {
    version: () => fetchJson('/api/version'),
    health: () => fetchJson('/api/health'),
    diagnostics: () => fetchJson('/api/diagnostics/performance'),
    backups: () => fetchJson('/api/backups'),
    createBackup: () => sendJson('/api/backups', 'POST', {}),
    deleteBackup: (file) => sendJson(`/api/backups/${encodeURIComponent(file)}`, 'DELETE', {}),
    backupDownloadUrl: (file) => `/api/backups/${encodeURIComponent(file)}`,
    updateStatus: () => fetchJson('/api/update/status'),
    dockerCommands: (version) => fetchJson(`/api/update/docker-commands?version=${encodeURIComponent(version)}`),
  };

  const marketData = {
    sources: () => fetchJson('/api/market-data/sources'),
    quote: (symbol, date) => {
      const params = new URLSearchParams({ symbol });
      if (date) params.set('date', date);
      return fetchJson(`/api/quote?${params.toString()}`);
    },
    alphaVantage: {
      status: () => fetchJson('/api/market-data/alpha-vantage/status'),
      saveKey: (apiKey) => sendJson('/api/market-data/alpha-vantage/key', 'POST', { apiKey }),
      deleteKey: () => sendJson('/api/market-data/alpha-vantage/key', 'DELETE', {}),
    },
  };

  const preferences = {
    ui: () => fetchJson('/api/preferences/ui'),
    saveUi: (payload) => sendJson('/api/preferences/ui', 'PUT', payload),
  };

  const extensions = { manifest: () => fetchJson('/api/extensions') };

  const exports = {
    transactionsUrl(filters = {}) {
      const params = new URLSearchParams();
      for (const key of ['symbol', 'origin', 'type', 'from', 'to']) {
        if (filters[key]) params.set(key, filters[key]);
      }
      const query = params.toString();
      return `/api/export/transactions.xlsx${query ? `?${query}` : ''}`;
    },
  };

  const dashboard = {
    async loadInitial(year) {
      const [
        summary,
        monthly,
        appInfo,
        transactionData,
        instrumentData,
        groupData,
        liquidityData,
        backupData,
        importData,
        marketDataSources,
      ] = await Promise.all([
        portfolio.summary(),
        portfolio.monthly(year),
        admin.version(),
        transactions.list(),
        instruments.list(),
        instruments.groups.list(),
        liquidity.list(),
        admin.backups(),
        imports.batches(),
        marketData.sources(),
      ]);
      return {
        summary,
        monthly,
        appInfo,
        transactionData,
        instrumentData,
        groupData,
        liquidityData,
        backupData,
        importData,
        marketDataSources,
      };
    },
  };

  return {
    admin,
    dashboard,
    dividends,
    extensions,
    exports,
    imports,
    instruments,
    liquidity,
    marketData,
    onboarding,
    portfolio,
    preferences,
    transactions,
  };
}
