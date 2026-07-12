export function attach(ctx) {
  function formatCurrency(value) {
    if (ctx.state.hideBalances) return '••••';
    return Number.isFinite(value) ? ctx.eurFormatter.format(value) : ctx.t?.('format.pending') || 'Pendiente';
  }

  function moneyClass(value) {
    return ctx.state.negativeRed !== false && Number(value) < 0 ? 'is-negative' : '';
  }

  function formatCurrencySpan(value) {
    return `<span class="${moneyClass(value)}">${formatCurrency(Number(value || 0))}</span>`;
  }

  function dateLocale() {
    if (ctx.state.dateFormat === 'mm/dd/yyyy') return 'en-US';
    return typeof ctx.locale === 'function' ? ctx.locale() : 'es-ES';
  }

  function weekdayOptions(selectedValue) {
    const all = [
      { value: '1', label: 'Lunes' },
      { value: '2', label: 'Martes' },
      { value: '3', label: 'Miércoles' },
      { value: '4', label: 'Jueves' },
      { value: '5', label: 'Viernes' },
      { value: '6', label: 'Sábado' },
      { value: '7', label: 'Domingo' },
    ];
    const ordered = ctx.state.weekStart === 'sunday' ? [all[6], all[0], all[1], all[2], all[3], all[4], all[5]] : all;
    return ordered
      .map((d) => {
        const sel = String(selectedValue) === d.value ? ' selected' : '';
        return `<option value="${d.value}"${sel}>${escapeHtml(ctx.t?.(d.label) || d.label)}</option>`;
      })
      .join('');
  }

  function formatDate(value) {
    if (!value) return ctx.t?.('format.noDate') || 'sin fecha';
    return new Intl.DateTimeFormat(dateLocale(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat(dateLocale(), {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function formatPlainDate(value) {
    return new Intl.DateTimeFormat(dateLocale(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
  }

  function todayInputValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(
      2,
      '0',
    )}`;
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
    const data = await ctx.api.transactions.list({ timeoutMs: 15000 });
    return (data.transactions || []).find((transaction) => transaction.id === id) || null;
  }

  function formatShares(item) {
    return formatShareNumber(item.shares || 0);
  }

  function instrumentTypeForSymbol(symbol) {
    if (!symbol) return '';
    const normalized = String(symbol).trim().toUpperCase();
    const instrument = (ctx.state.instruments || []).find(
      (item) => String(item.symbol || '').toUpperCase() === normalized,
    );
    return instrument?.type || '';
  }

  function resolveQuantityType(input) {
    if (typeof input === 'string') return input;
    if (!input || typeof input !== 'object') return '';
    if (input.instrumentType) return input.instrumentType;
    const txTypes = new Set(['add', 'remove', 'dividend']);
    if (input.type && !txTypes.has(input.type)) return input.type;
    return instrumentTypeForSymbol(input.symbol);
  }

  function instrumentQuantityLabel(input) {
    const type = String(resolveQuantityType(input) || '').toLowerCase();
    if (type === 'stock' || type === 'etf') return ctx.t?.('format.quantity.shares') || 'acciones';
    if (type === 'crypto' || type === 'commodity') return ctx.t?.('format.quantity.units') || 'unidades';
    return ctx.t?.('format.quantity.generic') || 'cantidad';
  }

  function formatInstrumentQuantity(value, input) {
    return `${formatShareNumber(value)} ${instrumentQuantityLabel(input)}`;
  }

  function formatShareNumber(value) {
    if (ctx.state.hideBalances) return '••••';
    const shares = Number(value || 0);
    if (!Number.isFinite(shares)) return '0';
    const hasExtraPrecision = ((shares % 1) * 100) % 1 !== 0;
    const formatter = hasExtraPrecision ? ctx.cryptoSharesFormatter : ctx.sharesFormatter;
    return formatter.format(shares);
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
      ? `${Number(value).toLocaleString(typeof ctx.locale === 'function' ? ctx.locale() : 'es-ES', { maximumFractionDigits: 2 })}%`
      : ctx.t?.('sin datos') || 'sin datos';
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    const locale = typeof ctx.locale === 'function' ? ctx.locale() : 'es-ES';
    if (size < 1024 * 1024) return `${(size / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`;
    return `${(size / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  }

  Object.assign(ctx, {
    formatCurrency,
    moneyClass,
    formatCurrencySpan,
    formatDate,
    formatDateTime,
    formatPlainDate,
    weekdayOptions,
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
    instrumentTypeForSymbol,
    instrumentQuantityLabel,
    formatInstrumentQuantity,
    formatShareNumber,
    assetColor,
    withAssetColors,
    escapeHtml,
    formatPercent,
    formatFileSize,
  });
}
