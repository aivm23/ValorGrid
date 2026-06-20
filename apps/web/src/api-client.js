/**
 * Cliente HTTP tipado para la API de ValorGrid.
 * Wraps fetchJson/sendJson con JSDoc types para cada endpoint.
 */

import { fetchJson, sendJson } from './api.js';

// ── Portfolio ──

/** @returns {Promise<import('@valorgrid/contracts').PortfolioSummary>} */
export function fetchSummary() {
  return fetchJson('/api/portfolio/summary');
}

/**
 * @param {number} year
 * @returns {Promise<unknown>}
 */
export function fetchMonthly(year) {
  return fetchJson(`/api/portfolio/monthly?year=${year}`);
}

/** @returns {Promise<unknown>} */
export function fetchPerformance() {
  return fetchJson('/api/portfolio/performance');
}

/**
 * @param {string} range
 * @param {string} granularity
 * @returns {Promise<unknown>}
 */
export function fetchHistory(range, granularity) {
  return fetchJson(
    `/api/portfolio/history?range=${encodeURIComponent(range)}&granularity=${encodeURIComponent(granularity)}`,
  );
}

// ── Instruments ──

/** @returns {Promise<{ instruments: import('@valorgrid/contracts').Instrument[] }>} */
export function fetchInstruments() {
  return fetchJson('/api/instruments');
}

/** @returns {Promise<{ groups: import('@valorgrid/contracts').InstrumentGroup[] }>} */
export function fetchInstrumentGroups() {
  return fetchJson('/api/instrument-groups');
}

/**
 * @param {string} symbol
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ instrument: import('@valorgrid/contracts').Instrument }>}
 */
export function updateInstrument(symbol, payload) {
  return sendJson(`/api/instruments/${encodeURIComponent(symbol)}`, 'PUT', payload);
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ instrument: import('@valorgrid/contracts').Instrument }>}
 */
export function createInstrument(payload) {
  return sendJson('/api/instruments', 'POST', payload);
}

/**
 * @param {string[]} symbols
 * @returns {Promise<unknown>}
 */
export function deleteInstruments(symbols) {
  return sendJson('/api/instruments', 'DELETE', { symbols });
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ group: import('@valorgrid/contracts').InstrumentGroup }>}
 */
export function createInstrumentGroup(payload) {
  return sendJson('/api/instrument-groups', 'POST', payload);
}

// ── Transactions ──

/** @returns {Promise<{ transactions: import('@valorgrid/contracts').Transaction[] }>} */
export function fetchTransactions() {
  return fetchJson('/api/transactions');
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ transaction: import('@valorgrid/contracts').Transaction }>}
 */
export function createTransaction(payload) {
  return sendJson('/api/transactions', 'POST', payload);
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ preview: unknown }>}
 */
export function previewTransaction(payload) {
  return sendJson('/api/transactions/preview', 'POST', payload);
}

// ── Auto Plans ──

/** @returns {Promise<{ autoPlans: import('@valorgrid/contracts').AutoPlan[] }>} */
export function fetchAutoPlans() {
  return fetchJson('/api/auto-plans');
}

/**
 * @param {import('@valorgrid/contracts').AutoPlan[]} autoPlans
 * @returns {Promise<unknown>}
 */
export function saveAutoPlans(autoPlans) {
  return sendJson('/api/auto-plans', 'PUT', { autoPlans });
}

/**
 * @param {import('@valorgrid/contracts').AutoPlan[]} autoPlans
 * @returns {Promise<{ preview: unknown }>}
 */
export function previewAutoPlans(autoPlans) {
  return sendJson('/api/auto-plans/preview', 'POST', { autoPlans });
}

// ── Imports ──

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ preview: unknown }>}
 */
export function previewImport(payload) {
  return sendJson('/api/import/preview', 'POST', payload);
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<unknown>}
 */
export function commitImport(payload) {
  return sendJson('/api/import/commit', 'POST', payload, { timeoutMs: 60000 });
}

/** @returns {Promise<{ batches: import('@valorgrid/contracts').ImportBatch[] }>} */
export function fetchImportBatches() {
  return fetchJson('/api/import/batches');
}

/** @returns {Promise<{ entries: unknown[] }>} */
export function fetchImportRollbackLog() {
  return fetchJson('/api/import/rollback-log');
}

/**
 * @param {string} batchId
 * @returns {Promise<unknown>}
 */
export function rollbackImportBatch(batchId) {
  return sendJson(`/api/import/batches/${encodeURIComponent(batchId)}/rollback`, 'POST', {});
}

// ── Onboarding ──

/** @returns {Promise<import('@valorgrid/contracts').OnboardingStatus>} */
export function fetchOnboardingStatus() {
  return fetchJson('/api/onboarding/status');
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ preview: unknown }>}
 */
export function previewOnboarding(payload) {
  return sendJson('/api/onboarding/wizard/preview', 'POST', payload);
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<unknown>}
 */
export function commitOnboarding(payload) {
  return sendJson('/api/onboarding/wizard/commit', 'POST', payload, { timeoutMs: 30000 });
}

// ── Admin ──

/** @returns {Promise<Record<string, unknown>>} */
export function fetchVersion() {
  return fetchJson('/api/version');
}

/** @returns {Promise<{ backups: unknown[] }>} */
export function fetchBackups() {
  return fetchJson('/api/backups');
}

/** @returns {Promise<{ backup: unknown }>} */
export function createBackup() {
  return sendJson('/api/backups', 'POST', {});
}

/** @param {string} file */
export function deleteBackup(file) {
  return sendJson(`/api/backups/${encodeURIComponent(file)}`, 'DELETE', {});
}

/** @returns {Promise<unknown>} */
export function fetchDiagnostics() {
  return fetchJson('/api/diagnostics/performance');
}

/** @returns {Promise<{ quote: unknown }>} */
export function fetchQuote(symbol, date) {
  const params = new URLSearchParams({ symbol });
  if (date) params.set('date', date);
  return fetchJson(`/api/quote?${params.toString()}`);
}

// ── Preferences ──

/** @returns {Promise<{ preferences: Record<string, unknown>, editable: boolean }>} */
export function fetchUiPreferences() {
  return fetchJson('/api/preferences/ui');
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ preferences: Record<string, unknown> }>}
 */
export function saveUiPreferences(payload) {
  return sendJson('/api/preferences/ui', 'PUT', payload);
}

// ── Alpha Vantage ──

/** @returns {Promise<{ configured: boolean, mode: string, source: string|null, hint: string|null }>} */
export function fetchAlphaVantageStatus() {
  return fetchJson('/api/market-data/alpha-vantage/status');
}

/**
 * @param {string} apiKey
 * @returns {Promise<{ message: string }>}
 */
export function saveAlphaVantageKey(apiKey) {
  return sendJson('/api/market-data/alpha-vantage/key', 'POST', { apiKey });
}

/** @returns {Promise<{ message: string }>} */
export function deleteAlphaVantageKey() {
  return sendJson('/api/market-data/alpha-vantage/key', 'DELETE', {});
}
