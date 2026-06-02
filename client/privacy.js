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
  });
}
