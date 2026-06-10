/**
 * ValorGrid --- orquestador del frontend.
 * Carga todos los módulos de cliente en orden, inyecta ctx y arranca la UI.
 */

import { fetchJson, normalizeErrorMessage, sendJson } from './api.js';
import { attach as attachState } from './state.js';
import { attach as attachDom } from './dom.js';
import { attach as attachFormat } from './format.js';
import { attach as attachCharts } from './charts.js';
import { attach as attachSummary } from './summary.js';
import { attach as attachMonthly } from './monthly.js';
import { attach as attachLedger } from './ledger.js';
import { attach as attachOperations } from './operations.js';
import { attach as attachDashboard } from './dashboard.js';
import { attach as attachForms } from './forms.js';
import { attach as attachOnboarding } from './onboarding.js';
import { attach as attachImports } from './imports.js';
import { attach as attachTheme } from './theme.js';
import { attach as attachPrivacy } from './privacy.js';
import { attach as attachHistory } from './history.js';
import { attach as attachBulkActions } from './bulk-actions.js';
import { attach as attachEvents } from './events.js';

const ctx = { fetchJson, normalizeErrorMessage, sendJson, window, document, localStorage, Intl, Number, Date, Math, Promise, Set, Map };

[
  attachState, attachDom, attachFormat, attachCharts, attachSummary, attachMonthly,
  attachLedger, attachOperations, attachDashboard, attachForms, attachTheme, attachHistory,
  attachOnboarding, attachImports, attachPrivacy, attachBulkActions,
].forEach((attach) => attach(ctx));

attachEvents(ctx);
ctx.initTheme();
ctx.initBalancePrivacy();
ctx.initNegativePreference();
ctx.initLedgerPageSize();
ctx.initDateFormat();
ctx.initWeekStart();
ctx.refreshDashboard();
ctx.refreshHistory();
