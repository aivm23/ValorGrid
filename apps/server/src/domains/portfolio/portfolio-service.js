const { assertCtxDeps, getCtxDep } = require('../../platform/ctx-utils');
const { getMonthEndDate, getScheduledDate } = require('./portfolio-dates');
const {
  buildBaseValuation,
  isEffectiveValuation: isEffectiveValuationWithMinimum,
  summarizeMarketDataStatus,
  withPercentages,
} = require('./portfolio-market-data');
const { buildCashHistoricalValuation, buildCashValuation } = require('./portfolio-cash');
const { summarizeTransactions } = require('./portfolio-flows');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'getToday',
      'getAutoPlans',
      'getAutoPlanScheduledDates',
      'autoKeyForPlan',
      'autoPlanExists',
      'isAutoPlanSkipped',
      'getQuoteForSymbol',
      'createTransaction',
      'getPositionShares',
      'getFxToEur',
      'toEur',
      'listInstruments',
      'minimumDisplayValueEur',
      'listInstrumentGroups',
      'buildLedgerAnalytics',
      'getTransactions',
      'areInstrumentGroupsEnabled',
    ],
    'portfolio-service',
  );

  const {
    repositories,
    getToday,
    getAutoPlans,
    getAutoPlanScheduledDates,
    autoKeyForPlan,
    autoPlanExists,
    isAutoPlanSkipped,
    getQuoteForSymbol,
    createTransaction,
    getPositionShares,
    getFxToEur,
    toEur,
    listInstruments,
    minimumDisplayValueEur,
    listInstrumentGroups,
    buildLedgerAnalytics,
    getTransactions,
    areInstrumentGroupsEnabled,
  } = ctx;
  const portfolioRepository = repositories.portfolio || {};
  const {
    findInstrumentBySymbol,
    countVisibleInstruments,
    countActiveInstrumentGroups,
    countTransactions,
    countAutoPlans,
  } = portfolioRepository;
  if (typeof findInstrumentBySymbol !== 'function') {
    throw new Error('portfolio-service requires repositories.portfolio.findInstrumentBySymbol');
  }
  if (typeof countVisibleInstruments !== 'function') {
    throw new Error('portfolio-service requires repositories.portfolio.countVisibleInstruments');
  }
  if (typeof countActiveInstrumentGroups !== 'function') {
    throw new Error('portfolio-service requires repositories.portfolio.countActiveInstrumentGroups');
  }
  if (typeof countTransactions !== 'function') {
    throw new Error('portfolio-service requires repositories.portfolio.countTransactions');
  }
  if (typeof countAutoPlans !== 'function') {
    throw new Error('portfolio-service requires repositories.portfolio.countAutoPlans');
  }

async function executeDueAutoPlans() {
  const today = getToday();
  for (const plan of getAutoPlans().filter((item) => item.enabled)) {
    for (const scheduledDate of getAutoPlanScheduledDates(plan, today)) {
      const autoKey = autoKeyForPlan(plan, scheduledDate);
      if (autoPlanExists(autoKey) || isAutoPlanSkipped(autoKey)) continue;

      try {
        const quote = await getQuoteForSymbol(plan.symbol, scheduledDate);
        if ((quote.marketDate || scheduledDate) > today) continue;

        await createTransaction(
          { type: 'add', symbol: plan.symbol, date: quote.marketDate || scheduledDate, euros: plan.amountEur },
          { origin: 'auto', autoKey },
        );
      } catch { /* Retry on next summary/monthly request. */ }
    }
  }
}
async function scanCorporateActionsQuietly(toDate = getToday()) { if (typeof ctx.scanCorporateActions === 'function') await ctx.scanCorporateActions({ toDate }).catch(() => {}); }
async function getInstrumentValuation(instrument, asOfDate = null) {
  if (instrument.type === 'cash') return buildCashValuation(instrument, { getFxToEur, getToday, toEur }, asOfDate);
  const shares = getPositionShares(instrument.symbol, asOfDate);
  const baseResult = buildBaseValuation(instrument, shares);

  if (Math.abs(shares) <= 0.0000001) {
    return {
      ...baseResult,
      shares,
      dataQuality: 'empty',
      valuationAvailable: true,
    };
  }

  let quote;
  try {
    quote = asOfDate
      ? await getQuoteForSymbol(instrument.symbol, asOfDate, { allowStale: true })
      : await getQuoteForSymbol(instrument.symbol, null, { allowStale: true });
  } catch {
    if (Number(instrument.fallback_price || 0) > 0) {
      return {
        ...baseResult,
        value: shares * Number(instrument.fallback_price || 0),
        dataQuality: 'fallback',
        valuationAvailable: true,
      };
    }
    return baseResult;
  }

  const fxToEur = (await getFxToEur(quote.currency, quote.marketDate || asOfDate, { allowStale: true })) ?? null;
  if (String(quote.currency || 'EUR').toUpperCase() !== 'EUR' && !Number.isFinite(Number(fxToEur))) {
    return baseResult;
  }
  const priceEur = toEur(quote.price, quote.currency, Number.isFinite(Number(fxToEur)) ? fxToEur : 1);

  return {
    ...baseResult,
    shares,
    price: quote.price,
    priceEur,
    currency: quote.currency,
    marketDate: quote.marketDate,
    value: shares * priceEur,
    dataQuality: quote.dataQuality || (quote.stale ? 'stale' : 'ok'),
    priceSource: quote.source,
    priceAgeDays: quote.priceAgeDays ?? null,
    valuationAvailable: true,
  };
}

