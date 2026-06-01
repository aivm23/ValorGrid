const { assertCtxDeps, getCtxDep } = require('./ctx-utils');

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
    dateUtc,
    addDays,
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
    const transactions = getTransactions();
    const lotsBySymbol = new Map();
    let grossInvested = 0;
    let grossWithdrawn = 0;
    let commissions = 0;
    let netCashFlow = 0;
    let realizedGain = 0;

    for (const transaction of transactions) {
      const shares = Number(transaction.shares || 0);
      const valueEur = Number(transaction.valueEur || 0);
      const commissionEur = Number(transaction.commissionEur || 0);
      const cashFlowEur = Number(transaction.cashFlowEur || 0);
      commissions += commissionEur;
      netCashFlow += cashFlowEur;

      if (!lotsBySymbol.has(transaction.symbol)) lotsBySymbol.set(transaction.symbol, []);
      const lots = lotsBySymbol.get(transaction.symbol);

      if (transaction.type === 'add') {
        grossInvested += valueEur;
        lots.push({
          shares,
          cost: valueEur + commissionEur,
        });
        continue;
      }

      grossWithdrawn += valueEur;
      let remaining = shares;
      let costBasis = 0;
      while (remaining > 0.0000001 && lots.length) {
        const lot = lots[0];
        const consumed = Math.min(remaining, lot.shares);
        const ratio = lot.shares > 0 ? consumed / lot.shares : 0;
        costBasis += lot.cost * ratio;
        lot.shares -= consumed;
        lot.cost -= lot.cost * ratio;
        remaining -= consumed;
        if (lot.shares <= 0.0000001) lots.shift();
      }
      realizedGain += valueEur - commissionEur - costBasis;
    }

    const netContributed = -netCashFlow;
    const totalGain = Number(currentValue || 0) - netContributed;
    const unrealizedGain = totalGain - realizedGain;

    return {
      grossInvested,
      grossWithdrawn,
      commissions,
      netCashFlow,
      netContributed,
      realizedGain,
      unrealizedGain,
      totalGain,
      simpleReturnPct: netContributed > 0 ? (totalGain / netContributed) * 100 : null,
      transactionCount: transactions.length,
    };
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

  function weekdayNumber(dateValue) {
    const jsDay = dateUtc(dateValue).getUTCDay();
    return jsDay === 0 ? 7 : jsDay;
  }

  function nextWeekdayOnOrAfter(startDate, weekday) {
    const current = weekdayNumber(startDate);
    const diff = (weekday - current + 7) % 7;
    return addDays(startDate, diff);
  }

  function currentMonthScheduledDate(plan, today = getToday()) {
    const date = dateUtc(today);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(plan.day).padStart(2, '0')}`;
  }

  function effectiveAutoPlanStart(plan, today = getToday()) {
    if (plan.startDate) return plan.startDate;
    if ((plan.frequency || 'monthly') === 'monthly') return currentMonthScheduledDate(plan, today);
    return today;
  }

  function getAutoPlanScheduledDates(plan, toDate = getToday()) {
    const normalized = {
      ...plan,
      frequency: plan.frequency || 'monthly',
      day: plan.day || 1,
      weekday: plan.weekday || null,
    };
    const startDate = effectiveAutoPlanStart(normalized, toDate);
    if (!startDate || startDate > toDate) return [];
    const dates = [];

    if (normalized.frequency === 'daily') {
      for (let date = startDate; date <= toDate; date = addDays(date, 1)) dates.push(date);
      return dates;
    }

    if (normalized.frequency === 'weekly' || normalized.frequency === 'biweekly') {
      const step = normalized.frequency === 'biweekly' ? 14 : 7;
      for (let date = nextWeekdayOnOrAfter(startDate, Number(normalized.weekday)); date <= toDate; date = addDays(date, step)) {
        dates.push(date);
      }
      return dates;
    }

    const start = dateUtc(startDate);
    const end = dateUtc(toDate);
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
      const startMonth = year === start.getUTCFullYear() ? start.getUTCMonth() + 1 : 1;
      const endMonth = year === end.getUTCFullYear() ? end.getUTCMonth() + 1 : 12;
      for (let month = startMonth; month <= endMonth; month += 1) {
        const scheduledDate = `${year}-${String(month).padStart(2, '0')}-${String(normalized.day).padStart(2, '0')}`;
        if (scheduledDate >= startDate && scheduledDate <= toDate) dates.push(scheduledDate);
      }
    }
    return dates;
  }

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
      const scheduledDates = plan.enabled ? getAutoPlanScheduledDates(plan, toDate) : [];
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

  function getPositionShares(symbol, asOfDate = null) {
    const instrument = getInstrument(symbol);
    if (!instrument) return 0;

    const transactions = listTransactionSharesForSymbol(instrument.symbol, asOfDate);

    return transactions.reduce(
      (shares, transaction) => shares + transactionSign(transaction.type) * Number(transaction.shares),
      Number(instrument.base_shares || 0),
    );
  }

  function getStockColorsUsed() { return new Set(listStockColors()); }

  async function createTransaction(input, options = {}) {
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
    const type = input.type === 'remove' ? 'remove' : 'add';
    const symbolInput = normalizeSymbol(input.symbol || input.ticker);
    const date = input.date || getToday();
    const hasEuros = Number.isFinite(Number(input.euros)) && Number(input.euros) > 0;
    const hasShares = Number.isFinite(Number(input.shares)) && Number(input.shares) > 0;

    if (!symbolInput) throw new Error('Missing symbol');
    if (hasEuros === hasShares) throw new Error('Provide euros or shares, but not both');

    const quote = await getQuoteForSymbol(symbolInput, date);
    const fxToEur = (await getFxToEur(quote.currency, quote.marketDate || date)) ?? 1;
    const priceEur = toEur(quote.price, quote.currency, fxToEur);
    const shares = hasShares ? Number(input.shares) : Number(input.euros) / priceEur;
    const valueEur = hasEuros ? Number(input.euros) : shares * priceEur;
    const commissionEur = Number.isFinite(Number(input.commissionEur ?? input.commission))
      ? Math.abs(Number(input.commissionEur ?? input.commission))
      : 0;
    const cashFlowEur = type === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur);
    const existingInstrument = getInstrumentByInput(symbolInput);
    const instrument =
      existingInstrument ||
      (type === 'add'
        ? {
            symbol: quote.symbol || symbolInput,
            name: quote.symbol || symbolInput,
            color: stockColors[getStockColorsUsed().size % stockColors.length],
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
    getAutoPlanScheduledDates,
    autoKeyForPlan,
    autoPlanExists,
    previewAutoPlanExecutions,
    getPositionShares,
    getStockColorsUsed,
    createTransaction,
    previewTransaction,
    deleteTransaction,
    isAutoPlanSkipped,
  });
};
