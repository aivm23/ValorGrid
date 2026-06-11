const { assertCtxDeps } = require('../../platform/ctx-utils');
const { DEFAULT_OPERATION_METRIC_IDS, OPERATION_METRIC_IDS } = require('../../shared/operations-metrics');

const UI_PREFERENCES_KEY = 'ui_preferences';
const MAX_METRICS = 6;

const VALID_HISTORY_MODES = new Set(['all', 'none', 'custom']);
const VALID_ASSET_TYPES = new Set(['stock', 'etf']);
const VALID_TRANSACTION_TYPES = new Set(['add', 'remove']);

const DEFAULT_HISTORY_EVENT_FILTERS = {
  mode: 'all',
  assetTypes: ['stock', 'etf'],
  transactionTypes: ['add', 'remove'],
};

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['repositories', 'appInfo'], 'ui-preferences-service');

  const { repositories, appInfo } = ctx;
  const metaRepo = repositories.meta || {};

  function getMetaValueByKey(key) {
    return metaRepo.getMetaValueByKey ? metaRepo.getMetaValueByKey(key) : null;
  }

  function setMetaValueByKey(key, value) {
    if (metaRepo.setMetaValueByKey) {
      return metaRepo.setMetaValueByKey(key, value);
    }
    const { db } = ctx;
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    db.prepare(
      `INSERT INTO app_meta (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    ).run(key, stringValue);
  }

  function parseUiPreferences() {
    const raw = getMetaValueByKey(UI_PREFERENCES_KEY);
    if (!raw) {
      return { operationsMetricIds: [...DEFAULT_OPERATION_METRIC_IDS], historyEventFilters: { ...DEFAULT_HISTORY_EVENT_FILTERS } };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.operationsMetricIds)) {
        const result = { operationsMetricIds: parsed.operationsMetricIds };
        if (parsed.historyEventFilters && typeof parsed.historyEventFilters === 'object') {
          result.historyEventFilters = { ...DEFAULT_HISTORY_EVENT_FILTERS, ...parsed.historyEventFilters };
        } else {
          result.historyEventFilters = { ...DEFAULT_HISTORY_EVENT_FILTERS };
        }
        return result;
      }
    } catch {
      // corrupt JSON - fall back to defaults
    }
    return { operationsMetricIds: [...DEFAULT_OPERATION_METRIC_IDS], historyEventFilters: { ...DEFAULT_HISTORY_EVENT_FILTERS } };
  }

  function validateMetricIds(metricIds) {
    if (!Array.isArray(metricIds)) {
      return { valid: false, error: 'operationsMetricIds must be an array' };
    }
    if (metricIds.length !== MAX_METRICS) {
      return { valid: false, error: `operationsMetricIds must contain exactly ${MAX_METRICS} metrics` };
    }
    const unique = new Set(metricIds);
    if (unique.size !== metricIds.length) {
      return { valid: false, error: 'operationsMetricIds must not contain duplicates' };
    }
    for (const id of metricIds) {
      if (!OPERATION_METRIC_IDS.has(id)) {
        return { valid: false, error: `Unknown metric id: ${id}` };
      }
    }
    return { valid: true };
  }

  function validateHistoryEventFilters(filters) {
    if (!filters || typeof filters !== 'object') {
      return { valid: false, error: 'historyEventFilters must be an object' };
    }
    const { mode, assetTypes, transactionTypes } = filters;
    if (mode && !VALID_HISTORY_MODES.has(mode)) {
      return { valid: false, error: `Invalid historyEventFilters.mode: ${mode}` };
    }
    if (assetTypes) {
      if (!Array.isArray(assetTypes) || assetTypes.length === 0) {
        return { valid: false, error: 'historyEventFilters.assetTypes must be a non-empty array' };
      }
      for (const t of assetTypes) {
        if (!VALID_ASSET_TYPES.has(t)) {
          return { valid: false, error: `Invalid historyEventFilters.assetTypes value: ${t}` };
        }
      }
    }
    if (transactionTypes) {
      if (!Array.isArray(transactionTypes) || transactionTypes.length === 0) {
        return { valid: false, error: 'historyEventFilters.transactionTypes must be a non-empty array' };
      }
      for (const t of transactionTypes) {
        if (!VALID_TRANSACTION_TYPES.has(t)) {
          return { valid: false, error: `Invalid historyEventFilters.transactionTypes value: ${t}` };
        }
      }
    }
    if (mode === 'custom') {
      if (!assetTypes || assetTypes.length === 0) {
        return { valid: false, error: 'historyEventFilters requires assetTypes when mode is custom' };
      }
      if (!transactionTypes || transactionTypes.length === 0) {
        return { valid: false, error: 'historyEventFilters requires transactionTypes when mode is custom' };
      }
    }
    return { valid: true };
  }

  function getUiPreferences() {
    const preferences = parseUiPreferences();
    const isProfessional = appInfo?.edition === 'professional';
    return {
      preferences,
      editable: isProfessional,
    };
  }

  function saveUiPreferences(payload) {
    const isProfessional = appInfo?.edition === 'professional';
    if (!isProfessional) {
      const error = new Error('Feature available in Professional Edition');
      error.statusCode = 403;
      throw error;
    }

    const existing = parseUiPreferences();

    if (payload && typeof payload.operationsMetricIds !== 'undefined') {
      const metricValidation = validateMetricIds(payload.operationsMetricIds);
      if (!metricValidation.valid) {
        const error = new Error(metricValidation.error);
        error.statusCode = 400;
        throw error;
      }
    }

    if (payload && typeof payload.historyEventFilters !== 'undefined') {
      const filterValidation = validateHistoryEventFilters(payload.historyEventFilters);
      if (!filterValidation.valid) {
        const error = new Error(filterValidation.error);
        error.statusCode = 400;
        throw error;
      }
    }

    const merged = { ...existing };
    if (payload && typeof payload.operationsMetricIds !== 'undefined') {
      merged.operationsMetricIds = payload.operationsMetricIds;
    }
    if (payload && typeof payload.historyEventFilters !== 'undefined') {
      merged.historyEventFilters = { ...DEFAULT_HISTORY_EVENT_FILTERS, ...payload.historyEventFilters };
    }

    setMetaValueByKey(UI_PREFERENCES_KEY, merged);
    return { preferences: { ...merged } };
  }

  Object.assign(ctx, {
    getUiPreferences,
    saveUiPreferences,
    parseUiPreferences,
  });
};
