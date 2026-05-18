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

  function toggleBalanceVisibility() {
    applyBalanceVisibility(!ctx.state.hideBalances);
    if (ctx.state.summary) ctx.renderDashboard();
    if (ctx.state.history) ctx.renderHistory();
  }

  ctx.formatCurrency = function formatCurrencyWithPrivacy(value) {
    return ctx.state.hideBalances ? maskedValue : visibleFormatter(value);
  };

  Object.assign(ctx, { applyBalanceVisibility, initBalancePrivacy, toggleBalanceVisibility });
}
