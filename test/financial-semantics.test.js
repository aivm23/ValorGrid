const test = require('node:test');
const {
  assert,
  db,
  createTransaction,
  buildPortfolioPerformance,
  buildMonthly,
  buildPortfolioHistory,
  cachePrice,
  mockSplitEvents,
  scanCorporateActions,
  seedTestInstrument,
  registerLifecycle,
} = require('./integration-helpers');

registerLifecycle(test);

function approx(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= epsilon, `expected ${actual} ~= ${expected}`);
}

function resetFinancialState() {
  db.exec(`
    DELETE FROM auto_plan_skips;
    DELETE FROM auto_plans;
    DELETE FROM transactions;
    DELETE FROM corporate_actions;
    DELETE FROM history_builds;
    DELETE FROM history_invalidations;
    DELETE FROM portfolio_value_daily;
    DELETE FROM portfolio_value_weekly;
    DELETE FROM portfolio_positions_daily;
    DELETE FROM portfolio_events;
  `);
}

test('buildPortfolioPerformance: only buys keep netCashFlow negative and netContributed positive', async () => {
  resetFinancialState();

  await createTransaction({ type: 'add', symbol: 'SEM_BUY', date: '2026-01-10', euros: 100, commissionEur: 2 });
  const performance = await buildPortfolioPerformance();

  approx(performance.grossInvested, 100);
  approx(performance.grossWithdrawn, 0);
  approx(performance.commissions, 2);
  approx(performance.netCashFlow, -102);
  approx(performance.netContributed, 102);
  approx(performance.currentValue, 100);
  approx(performance.realizedGain, 0);
  approx(performance.totalGain, -2);
  approx(performance.unrealizedGain, -2);
  approx(performance.simpleReturnPct, (-2 / 102) * 100);
});

test('buildPortfolioPerformance: split adjusts FIFO shares without changing contributed capital', async () => {
  resetFinancialState();

  seedTestInstrument({ symbol: 'GOOGF', yahooSymbol: 'GOOGF', name: 'Google FIFO Split', type: 'stock' });
  await createTransaction({
    type: 'add',
    symbol: 'GOOGF',
    date: '2026-01-10',
    shares: 1,
    euros: 1000,
    entryMode: 'manual_total_eur',
  });
  mockSplitEvents.set('GOOGF', [{ date: '2026-02-01', numerator: 20, denominator: 1 }]);
  await scanCorporateActions({ symbols: ['GOOGF'], fromDate: '2026-01-01', toDate: '2026-03-01' });
  await createTransaction({
    type: 'remove',
    symbol: 'GOOGF',
    date: '2026-03-01',
    shares: 3,
    euros: 180,
    entryMode: 'manual_total_eur',
  });

  const performance = await buildPortfolioPerformance();

  approx(performance.grossInvested, 1000);
  approx(performance.grossWithdrawn, 180);
  approx(performance.netContributed, 820);
  approx(performance.realizedGain, 30);
  assert.equal(performance.transactionCount, 2);
  mockSplitEvents.delete('GOOGF');
});

test('buildPortfolioPerformance: buys + sells + fees preserve FIFO and expected signs', async () => {
  resetFinancialState();

  await createTransaction({ type: 'add', symbol: 'SEM_MIX', date: '2026-02-01', euros: 200, commissionEur: 2 });
  await createTransaction({ type: 'remove', symbol: 'SEM_MIX', date: '2026-02-10', euros: 120, commissionEur: 1 });
  const performance = await buildPortfolioPerformance();

  approx(performance.grossInvested, 200);
  approx(performance.grossWithdrawn, 120);
  approx(performance.commissions, 3);
  approx(performance.netCashFlow, -83);
  approx(performance.netContributed, 83);
  approx(performance.currentValue, 80);
  approx(performance.realizedGain, -2.2);
  approx(performance.totalGain, -3);
  approx(performance.unrealizedGain, -0.8);
  approx(performance.simpleReturnPct, (-3 / 83) * 100);
});

test('buildPortfolioPerformance: positive netCashFlow yields negative netContributed and null simpleReturnPct', async () => {
  resetFinancialState();

  cachePrice('SEM_POS', '2026-03-20', 20);
  await createTransaction({ type: 'add', symbol: 'SEM_POS', date: '2026-03-01', shares: 10 });
  await createTransaction({ type: 'remove', symbol: 'SEM_POS', date: '2026-03-20', shares: 10 });
  const performance = await buildPortfolioPerformance();

  approx(performance.grossInvested, 100);
  approx(performance.grossWithdrawn, 200);
  approx(performance.commissions, 0);
  approx(performance.netCashFlow, 100);
  approx(performance.netContributed, -100);
  approx(performance.currentValue, 0);
  approx(performance.realizedGain, 100);
  approx(performance.totalGain, 100);
  approx(performance.unrealizedGain, 0);
  assert.equal(performance.simpleReturnPct, null);
});

test('buildMonthly summary keeps YTD formulas and signs', async () => {
  resetFinancialState();

  await createTransaction({ type: 'add', symbol: 'SEM_MON', date: '2026-01-05', euros: 100, commissionEur: 2 });
  await createTransaction({ type: 'remove', symbol: 'SEM_MON', date: '2026-02-10', euros: 30, commissionEur: 1 });
  const monthly = await buildMonthly(2026);
  const { summary } = monthly;

  approx(summary.valueStart, 0);
  approx(summary.contributions, 100);
  approx(summary.withdrawals, 30);
  approx(summary.commissions, 3);
  approx(summary.netContributed, 73);
  approx(summary.currentValue, 70);
  approx(summary.resultYtd, summary.currentValue - summary.valueStart - summary.netContributed);
  approx(summary.resultYtd, -3);
});

test('portfolio history series[].contributed is cumulative -cashFlowEur by date', async () => {
  resetFinancialState();

  await createTransaction({ type: 'add', symbol: 'SEM_HIST', date: '2026-01-02', euros: 100, commissionEur: 2 });
  await createTransaction({ type: 'remove', symbol: 'SEM_HIST', date: '2026-01-03', euros: 50, commissionEur: 1 });
  const history = await buildPortfolioHistory('ytd', 'daily');
  const contributedByDate = new Map(history.series.map((point) => [point.date, Number(point.contributed || 0)]));

  approx(contributedByDate.get('2026-01-01'), 0);
  approx(contributedByDate.get('2026-01-02'), 102);
  approx(contributedByDate.get('2026-01-03'), 53);
  approx(Number(history.series[history.series.length - 1].contributed || 0), 53);
});
