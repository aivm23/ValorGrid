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
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  for (const plan of getAutoPlans().filter((item) => item.enabled && now.getDate() >= item.day)) {
    const autoKey = `auto:${monthKey}:${plan.symbol}`;
    const exists = db.prepare('SELECT id FROM transactions WHERE auto_key = ?').get(autoKey);
    if (exists || isAutoPlanSkipped(autoKey)) continue;

    const scheduledDate = getScheduledDate(year, month, plan.day);
    if (plan.startDate && plan.startDate > scheduledDate) continue;

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
  const usdToEur = quote.currency === 'USD' ? await getUsdToEur(quote.marketDate || asOfDate) : 1;
  const priceEur = toEur(quote.price, quote.currency, usdToEur);

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
  const instruments = listInstruments().filter((item) => item.type !== 'fx' && item.showInMonthly);
  const groups = listInstrumentGroups().filter((group) => group.showInMonthly);
  const configuredColumns = groups.map((group) => ({ id: group.id, label: group.name, color: group.color }));

  for (const month of months) {
    const asOfDate = getMonthEndDate(year, month);
    const requestedDate = getScheduledDate(year, month, 3);

    try {
      const valuations = await Promise.all(
        instruments.map((item) => getInstrumentValuationAt(dbInstrument(item.symbol), requestedDate, asOfDate)),
      );
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

      rows.push({
        month,
        label: monthLabel(month),
        cells,
        total: total >= minimumDisplayValueEur ? total : 0,
      });
    } catch {
      rows.push({
        month,
        label: monthLabel(month),
        cells: Object.fromEntries(configuredColumns.map((column) => [column.id, null])),
        total: null,
      });
    }
  }

  const columns = configuredColumns.filter((column) =>
    rows.some((row) => Number(row.cells?.[column.id]?.value || 0) >= minimumDisplayValueEur),
  );

  return { year, columns, rows };
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
  const usdToEur = quote.currency === 'USD' ? await getUsdToEur(quote.marketDate || requestedDate) : 1;
  const priceEur = toEur(quote.price, quote.currency, usdToEur);

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