async function buildSummary() {
  await executeDueAutoPlans();
  await scanCorporateActionsQuietly();

  const instruments = listInstruments().filter((instrument) => instrument.type !== 'fx');
  const valuations = await Promise.all(
    instruments.map((instrument) => getInstrumentValuation(dbInstrument(instrument.symbol))),
  );
  const visibleValuations = valuations.filter((item) => item.value >= minimumDisplayValueEur);
  const groupsEnabled = areInstrumentGroupsEnabled();
  const groups = groupsEnabled ? listInstrumentGroups() : [];
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const groupedPositions = {};

  let portfolio;
  if (groupsEnabled) {
    portfolio = groups
      .filter((group) => group.showInDistribution)
      .map((group) => {
        const positions = visibleValuations.filter((item) => item.groupId === group.id && item.showInDistribution);
        groupedPositions[group.id] = withPercentages(positions, positions.reduce((sum, item) => sum + item.value, 0));
        return {
          symbol: group.isExpandable ? 'STOCK' : `GROUP:${group.id}`, groupId: group.id, name: group.name, type: 'group',
          color: group.color, isExpandable: group.isExpandable, shares: null, priceEur: null,
          value: positions.reduce((sum, item) => sum + item.value, 0),
        };
      })
      .filter((item) => item.value >= minimumDisplayValueEur);
    const ungrouped = visibleValuations.filter((item) => !item.groupId || !groupsById.has(item.groupId));
    portfolio.push(...ungrouped.filter((item) => item.showInDistribution));
  } else {
    portfolio = visibleValuations.filter((i) => i.showInDistribution).map((i) => {
      const inst = listInstruments().find((m) => m.symbol.toLowerCase() === i.symbol.toLowerCase());
      return { symbol: i.symbol, name: i.name, type: i.type || 'stock', color: inst?.color || '#0d9488',
        isExpandable: false, shares: i.shares, priceEur: i.priceEur, currency: i.currency,
        value: i.value, groupId: null };
    });
  }
  const total = portfolio.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const expandableGroup = portfolio.find((item) => item.isExpandable);

  return {
    updatedAt: new Date().toISOString(),
    total,
    portfolio: withPercentages(portfolio, total),
    groups,
    groupedPositions,
    stockPositions: expandableGroup ? groupedPositions[expandableGroup.groupId] || [] : [],
    autoPlans: getAutoPlans(),
    performance: buildLedgerAnalytics(total),
    onboarding: buildOnboardingStatus(),
    groupsEnabled,
    marketDataStatus: summarizeMarketDataStatus(valuations),
  };
}

function dbInstrument(symbol) {
  return findInstrumentBySymbol(symbol);
}

function isEffectiveValuation(item) { return isEffectiveValuationWithMinimum(item, minimumDisplayValueEur); }

