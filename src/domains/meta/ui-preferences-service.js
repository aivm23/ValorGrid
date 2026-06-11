const { assertCtxDeps } = require('../../platform/ctx-utils');
const { DEFAULT_OPERATION_METRIC_IDS, OPERATION_METRIC_IDS } = require('../../shared/operations-metrics');

const UI_PREFERENCES_KEY = 'ui_preferences';
const MAX_METRICS = 6;

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
      return { operationsMetricIds: [...DEFAULT_OPERATION_METRIC_IDS] };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.operationsMetricIds)) {
        return { operationsMetricIds: parsed.operationsMetricIds };
      }
    } catch {
      // corrupt JSON - fall back to defaults
    }
    return { operationsMetricIds: [...DEFAULT_OPERATION_METRIC_IDS] };
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

    const validation = validateMetricIds(payload?.operationsMetricIds);
    if (!validation.valid) {
      const error = new Error(validation.error);
      error.statusCode = 400;
      throw error;
    }

    setMetaValueByKey(UI_PREFERENCES_KEY, { operationsMetricIds: payload.operationsMetricIds });
    return { preferences: { operationsMetricIds: payload.operationsMetricIds } };
  }

  Object.assign(ctx, {
    getUiPreferences,
    saveUiPreferences,
    parseUiPreferences,
  });
};
