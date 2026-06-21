const { assertCtxDeps } = require('../../platform/ctx-utils');

const UI_PREFERENCES_KEY = 'ui_preferences';

const DEFAULT_HISTORY_EVENT_FILTERS = {
  mode: 'all',
  assetTypes: ['stock', 'etf', 'crypto', 'commodity'],
  transactionTypes: ['add', 'remove'],
};

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['repositories'], 'ui-preferences-service');

  const { repositories } = ctx;
  const metaRepo = repositories.meta || {};

  function getMetaValueByKey(key) {
    return metaRepo.getMetaValueByKey ? metaRepo.getMetaValueByKey(key) : null;
  }

  function parseUiPreferences() {
    const raw = getMetaValueByKey(UI_PREFERENCES_KEY);
    if (!raw) {
      return { historyEventFilters: { ...DEFAULT_HISTORY_EVENT_FILTERS } };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.historyEventFilters && typeof parsed.historyEventFilters === 'object') {
        return { historyEventFilters: { ...DEFAULT_HISTORY_EVENT_FILTERS, ...parsed.historyEventFilters } };
      }
    } catch {
      // corrupt JSON - fall back to defaults
    }
    return { historyEventFilters: { ...DEFAULT_HISTORY_EVENT_FILTERS } };
  }

  function getUiPreferences() {
    const preferences = parseUiPreferences();
    return {
      preferences,
      editable: false,
    };
  }

  function saveUiPreferences() {
    const error = new Error('Feature available in Professional Edition');
    error.statusCode = 403;
    throw error;
  }

  Object.assign(ctx, {
    getUiPreferences,
    saveUiPreferences,
    parseUiPreferences,
  });
};
