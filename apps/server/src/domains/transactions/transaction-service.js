const { assertCtxDeps, getCtxDep } = require('../../platform/ctx-utils');
const { resolveFxToEur } = require('./transaction-pricing');
const { normalizeEntryMode, validateTransactionAmountInput } = require('./transaction-entry-modes');
const { buildLedgerAnalyticsFromTransactions } = require('./transaction-analytics');
const { calculateSharesWithSplits } = require('../corporate-actions/corporate-action-timeline');
const { createTransactionEditor, normalizeTransactionNote } = require('./transaction-editor');
const { createAutoPlanPolicy } = require('./auto-plan-policy');
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
  const corporateActionRepository = repositories.corporateActions || {};
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
    updateTransactionEconomics,
    deleteTransactionById,
    insertAutoPlanSkip,
    autoPlanSkipExists,
  } = transactionRepository;
  const listSplitsForSymbolUntil = corporateActionRepository.listSplitsForSymbolUntil || (() => []);
  const listSplitsUntil = corporateActionRepository.listSplitsUntil || (() => []);

  const { previewTransactionEdit, updateTransaction } = createTransactionEditor({
    getTransactions,
    getInstrument,
    transactionSign,
    listSplitsForSymbolUntil,
    updateTransactionEconomics,
    invalidateLedger,
  });
  const { autoPlanFrequency, normalizeAutoPlans, autoPlanMateriallyChanged, applyAutoPlanEditPolicy } =
    createAutoPlanPolicy({ normalizeSymbol, getInstrument, getAutoPlans, getToday });

  function getTransactions() {
    return listTransactions();
  }
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
    return buildLedgerAnalyticsFromTransactions(getTransactions(), currentValue, listSplitsUntil());
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

  function getPositionShares(symbol, asOfDate = null, pendingTransactions = []) {
    const instrument = getInstrument(symbol);
    if (!instrument) return 0;

    const transactions = [
      ...listTransactionSharesForSymbol(instrument.symbol, asOfDate),
      ...(pendingTransactions || [])
        .filter((transaction) => String(transaction.symbol || '').toUpperCase() === instrument.symbol)
        .filter((transaction) => !asOfDate || transaction.date <= asOfDate),
    ];
    return calculateSharesWithSplits({
      baseShares: Number(instrument.base_shares || 0),
      transactions,
      splits: listSplitsForSymbolUntil(instrument.symbol, asOfDate),
      transactionSign,
    });
  }

  async function createTransaction(input, options = {}) {
    if (input.type === 'dividend') {
      throw new Error(
        'Los dividendos se generan desde eventos de Yahoo Finance. En esta versión no se pueden crear manualmente.',
      );
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
      note: normalizeTransactionNote(input.note),
      color: instrument.color,
      origin,
      autoKey,
    });
    invalidateLedger(preview.date, 'transaction-create');
    return getTransactions().find((transaction) => transaction.id === id);
  }

  async function previewTransaction(input) {
    if (input.type === 'dividend') {
      throw new Error(
        'Los dividendos se generan desde eventos de Yahoo Finance. En esta versión no se pueden crear manualmente.',
      );
    }
    const type = input.type === 'remove' ? 'remove' : 'add';
    const symbolInput = normalizeSymbol(input.symbol || input.ticker);
    const date = input.date || getToday();
    const hasEuros = Number.isFinite(Number(input.euros)) && Number(input.euros) > 0;
    const hasShares = Number.isFinite(Number(input.shares)) && Number(input.shares) > 0;
    const manualUnitPrice = Number.isFinite(Number(input.unitPrice)) && Number(input.unitPrice) > 0;
    const entryMode = normalizeEntryMode(input);

    if (!symbolInput) throw new Error('Missing symbol');
    validateTransactionAmountInput(input);

    const existingInstrument = getInstrumentByInput(symbolInput);

    if (entryMode === 'manual_total_eur') {
      if (!existingInstrument) throw new Error('manual_total_eur requires an existing instrument');
      if (!hasEuros || !hasShares) throw new Error('manual_total_eur requires euros and shares');
      if (manualUnitPrice) throw new Error('unitPrice cannot be combined with manual_total_eur');

      const instrument = existingInstrument;
      const shares = Number(input.shares);
      const valueEur = Number(input.euros);
      const price = valueEur / shares;
      const commissionEur = Number.isFinite(Number(input.commissionEur ?? input.commission))
        ? Math.abs(Number(input.commissionEur ?? input.commission))
        : 0;
      const cashFlowEur = type === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur);

      if (type === 'remove') {
        const available = getPositionShares(instrument.symbol, date);
        if (shares > available + 0.0000001) throw new Error(`Not enough shares. Available: ${available.toFixed(6)}`);
      }

      return {
        type,
        date,
        symbol: instrument.symbol,
        name: instrument.name,
        marketDate: date,
        shares,
        valueEur,
        price,
        priceEur: price,
        currency: 'EUR',
        fxToEur: 1,
        commissionEur,
        cashFlowEur,
        instrument,
        quote: null,
        entryMode,
        manualUnitPrice: false,
        manualTotalEur: true,
      };
    }

    if (entryMode === 'manual_unit_price') {
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
      const currency = String(input.priceCurrency || input.currency || instrument.currency || 'EUR')
        .trim()
        .toUpperCase();
      const inputFxToEur = input.fxToEur ?? input.fx_to_eur;
      if (
        String(input.entryMode || input.entry_mode || '').trim() &&
        currency !== 'EUR' &&
        !(Number.isFinite(Number(inputFxToEur)) && Number(inputFxToEur) > 0)
      ) {
        throw new Error('FX a EUR is required for manual_unit_price when currency is not EUR');
      }
      const fxToEur = await resolveFxToEur({ currency, date, inputFxToEur, getFxToEur });
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
        entryMode,
        manualUnitPrice: true,
        manualTotalEur: false,
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
      entryMode,
      manualUnitPrice: false,
      manualTotalEur: false,
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
  const transactionApi = {
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
    previewTransactionEdit,
    updateTransaction,
    deleteTransaction,
    bulkDeleteTransactions,
    isAutoPlanSkipped,
  };
  Object.assign(ctx.services.transactions, transactionApi);
  Object.assign(ctx, transactionApi);
  function autoKeyForPlan(plan, scheduledDate) {
    return `auto:${plan.symbol}:${scheduledDate}`;
  }
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
