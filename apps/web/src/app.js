/**
 * ValorGrid --- orquestador del frontend.
 * Carga todos los módulos de cliente en orden, inyecta ctx y arranca la UI.
 */

import { fetchBlob, fetchJson, normalizeErrorMessage, sendJson } from './api.js';
import { createApiClient } from './api-client.js';
import storage from './storage.js';
import { attach as attachState } from './state.js';
import { attach as attachI18n } from './i18n.js';
import { attach as attachDom } from './dom.js';
import { attach as attachConfirmDialog } from './confirm-dialog.js';
import { attach as attachDialogBehavior } from './dialog-behavior.js';
import { attach as attachFormat } from './format.js';
import { attach as attachLoadingOverlay } from './loading-overlay.js';
import { attach as attachCharts } from './charts.js';
import { attach as attachSummary } from './summary.js';
import { attach as attachMonthly } from './monthly.js';
import { attach as attachLedger } from './ledger.js';
import { attach as attachOperations } from './operations.js';
import { attach as attachLiquidity } from './liquidity.js';
import { attach as attachDashboard } from './dashboard.js';
import { attach as attachForms } from './forms.js';
import { attach as attachTransactionEditor } from './transaction-editor.js';
import { attach as attachOnboarding } from './onboarding.js';
import { attach as attachImports } from './imports.js';
import { attach as attachDividends } from './dividends.js';
import { attach as attachTheme } from './theme.js';
import { attach as attachPrivacy } from './privacy.js';
import { attach as attachHistory } from './history.js';
import { attach as attachHistoryPreferences } from './history-preferences.js';
import { attach as attachReturnBreakdownPreferences } from './return-breakdown-preferences.js';
import { attach as attachBulkActions } from './bulk-actions.js';
import { attach as attachInstrumentColors } from './instrument-colors.js';
import { attach as attachAlphaVantageSetup } from './alpha-vantage-setup.js';
import { attach as attachExtensions } from './extensions.js';
import { attach as attachAportaciones } from './aportaciones.js';
import { attach as attachUpdates } from './updates.js';
import { attach as attachEvents } from './events.js';

const ctx = {
  api: createApiClient({ fetchBlob, fetchJson, sendJson }),
  normalizeErrorMessage,
  window,
  document,
  localStorage: storage,
  Intl,
  Number,
  Date,
  Math,
  Promise,
  Set,
  Map,
};

[
  attachState,
  attachI18n,
  attachDom,
  attachLoadingOverlay,
  attachDialogBehavior,
  attachConfirmDialog,
  attachFormat,
  attachCharts,
  attachSummary,
  attachMonthly,
  attachLedger,
  attachOperations,
  attachLiquidity,
  attachDashboard,
  attachForms,
  attachTransactionEditor,
  attachTheme,
  attachHistory,
  attachOnboarding,
  attachImports,
  attachDividends,
  attachPrivacy,
  attachBulkActions,
  attachHistoryPreferences,
  attachReturnBreakdownPreferences,
  attachInstrumentColors,
  attachAlphaVantageSetup,
  attachExtensions,
  attachAportaciones,
  attachUpdates,
].forEach((attach) => attach(ctx));

await ctx.loadExtensions();

attachEvents(ctx);
ctx.initTheme();
ctx.initLanguage();
ctx.initBalancePrivacy();
ctx.initNegativePreference();
ctx.initLedgerPageSize();
ctx.initDateFormat();
ctx.initWeekStart();

async function runInitialLoad() {
  ctx.setBootState('loading');
  try {
    const [dashboardResult] = await Promise.allSettled([
      ctx.refreshDashboard({ throwOnError: true }),
      ctx.refreshHistory(),
    ]);
    if (dashboardResult.status === 'rejected') throw dashboardResult.reason;
    ctx.setBootState('ready');
  } catch (error) {
    ctx.setBootState('error', `No se pudieron cargar datos: ${ctx.normalizeErrorMessage(error)}`);
  }
}

ctx.runInitialLoad = runInitialLoad;
void runInitialLoad();
