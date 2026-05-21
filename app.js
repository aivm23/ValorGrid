import { fetchJson, normalizeErrorMessage, sendJson } from './client/api.js';
import { attach as attachState } from './client/state.js';
import { attach as attachDom } from './client/dom.js';
import { attach as attachFormat } from './client/format.js';
import { attach as attachCharts } from './client/charts.js';
import { attach as attachSummary } from './client/summary.js';
import { attach as attachMonthly } from './client/monthly.js';
import { attach as attachLedger } from './client/ledger.js';
import { attach as attachOperations } from './client/operations.js';
import { attach as attachDashboard } from './client/dashboard.js';
import { attach as attachForms } from './client/forms.js';
import { attach as attachOnboarding } from './client/onboarding.js';
import { attach as attachImports } from './client/imports.js';
import { attach as attachTheme } from './client/theme.js';
import { attach as attachPrivacy } from './client/privacy.js';
import { attach as attachHistory } from './client/history.js';
import { attach as attachEvents } from './client/events.js';

const ctx = { fetchJson, normalizeErrorMessage, sendJson, window, document, localStorage, Intl, Number, Date, Math, Promise, Set, Map };

[
  attachState, attachDom, attachFormat, attachCharts, attachSummary, attachMonthly,
  attachLedger, attachOperations, attachDashboard, attachForms, attachTheme, attachHistory,
  attachOnboarding, attachImports, attachPrivacy,
].forEach((attach) => attach(ctx));

attachEvents(ctx);
ctx.initTheme();
ctx.initBalancePrivacy();
ctx.refreshDashboard();
ctx.refreshHistory();
