export function attach(ctx) {
  function formatCurrency(value) {
    if (ctx.state.hideBalances) return '••••';
    return Number.isFinite(value) ? ctx.eurFormatter.format(value) : 'Pendiente';
  }

  function formatDate(value) {
    if (!value) return 'sin fecha';
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function formatPlainDate(value) {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
  }

  function todayInputValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
  }

  function addYears(dateValue, years) {
    const date = new Date(`${dateValue}T00:00:00`);
    date.setFullYear(date.getFullYear() + years);
    return date.toISOString().slice(0, 10);
  }

  function requestedHistoryStart(range, toDate) {
    if (range === 'all') return null;
    if (range === 'ytd') return `${toDate.slice(0, 4)}-01-01`;
    return addYears(toDate, -ctx.historyRangeConfig[range].years);
  }

  function canReuseHistoryForRange(history, targetRange) {
    const target = ctx.historyRangeConfig[targetRange];
    if (!history || !target || history.granularity !== target.granularity) return false;
    if (history.range === targetRange) return true;

    const targetStart = requestedHistoryStart(targetRange, history.to);
    if (!targetStart) {
      const sourceStart = requestedHistoryStart(history.range, history.to);
      return !sourceStart || history.from > sourceStart;
    }

    return history.from >= targetStart;
  }

  function historyForRange(history, range) {
    return history.range === range ? history : { ...history, range };
  }

  function getCachedHistory(range) {
    const exact = ctx.state.historyCache[range];
    if (exact?.range === range) return exact;
    return null;
  }

  function cacheHistory(history) {
    ctx.state.historyCache[history.range] = history;
  }

  function clientRequestId(prefix = 'client') {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function findTransactionById(id) {
    if (!id) return null;
    const data = await ctx.fetchJson('/api/transactions', { timeoutMs: 15000 });
    return (data.transactions || []).find((transaction) => transaction.id === id) || null;
  }

  function formatShares(item) {
    return formatShareNumber(item.shares || 0);
  }

  function formatShareNumber(value) {
    if (ctx.state.hideBalances) return '••••';
    const shares = Number(value || 0);
    return Number.isFinite(shares) ? ctx.sharesFormatter.format(shares) : '0';
  }

  function assetColor(symbol, fallback) {
    return ctx.assetColors[symbol] || fallback || '#16a34a';
  }

  function withAssetColors(items) {
    return (items || []).map((item) => ({ ...item, color: assetColor(item.symbol, item.color) }));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatPercent(value) {
    return Number.isFinite(Number(value))
      ? `${Number(value).toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`
      : 'sin datos';
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024 * 1024) return `${(size / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} KB`;
    return `${(size / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
  }

  Object.assign(ctx, {
    formatCurrency,
    formatDate,
    formatDateTime,
    formatPlainDate,
    todayInputValue,
    addYears,
    requestedHistoryStart,
    canReuseHistoryForRange,
    historyForRange,
    getCachedHistory,
    cacheHistory,
    clientRequestId,
    findTransactionById,
    formatShares,
    formatShareNumber,
    assetColor,
    withAssetColors,
    escapeHtml,
    formatPercent,
    formatFileSize,
  });
}
