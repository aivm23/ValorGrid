export function attach(ctx) {
  const visibleFormatter = ctx.formatCurrency;
  const maskedValue = '••••';

  function applyBalanceVisibility(hidden) {
    ctx.state.hideBalances = Boolean(hidden);
    ctx.document.documentElement.dataset.balances = ctx.state.hideBalances ? 'hidden' : 'visible';
    ctx.localStorage.setItem('portfolio-hide-balances', ctx.state.hideBalances ? '1' : '0');

    const label = ctx.state.hideBalances ? 'Mostrar saldos' : 'Ocultar saldos';
    ctx.elements.balanceToggle.setAttribute('aria-label', label);
    ctx.elements.balanceToggle.setAttribute('title', label);
    ctx.elements.balanceToggle.classList.toggle('is-hidden', ctx.state.hideBalances);
  }

  function initBalancePrivacy() {
    applyBalanceVisibility(ctx.localStorage.getItem('portfolio-hide-balances') === '1');
  }

  function applyNegativePreference(enabled) {
    ctx.state.negativeRed = enabled !== false;
    ctx.document.documentElement.dataset.negativeRed = ctx.state.negativeRed ? 'true' : 'false';
    ctx.localStorage.setItem('valorgrid-negative-red', ctx.state.negativeRed ? '1' : '0');
    if (ctx.elements.negativeRedToggle) ctx.elements.negativeRedToggle.checked = ctx.state.negativeRed;
  }

  function initNegativePreference() {
    applyNegativePreference(ctx.localStorage.getItem('valorgrid-negative-red') !== '0');
  }

  function toggleNegativePreference(event) {
    applyNegativePreference(Boolean(event.target.checked));
  }

  function toggleBalanceVisibility() {
    applyBalanceVisibility(!ctx.state.hideBalances);
    if (ctx.state.summary) ctx.renderDashboard();
    if (ctx.state.history) ctx.renderHistory();
  }

  function applyLedgerPageSize(size) {
    const pageSize = Number(size) || 1000;
    ctx.state.ledgerPageSize = pageSize;
    ctx.localStorage.setItem('valorgrid-ledger-page-size', String(pageSize));
    if (ctx.elements.ledgerPageSize) ctx.elements.ledgerPageSize.value = String(pageSize);
    if (ctx.state.transactions) ctx.renderLedger();
  }

  function initLedgerPageSize() {
    const saved = ctx.localStorage.getItem('valorgrid-ledger-page-size');
    applyLedgerPageSize(saved || 1000);
  }

  function handleLedgerPageSizeChange(event) {
    applyLedgerPageSize(event.target.value);
  }

  function applyDateFormat(format) {
    const valid = format === 'dd/mm/yyyy' || format === 'mm/dd/yyyy' ? format : 'dd/mm/yyyy';
    ctx.state.dateFormat = valid;
    ctx.localStorage.setItem('valorgrid-date-format', valid);
    if (ctx.elements.dateFormatSelect) ctx.elements.dateFormatSelect.value = valid;
  }

  function initDateFormat() {
    applyDateFormat(ctx.localStorage.getItem('valorgrid-date-format') || 'dd/mm/yyyy');
  }

  function handleDateFormatChange(event) {
    applyDateFormat(event.target.value);
    ctx.refreshDashboard();
  }

  function applyWeekStart(day) {
    const valid = day === 'monday' || day === 'sunday' ? day : 'monday';
    ctx.state.weekStart = valid;
    ctx.localStorage.setItem('valorgrid-week-start', valid);
    if (ctx.elements.weekStartSelect) ctx.elements.weekStartSelect.value = valid;
    const lang = valid === 'sunday' ? 'en-US' : 'es';
    ctx.document.querySelectorAll('input[type="date"]').forEach((input) => {
      input.lang = lang;
    });
  }

  function initWeekStart() {
    applyWeekStart(ctx.localStorage.getItem('valorgrid-week-start') || 'monday');
  }

  function handleWeekStartChange(event) {
    applyWeekStart(event.target.value);
    ctx.refreshDashboard();
  }

  ctx.formatCurrency = function formatCurrencyWithPrivacy(value) {
    return ctx.state.hideBalances ? maskedValue : visibleFormatter(value);
  };

  Object.assign(ctx, {
    applyBalanceVisibility,
    initBalancePrivacy,
    toggleBalanceVisibility,
    applyNegativePreference,
    initNegativePreference,
    toggleNegativePreference,
    applyLedgerPageSize,
    initLedgerPageSize,
    handleLedgerPageSizeChange,
    applyDateFormat,
    initDateFormat,
    handleDateFormatChange,
    applyWeekStart,
    initWeekStart,
    handleWeekStartChange,
  });
}