async function buildMonthly(year) {
  await executeDueAutoPlans();
  const monthLabel = getCtxDep(ctx, 'monthLabel', 'portfolio-service');
  const groupsEnabled = areInstrumentGroupsEnabled();

  const today = getToday();
  const scanToDate = `${year}-12-31` < today ? `${year}-12-31` : today;
  await scanCorporateActionsQuietly(scanToDate);
  const currentYearValue = Number(today.slice(0, 4));
  const currentMonthValue = Number(today.slice(5, 7));
  const monthLimit = year < currentYearValue ? 12 : year === currentYearValue ? currentMonthValue : 0;
  const months = Array.from({ length: monthLimit }, (_, index) => index + 1);
  const rows = [];
  const monthlyInsights = [];
  const instruments = listInstruments().filter((item) => item.type !== 'fx' && item.showInMonthly);
  const groups = groupsEnabled ? listInstrumentGroups().filter((group) => group.showInMonthly) : [];
  const configuredColumns = groupsEnabled
    ? groups.map((group) => ({ id: group.id, label: group.name, color: group.color, isGroup: true }))
    : instruments.map((instr) => ({ id: instr.symbol, label: instr.name, color: instr.color, isGroup: false }));
  const instrumentGroups = new Map(listInstruments().map((instrument) => [instrument.symbol, instrument.groupId]));
  const transactions = getTransactions().filter((transaction) => String(transaction.date || '').startsWith(`${year}-`));
  let previousTotal = null;
  let previousGroupValues = new Map();

  for (const month of months) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const calendarMonthEnd = getMonthEndDate(year, month);
    const asOfDate = year === currentYearValue && month === currentMonthValue ? today : calendarMonthEnd;
    const requestedDate = asOfDate;
    const monthTransactions = transactions.filter((transaction) => String(transaction.date || '').startsWith(monthKey));
    const monthFlows = summarizeTransactions(monthTransactions);

    try {
      let valuations;
      try {
        valuations = await Promise.all(
          instruments.map((item) => getInstrumentValuationAt(dbInstrument(item.symbol), requestedDate, asOfDate)),
        );
      } catch (error) {
        if (!(year === currentYearValue && month === currentMonthValue)) throw error;
        const fallbackRequestedDate = getScheduledDate(year, month, 3);
        valuations = await Promise.all(
          instruments.map((item) => getInstrumentValuationAt(dbInstrument(item.symbol), fallbackRequestedDate, asOfDate)),
        );
      }
      const cells = {};
      for (const column of configuredColumns) {
        const positions = valuations.filter(
          (item) => (column.isGroup ? item.groupId === column.id : item.symbol === column.id) && isEffectiveValuation(item),
        );
        if (!positions.length) {
          cells[column.id] = {
            value: null,
            priceEur: null,
            marketDate: null,
            positions: [],
            empty: true,
          };
          continue;
        }
        const value = positions.reduce((sum, item) => sum + item.value, 0);
        const firstPriced = positions.find((item) => item.marketDate);
        cells[column.id] = {
          value,
          priceEur: positions.length === 1 ? positions[0].priceEur : null,
          marketDate: firstPriced?.marketDate || null,
          positions,
        };
      }
      const total = Object.values(cells).reduce((sum, cell) => sum + Number(cell?.value || 0), 0);
      const effectiveTotal = total >= minimumDisplayValueEur ? total : 0;
      const monthGroups = buildMonthlyGroups(cells, configuredColumns, total, monthTransactions, instrumentGroups);
      const topGroup = groupsEnabled ? topMonthlyGroup(monthGroups, previousGroupValues) : null;

      rows.push({
        month,
        label: monthLabel(month),
        cells,
        total: effectiveTotal,
      });
      monthlyInsights.push({
        month,
        label: monthLabel(month),
        period: monthKey,
        asOfDate,
        total: effectiveTotal,
        contributions: monthFlows.contributions,
        withdrawals: monthFlows.withdrawals,
        dividends: monthFlows.dividends,
        dividendCount: monthFlows.dividendCount,
        commissions: monthFlows.commissions,
        netContribution: monthFlows.netContribution,
        variation: previousTotal === null ? null : effectiveTotal - previousTotal,
        topGroup,
        autoContributions: monthFlows.autoContributions,
        autoDividends: monthFlows.autoDividends,
        autoStatus: monthFlows.autoContributions > 0 ? `${monthFlows.autoContributions} automáticas` : 'Sin automáticas',
        groups: monthGroups,
      });
      previousTotal = effectiveTotal;
      previousGroupValues = new Map(monthGroups.map((group) => [group.id, group.value]));
    } catch {
      rows.push({
        month,
        label: monthLabel(month),
        cells: Object.fromEntries(configuredColumns.map((column) => [column.id, null])),
        total: null,
      });
      monthlyInsights.push({
        month,
        label: monthLabel(month),
        period: monthKey,
        asOfDate,
        total: null,
        contributions: monthFlows.contributions,
        withdrawals: monthFlows.withdrawals,
        dividends: monthFlows.dividends,
        dividendCount: monthFlows.dividendCount,
        commissions: monthFlows.commissions,
        netContribution: monthFlows.netContribution,
        variation: null,
        topGroup: null,
        autoContributions: monthFlows.autoContributions,
        autoDividends: monthFlows.autoDividends,
        autoStatus: 'Pendiente',
        groups: [],
      });
    }
  }

  const columns = groupsEnabled
    ? configuredColumns.filter((column) =>
        rows.some((row) => Number(row.cells?.[column.id]?.value || 0) >= minimumDisplayValueEur),
      )
    : configuredColumns;

  const completedMonths = monthlyInsights.filter((month) => month.total !== null && Number.isFinite(Number(month.total)));
  const latest = completedMonths[completedMonths.length - 1] || null;
  const valueStart = await getYearStartValue(year, instruments);
  const ytdFlows = summarizeTransactions(transactions);
  const currentValue = Number(latest?.total || 0);
  const resultYtd = currentValue - valueStart - ytdFlows.netContribution;

  return {
    year,
    columns,
    rows,
    summary: {
      valueStart,
      currentValue,
      contributions: ytdFlows.contributions,
      withdrawals: ytdFlows.withdrawals,
      dividends: ytdFlows.dividends,
      dividendCount: ytdFlows.dividendCount,
      commissions: ytdFlows.commissions,
      netContributed: ytdFlows.netContribution,
      resultYtd,
      completedMonths: completedMonths.length,
      latestMonth: latest ? latest.label : null,
      activeGroups: columns.length,
    },
    months: monthlyInsights,
  };
}

