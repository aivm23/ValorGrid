module.exports = function attach(ctx) {
  with (ctx) {
function getMonthEndDate(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function getScheduledDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
      } catch {
        // Retry on next summary/monthly request.
      }
    }
  }
}

async function getInstrumentValuation(instrument, asOfDate = null) {
  const shares = getPositionShares(instrument.symbol, asOfDate);
  if (Math.abs(shares) <= 0.0000001) {
    return {
      symbol: instrument.symbol,
      yahooSymbol: instrument.yahoo_symbol,
      name: instrument.name,
      type: instrument.type,
      groupId: instrument.group_id,
      showInDistribution: Boolean(instrument.show_in_distribution),
      showInMonthly: Boolean(instrument.show_in_monthly),
      color: instrument.color,
      shares,
      price: Number(instrument.fallback_price || 0),
      priceEur: Number(instrument.fallback_price || 0),
      currency: instrument.currency,
      marketDate: null,
      value: 0,
    };
  }
  const quote = asOfDate
    ? await getQuoteForSymbol(instrument.symbol, asOfDate)
    : await getQuoteForSymbol(instrument.symbol);
  const fxToEur = (await getFxToEur(quote.currency, quote.marketDate || asOfDate)) ?? 1;
  const priceEur = toEur(quote.price, quote.currency, fxToEur);

  return {
    symbol: instrument.symbol,
    yahooSymbol: instrument.yahoo_symbol,
    name: instrument.name,
    type: instrument.type,
    groupId: instrument.group_id,
    showInDistribution: Boolean(instrument.show_in_distribution),
    showInMonthly: Boolean(instrument.show_in_monthly),
    color: instrument.color,
    shares,
    price: quote.price,
    priceEur,
    currency: quote.currency,
    marketDate: quote.marketDate,
    value: shares * priceEur,
  };
}

async function buildSummary() {
  await executeDueAutoPlans();

  const instruments = listInstruments().filter((instrument) => instrument.type !== 'fx');
  const valuations = await Promise.all(
    instruments.map((instrument) => getInstrumentValuation(dbInstrument(instrument.symbol))),
  );
  const visibleValuations = valuations.filter((item) => item.value >= minimumDisplayValueEur);
  const groups = listInstrumentGroups();
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const groupedPositions = {};
  const portfolio = groups
    .filter((group) => group.showInDistribution)
    .map((group) => {
      const positions = visibleValuations.filter((item) => item.groupId === group.id && item.showInDistribution);
      groupedPositions[group.id] = withPercentages(
        positions,
        positions.reduce((sum, item) => sum + item.value, 0),
      );
      return {
        symbol: group.isExpandable ? 'STOCK' : `GROUP:${group.id}`,
        groupId: group.id,
        name: group.name,
        type: 'group',
        color: group.color,
        isExpandable: group.isExpandable,
        shares: null,
        priceEur: null,
        value: positions.reduce((sum, item) => sum + item.value, 0),
      };
    })
    .filter((item) => item.value >= minimumDisplayValueEur);

  const ungroupedPositions = visibleValuations.filter((item) => !item.groupId || !groupsById.has(item.groupId));
  portfolio.push(...ungroupedPositions.filter((item) => item.showInDistribution));
  const total = portfolio.reduce((sum, item) => sum + item.value, 0);
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
  };
}

function dbInstrument(symbol) {
  return db.prepare('SELECT * FROM instruments WHERE symbol = ?').get(symbol);
}

function withPercentages(items, total) {
  return [...items]
    .map((item) => ({ ...item, pct: total > 0 ? (item.value / total) * 100 : 0 }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
}

function isEffectiveValuation(item) {
  return Math.abs(Number(item?.shares || 0)) > 0.0000001 && Number(item?.value || 0) >= minimumDisplayValueEur;
}

async function buildMonthly(year) {
  await executeDueAutoPlans();

  const today = getToday();
  const currentYearValue = Number(today.slice(0, 4));
  const currentMonthValue = Number(today.slice(5, 7));
  const monthLimit = year < currentYearValue ? 12 : year === currentYearValue ? currentMonthValue : 0;
  const months = Array.from({ length: monthLimit }, (_, index) => index + 1);
  const rows = [];
  const monthlyInsights = [];
  const instruments = listInstruments().filter((item) => item.type !== 'fx' && item.showInMonthly);
  const groups = listInstrumentGroups().filter((group) => group.showInMonthly);
  const configuredColumns = groups.map((group) => ({ id: group.id, label: group.name, color: group.color }));
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
        const positions = valuations.filter((item) => item.groupId === column.id && isEffectiveValuation(item));
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
      const topGroup = topMonthlyGroup(monthGroups, previousGroupValues);

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
        commissions: monthFlows.commissions,
        netContribution: monthFlows.netContribution,
        variation: previousTotal === null ? null : effectiveTotal - previousTotal,
        topGroup,
        autoContributions: monthFlows.autoContributions,
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
        commissions: monthFlows.commissions,
        netContribution: monthFlows.netContribution,
        variation: null,
        topGroup: null,
        autoContributions: monthFlows.autoContributions,
        autoStatus: 'Pendiente',
        groups: [],
      });
    }
  }

  const columns = configuredColumns.filter((column) =>
    rows.some((row) => Number(row.cells?.[column.id]?.value || 0) >= minimumDisplayValueEur),
  );

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

function summarizeTransactions(transactions) {
  return transactions.reduce(
    (summary, transaction) => {
      const valueEur = Number(transaction.valueEur || 0);
      const commissionEur = Number(transaction.commissionEur || 0);
      const cashFlowEur = Number(transaction.cashFlowEur || 0);
      summary.commissions += commissionEur;
      summary.netContribution -= cashFlowEur;
      if (transaction.type === 'remove') summary.withdrawals += valueEur;
      else summary.contributions += valueEur;
      if (transaction.origin === 'auto') summary.autoContributions += 1;
      return summary;
    },
    { contributions: 0, withdrawals: 0, commissions: 0, netContribution: 0, autoContributions: 0 },
  );
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
      const flows = summarizeGroupTransactions(monthTransactions, column.id, instrumentGroups);
      return {
        id: column.id,
        label: column.label,
        color: column.color,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
        contributions: flows.contributions,
        withdrawals: flows.withdrawals,
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
  const quote = await getQuoteForSymbol(instrument.symbol, requestedDate);
  const fxToEur = (await getFxToEur(quote.currency, quote.marketDate || requestedDate)) ?? 1;
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
  };
}

function buildOnboardingStatus() {
  const visibleInstrumentCount = db
    .prepare("SELECT COUNT(*) AS count FROM instruments WHERE type != 'fx' AND active = 1")
    .get().count;
  const groupCount = db.prepare('SELECT COUNT(*) AS count FROM instrument_groups WHERE active = 1').get().count;
  const transactionCount = db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;
  const autoPlanCount = db.prepare('SELECT COUNT(*) AS count FROM auto_plans').get().count;
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
  };
}
    Object.assign(ctx, { getMonthEndDate, getScheduledDate, executeDueAutoPlans, getInstrumentValuation, buildSummary, dbInstrument, withPercentages, buildMonthly, getInstrumentValuationAt, buildOnboardingStatus, isEffectiveValuation });
  }
};
