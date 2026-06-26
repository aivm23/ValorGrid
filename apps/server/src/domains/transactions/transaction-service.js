const { assertCtxDeps, getCtxDep } = require('../../platform/ctx-utils');
const { resolveFxToEur } = require('./transaction-pricing');
const { buildLedgerAnalyticsFromTransactions } = require('./transaction-analytics');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'getToday',
      'normalizeSymbol',
      'getInstrument',
      'dateUtc',
      'addDays',
      'transactionSign',
      'ensureInstrument',
      'getQuoteForSymbol',
      'getFxToEur',
      'toEur',
      'getInstrumentByInput',
      'stockColors',
      'invalidateLedger',
    ],
    'transaction-service',
  );

  const {
    repositories,
    getToday,
    normalizeSymbol,
    getInstrument,
    transactionSign,
    ensureInstrument,
    getQuoteForSymbol,
    getFxToEur,
    toEur,
    getInstrumentByInput,
    stockColors,
    invalidateLedger,
  } = ctx;

  const transactionRepository = repositories.transactions;
  if (!transactionRepository) {
    throw new Error('transaction-service requires ctx.repositories.transactions');
  }

  const {
    listTransactions,
    listAutoPlans,
    replaceAutoPlansInStorage,
    transactionExistsByAutoKey,
    listTransactionSharesForSymbol,
    listStockColors,
    insertTransactionRow,
    findTransactionForDelete,
    deleteTransactionById,
    insertAutoPlanSkip,
    autoPlanSkipExists,
  } = transactionRepository;

  function getTransactions() { return listTransactions(); }

  function getAutoPlans() {
    return listAutoPlans().map((plan) => ({
      ...plan,
      enabled: Boolean(plan.enabled),
      frequency: plan.frequency || 'monthly',
      day: plan.frequency === 'monthly' || !plan.frequency ? Number(plan.day) : null,
      weekday: plan.weekday === null || plan.weekday === undefined ? null : Number(plan.weekday),
    }));
  }

  function buildLedgerAnalytics(currentValue = 0) {
    return buildLedgerAnalyticsFromTransactions(getTransactions(), currentValue);
  }

  async function buildPortfolioPerformance() {
    const summary = await getCtxDep(ctx, 'buildSummary', 'transaction-service')();
    const analytics = buildLedgerAnalytics(summary.total);
    return {
      updatedAt: summary.updatedAt,
      currentValue: summary.total,
      ...analytics,
    };
  }

  function replaceAutoPlans(plans) {
    const { plans: normalizedPlans, warnings } = applyAutoPlanEditPolicy(normalizeAutoPlans(plans));
    const invalidationDate =
      normalizedPlans
        .map((plan) => plan.startDate)
        .filter(Boolean)
        .sort()[0] || getToday();

    replaceAutoPlansInStorage(normalizedPlans);
    invalidateLedger(invalidationDate, 'auto-plans');
    return { warnings };
  }

  function autoPlanFrequency(value) {
    if (value === '') throw new Error('Auto plan frequency is required');
    const frequency = String(value || 'monthly').trim().toLowerCase();
    if (!['daily', 'weekly', 'biweekly', 'monthly'].includes(frequency)) {
      throw new Error('Invalid auto plan frequency');
    }
    return frequency;
  }

  function isIsoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }

  function normalizeAutoPlans(plans) {
    const seen = new Set();
    return (plans || []).map((plan) => {
      const symbol = normalizeSymbol(plan.symbol);
      if (!symbol) throw new Error('Plan symbol is required');
      if (seen.has(symbol)) throw new Error(`Duplicate auto plan for ${symbol}`);
      seen.add(symbol);

      const instrument = getInstrument(symbol);
      if (!instrument) throw new Error(`Instrument not found: ${symbol}`);
      if (instrument.type === 'fx') throw new Error('FX instruments cannot have auto plans');

      const amountEur = Number(plan.amountEur);
      const frequency = autoPlanFrequency(plan.frequency);
      const day = frequency === 'monthly' ? Number(plan.day) : 1;
      const weekday = ['weekly', 'biweekly'].includes(frequency) ? Number(plan.weekday) : null;
      const startDate = String(plan.startDate || plan.start_date || '').trim() || null;
      if (!Number.isFinite(amountEur) || amountEur <= 0) throw new Error('Auto plan amount must be greater than 0');
      if (frequency === 'monthly' && (!Number.isInteger(day) || day < 1 || day > 28)) {
        throw new Error('Auto plan day must be between 1 and 28');
      }
      if (['weekly', 'biweekly'].includes(frequency) && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
        throw new Error('Auto plan weekday must be between 1 and 7');
      }
      if (startDate && !isIsoDate(startDate)) throw new Error('Auto plan startDate must use YYYY-MM-DD');

      return {
        symbol: instrument.symbol,
        amountEur,
        day,
        frequency,
        weekday,
        enabled: Boolean(plan.enabled),
        startDate,
      };
    });
  }
  function autoPlanMateriallyChanged(previous, next) {
    if (!previous) return false;
    const previousFrequency = previous.frequency || 'monthly';
    const nextFrequency = next.frequency || 'monthly';
    const previousDay = previousFrequency === 'monthly' ? Number(previous.day || 1) : null;
    const nextDay = nextFrequency === 'monthly' ? Number(next.day || 1) : null;
    const previousWeekday = ['weekly', 'biweekly'].includes(previousFrequency) ? Number(previous.weekday || 0) : null;
    const nextWeekday = ['weekly', 'biweekly'].includes(nextFrequency) ? Number(next.weekday || 0) : null;

    return (
      Number(previous.amountEur) !== Number(next.amountEur) ||
      previousFrequency !== nextFrequency ||
      previousDay !== nextDay ||
      previousWeekday !== nextWeekday ||
      Boolean(previous.enabled) !== Boolean(next.enabled) ||
      String(previous.startDate || '') !== String(next.startDate || '')
    );
  }
  function applyAutoPlanEditPolicy(plans, today = getToday()) {
    const currentPlans = new Map(getAutoPlans().map((plan) => [plan.symbol, plan]));
    const warnings = [];
    const adjusted = plans.map((plan) => {
      const previous = currentPlans.get(plan.symbol);
      if (!previous || !plan.enabled || !autoPlanMateriallyChanged(previous, plan)) return plan;
      if (plan.startDate && plan.startDate >= today) return plan;

      warnings.push({
        symbol: plan.symbol,
        previousStartDate: plan.startDate || null,
        startDate: today,
        message: `${plan.symbol}: los cambios del plan se aplican desde ${today}; no se recalculan aportaciones anteriores.`,
      });
      return { ...plan, startDate: today };
    });

    return { plans: adjusted, warnings };
  }

  function getPositionShares(symbol, asOfDate = null) {
    const instrument = getInstrument(symbol);
    if (!instrument) return 0;

    const transactions = listTransactionSharesForSymbol(instrument.symbol, asOfDate);

    return transactions.reduce(
      (shares, transaction) => shares + transactionSign(transaction.type) * Number(transaction.shares),
      Number(instrument.base_shares || 0),
    );
  }

  async function createTransaction(input, options = {}) {
    if (input.type === 'dividend') {
      throw new Error('Los dividendos se generan desde eventos de Yahoo Finance. En esta versión no se pueden crear manualmente.');
    }
    const preview = await previewTransaction(input);
    const instrument = preview.type === 'add' ? ensureInstrument(preview.symbol, preview.quote) : preview.instrument;

    const id = input.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const origin = options.origin || input.origin || 'manual';
    const autoKey = options.autoKey || input.autoKey || null;

    insertTransactionRow({
      id,
      type: preview.type,
      symbol: instrument.symbol,
      name: instrument.name,
      date: preview.date,
      marketDate: preview.marketDate,
      shares: preview.shares,
      valueEur: preview.valueEur,
      price: preview.price,
      currency: preview.currency,
      fxToEur: preview.fxToEur,
      commissionEur: preview.commissionEur,
      cashFlowEur: preview.cashFlowEur,
      color: instrument.color,
      origin,
      autoKey,
    });
    invalidateLedger(preview.date, 'transaction-create');
    return getTransactions().find((transaction) => transaction.id === id);
  }

  async function previewTransaction(input) {
    if (input.type === 'dividend') {
      throw new Error('Los dividendos se generan desde eventos de Yahoo Finance. En esta versión no se pueden crear manualmente.');
    }
    const type = input.type === 'remove' ? 'remove' : 'add';
    const symbolInput = normalizeSymbol(input.symbol || input.ticker);
    const date = input.date || getToday();
    const hasEuros = Number.isFinite(Number(input.euros)) && Number(input.euros) > 0;
    const hasShares = Number.isFinite(Number(input.shares)) && Number(input.shares) > 0;
    const manualUnitPrice = Number.isFinite(Number(input.unitPrice)) && Number(input.unitPrice) > 0;

    if (!symbolInput) throw new Error('Missing symbol');

    const existingInstrument = getInstrumentByInput(symbolInput);

    if (manualUnitPrice) {
      if (!existingInstrument) {
        throw new Error('Manual unit price requires an existing instrument');
      }
      if (hasEuros) {
        throw new Error('unitPrice cannot be combined with euros');
      }
      if (!hasShares) {
        throw new Error('unitPrice requires shares');
      }

      const instrument = existingInstrument;
      const currency = instrument.currency || 'EUR';
      const fxToEur = await resolveFxToEur({ currency, date, inputFxToEur: input.fxToEur ?? input.fx_to_eur, getFxToEur });
      const priceEur = toEur(input.unitPrice, currency, fxToEur);
      const shares = Number(input.shares);
      const valueEur = shares * priceEur;
      const commissionEur = Number.isFinite(Number(input.commissionEur ?? input.commission))
        ? Math.abs(Number(input.commissionEur ?? input.commission))
        : 0;
      const cashFlowEur = type === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur);

      if (type === 'remove') {
        const available = getPositionShares(instrument.symbol, date);
        if (shares > available + 0.0000001) {
          throw new Error(`Not enough shares. Available: ${available.toFixed(6)}`);
        }
      }

      return {
        type,
        date,
        symbol: instrument.symbol,
        name: instrument.name,
        marketDate: date,
        shares,
        valueEur,
        price: input.unitPrice,
        priceEur,
        currency,
        fxToEur,
        commissionEur,
        cashFlowEur,
        instrument,
        quote: null,
        manualUnitPrice: true,
      };
    }
    if (hasEuros === hasShares) throw new Error('Provide euros or shares, but not both');

    const quote = await getQuoteForSymbol(symbolInput, date);
    const fxToEur = await resolveFxToEur({ currency: quote.currency, date: quote.marketDate || date, getFxToEur });
    const priceEur = toEur(quote.price, quote.currency, fxToEur);
    const shares = hasShares ? Number(input.shares) : Number(input.euros) / priceEur;
    const valueEur = hasEuros ? Number(input.euros) : shares * priceEur;
    const commissionEur = Number.isFinite(Number(input.commissionEur ?? input.commission))
      ? Math.abs(Number(input.commissionEur ?? input.commission))
      : 0;
    const cashFlowEur = type === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur);
    const instrument =
      existingInstrument ||
      (type === 'add'
        ? {
            symbol: quote.symbol || symbolInput,
            name: quote.symbol || symbolInput,
            color: stockColors[new Set(listStockColors()).size % stockColors.length],
          }
        : null);

    if (!instrument) {
      throw new Error('Only stored symbols can be removed');
    }

    if (type === 'remove') {
      const available = getPositionShares(instrument.symbol, date);
      if (shares > available + 0.0000001) {
        throw new Error(`Not enough shares. Available: ${available.toFixed(6)}`);
      }
    }

    return {
      type,
      date,
      symbol: instrument.symbol,
      name: instrument.name,
      marketDate: quote.marketDate || date,
      shares,
      valueEur,
      price: quote.price,
      priceEur,
      currency: quote.currency,
      fxToEur,
      commissionEur,
      cashFlowEur,
      instrument,
      quote,
      manualUnitPrice: false,
    };
  }

  function deleteTransaction(id) {
    const transaction = findTransactionForDelete(id);
    if (!transaction) return false;

    const result = deleteTransactionById(id);
    if (result.changes > 0 && transaction.autoKey) {
      insertAutoPlanSkip(transaction.autoKey);
    }
    if (result.changes > 0) invalidateLedger(transaction.date, 'transaction-delete');
    return result.changes > 0;
  }
  function bulkDeleteTransactions(ids) {
    if (!ids || !ids.length) return 0;
    const validIds = ids.filter((id) => {
      const t = findTransactionForDelete(id);
      return t != null;
    });
    let deleted = 0;
    for (const id of validIds) {
      const transaction = findTransactionForDelete(id);
      if (!transaction) continue;
      const result = deleteTransactionById(id);
      if (result.changes > 0 && transaction.autoKey) {
        insertAutoPlanSkip(transaction.autoKey);
      }
      if (result.changes > 0) invalidateLedger(transaction.date, 'transaction-delete');
      deleted += result.changes;
    }
    return deleted;
  }
  function isAutoPlanSkipped(autoKey) {
    if (autoPlanSkipExists(autoKey)) return true;
    const parts = autoKey.split(':');
    if (parts.length === 3 && parts[0] === 'auto') {
      const symbol = parts[1];
      const date = parts[2];
      const monthKey = date.slice(0, 7);
      const legacyKey = `auto:${monthKey}:${symbol}`;
      return autoPlanSkipExists(legacyKey);
    }
    return false;
  }
  Object.assign(ctx, {
    getTransactions,
    getAutoPlans,
    buildLedgerAnalytics,
    buildPortfolioPerformance,
    replaceAutoPlans,
    autoPlanFrequency,
    normalizeAutoPlans,
    autoPlanMateriallyChanged,
    applyAutoPlanEditPolicy,
    getAutoPlanScheduledDates: ctx.getAutoPlanScheduledDates,
    autoKeyForPlan,
    autoPlanExists,
    previewAutoPlanExecutions,
    getPositionShares,
    createTransaction,
    previewTransaction,
    deleteTransaction,
    bulkDeleteTransactions,
    isAutoPlanSkipped,
  });
  function autoKeyForPlan(plan, scheduledDate) { return `auto:${plan.symbol}:${scheduledDate}`; }
  function autoPlanExists(autoKey) {
    if (transactionExistsByAutoKey(autoKey)) return true;
    const parts = autoKey.split(':');
    if (parts.length === 3 && parts[0] === 'auto') {
      const symbol = parts[1];
      const date = parts[2];
      const monthKey = date.slice(0, 7);
      const legacyKey = `auto:${monthKey}:${symbol}`;
      return transactionExistsByAutoKey(legacyKey);
    }
    return false;
  }
  function previewAutoPlanExecutions(plans, toDate = getToday()) {
    const { plans: normalizedPlans, warnings } = applyAutoPlanEditPolicy(normalizeAutoPlans(plans), toDate);
    const items = normalizedPlans.map((plan) => {
      const scheduledDates = plan.enabled ? ctx.getAutoPlanScheduledDates(plan, toDate) : [];
      const pendingDates = scheduledDates.filter((scheduledDate) => {
        const autoKey = autoKeyForPlan(plan, scheduledDate);
        return !autoPlanExists(autoKey) && !isAutoPlanSkipped(autoKey);
      });
      return {
        symbol: plan.symbol,
        frequency: plan.frequency,
        amountEur: plan.amountEur,
        pendingCount: pendingDates.length,
        firstDate: pendingDates[0] || null,
        lastDate: pendingDates[pendingDates.length - 1] || null,
        estimatedTotalEur: pendingDates.length * plan.amountEur,
      };
    });
    return {
      plans: items,
      pendingCount: items.reduce((sum, item) => sum + item.pendingCount, 0),
      estimatedTotalEur: items.reduce((sum, item) => sum + item.estimatedTotalEur, 0),
      warnings,
    };
  }
};