function summarizeGroupTransactions(transactions, groupId, instrumentGroups) {
  return summarizeTransactions(transactions.filter((transaction) => instrumentGroups.get(transaction.symbol) === groupId));
}

function buildMonthlyGroups(cells, configuredColumns, total, monthTransactions, instrumentGroups) {
  return configuredColumns
    .map((column) => {
      const cell = cells[column.id];
      const value = Number(cell?.value || 0);
      if (!cell || cell.empty || value < minimumDisplayValueEur) return null;
      const flows = column.isGroup
        ? summarizeGroupTransactions(monthTransactions, column.id, instrumentGroups)
        : summarizeTransactions(monthTransactions.filter((t) => t.symbol === column.id));
      return {
        id: column.id,
        label: column.label,
        color: column.color,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
        contributions: flows.contributions,
        withdrawals: flows.withdrawals,
        dividends: flows.dividends,
        dividendCount: flows.dividendCount,
        commissions: flows.commissions,
        netContribution: flows.netContribution,
        positions: cell.positions || [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);
}

function topMonthlyGroup(groups, previousGroupValues) {
  if (!groups.length) return null;
  const ranked = groups
    .map((group) => ({
      id: group.id,
      label: group.label,
      color: group.color,
      value: group.value,
      variation: group.value - Number(previousGroupValues.get(group.id) || 0),
    }))
    .sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation));
  return ranked[0] || null;
}

async function getYearStartValue(year, instruments) {
  const startDate = `${year}-01-01`;
  try {
    const valuations = await Promise.all(
      instruments.map((item) => getInstrumentValuationAt(dbInstrument(item.symbol), startDate, startDate)),
    );
    return valuations.filter(isEffectiveValuation).reduce((sum, item) => sum + Number(item.value || 0), 0);
  } catch {
    return 0;
  }
}

async function getInstrumentValuationAt(instrument, requestedDate, asOfDate) {
  if (instrument.type === 'cash') {
    return buildCashHistoricalValuation(instrument);
  }

  const shares = getPositionShares(instrument.symbol, asOfDate);
  if (Math.abs(shares) <= 0.0000001) {
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      groupId: instrument.group_id,
      showInDistribution: Boolean(instrument.show_in_distribution),
      showInMonthly: Boolean(instrument.show_in_monthly),
      shares,
      price: Number(instrument.fallback_price || 0),
      priceEur: Number(instrument.fallback_price || 0),
      currency: instrument.currency,
      marketDate: null,
      value: 0,
    };
  }
  const quote = await getQuoteForSymbol(instrument.symbol, requestedDate, { allowStale: true });
  const fxToEur = (await getFxToEur(quote.currency, quote.marketDate || requestedDate, { allowStale: true })) ?? 1;
  const priceEur = toEur(quote.price, quote.currency, fxToEur);

  return {
    symbol: instrument.symbol,
    name: instrument.name,
    groupId: instrument.group_id,
    showInDistribution: Boolean(instrument.show_in_distribution),
    showInMonthly: Boolean(instrument.show_in_monthly),
    shares,
    price: quote.price,
    priceEur,
    currency: quote.currency,
    marketDate: quote.marketDate,
    value: shares * priceEur,
    dataQuality: quote.dataQuality || (quote.stale ? 'stale' : 'ok'),
  };
}

function buildOnboardingStatus() {
  const visibleInstrumentCount = countVisibleInstruments();
  const groupCount = countActiveInstrumentGroups();
  const transactionCount = countTransactions();
  const autoPlanCount = countAutoPlans();
  return {
    needsSetup: visibleInstrumentCount === 0,
    hasGroups: groupCount > 0,
    hasInstruments: visibleInstrumentCount > 0,
    hasTransactions: transactionCount > 0,
    hasAutoPlans: autoPlanCount > 0,
    visibleInstrumentCount,
    groupCount,
    transactionCount,
    autoPlanCount,
    groupsEnabled: areInstrumentGroupsEnabled(),
  };
}
  Object.assign(ctx, { getMonthEndDate, getScheduledDate, executeDueAutoPlans, getInstrumentValuation, buildSummary, dbInstrument, withPercentages, summarizeMarketDataStatus, buildMonthly, getInstrumentValuationAt, buildOnboardingStatus, isEffectiveValuation });
};
