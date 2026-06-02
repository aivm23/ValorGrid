const test = require('node:test');
const {
  assert,
  db,
  createTransaction,
  deleteTransaction,
  buildMonthly,
  buildPortfolioHistory,
  getPositionShares,
  getTransactions,
  cachePrice,
  seedTestInstrument,
  seedLoadtestDb,
  bumpTestMeta,
  jsonRequest,
  registerLifecycle,
  startTestServer,
  stopTestServer,
} = require('./integration-helpers');

registerLifecycle(test);
test.before(async () => {
  seedTestInstrument({ symbol: 'HIST1', yahooSymbol: 'HIST1', name: 'History Baseline One', type: 'stock', currency: 'EUR' });
  cachePrice('HIST1', '2026-05-01', 10);
  cachePrice('HIST1', '2026-05-02', 11);
  await createTransaction({ type: 'add', symbol: 'HIST1', date: '2026-05-01', shares: 2 });
  await createTransaction({ type: 'remove', symbol: 'HIST1', date: '2026-05-02', shares: 1 });
});

test('GET /api/portfolio/performance returns ledger-derived return metrics', async () => {
  const { response, body } = await jsonRequest('/api/portfolio/performance');

  assert.equal(response.status, 200);
  assert.ok(Number.isFinite(body.currentValue));
  assert.ok(Number.isFinite(body.netContributed));
  assert.ok(Number.isFinite(body.commissions));
  assert.ok(Number.isFinite(body.realizedGain));
  assert.ok(Number.isFinite(body.unrealizedGain));
});

test('deleting an automatic transaction prevents same month auto recreation', async () => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const scheduledDate = `${monthKey}-03`;
  const autoKey = `auto:U308:${scheduledDate}`;
  cachePrice('URA', scheduledDate, 52.5, 'USD');

  const transaction =
    getTransactions().find((item) => item.autoKey === autoKey) ||
    (await createTransaction(
      { type: 'add', symbol: 'U308', date: scheduledDate, euros: 10 },
      { origin: 'auto', autoKey },
    ));

  assert.equal(deleteTransaction(transaction.id), true);
  assert.equal(db.prepare('SELECT auto_key FROM auto_plan_skips WHERE auto_key = ?').get(autoKey).auto_key, autoKey);

  const { response } = await jsonRequest('/api/portfolio/summary');
  assert.equal(response.status, 200);
  assert.equal(getTransactions().some((item) => item.autoKey === autoKey), false);
});

test('automatic plans respect startDate before creating monthly transactions', async () => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dueDay = Math.min(28, Math.max(1, now.getDate()));
  const scheduledDate = `${monthKey}-${String(dueDay).padStart(2, '0')}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const futureStartDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
    tomorrow.getDate(),
  ).padStart(2, '0')}`;
  const autoKey = `auto:NVO:${scheduledDate}`;
  const legacyAutoKey = `auto:${monthKey}:NVO`;
  db.prepare('DELETE FROM transactions WHERE auto_key IN (?, ?)').run(autoKey, legacyAutoKey);
  db.prepare('DELETE FROM auto_plan_skips WHERE auto_key IN (?, ?)').run(autoKey, legacyAutoKey);
  seedTestInstrument({ symbol: 'NVO', yahooSymbol: 'NOV.DE', name: 'Novo Nordisk', type: 'stock' });
  cachePrice('NOV.DE', scheduledDate, 40);

  const futurePlan = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoPlans: [{ symbol: 'NVO', amountEur: 25, day: dueDay, frequency: 'monthly', enabled: true, startDate: futureStartDate }],
    }),
  });
  assert.equal(futurePlan.response.status, 200);

  const futureStart = await jsonRequest('/api/portfolio/summary');
  assert.equal(futureStart.response.status, 200);
  assert.equal(getTransactions().some((item) => item.autoKey === autoKey), false);

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [] }),
  });

  const activePlan = await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoPlans: [{ symbol: 'NVO', amountEur: 25, day: dueDay, frequency: 'monthly', enabled: true, startDate: `${monthKey}-01` }],
    }),
  });
  assert.equal(activePlan.response.status, 200);

  const activeStart = await jsonRequest('/api/portfolio/summary');
  assert.equal(activeStart.response.status, 200);
  const created = getTransactions().find((item) => item.autoKey === autoKey);
  assert.ok(created);
  assert.equal(created.origin, 'auto');

  const beforeCount = getTransactions().filter((item) => item.autoKey === autoKey).length;
  await jsonRequest('/api/portfolio/summary');
  const afterCount = getTransactions().filter((item) => item.autoKey === autoKey).length;
  assert.equal(afterCount, beforeCount);
});

test('automatic plans do not duplicate legacy monthly auto keys', async () => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const scheduledDate = `${monthKey}-03`;
  const legacyAutoKey = `auto:${monthKey}:NVO`;
  const newAutoKey = `auto:NVO:${scheduledDate}`;
  db.prepare('DELETE FROM transactions WHERE auto_key IN (?, ?)').run(legacyAutoKey, newAutoKey);
  db.prepare('DELETE FROM auto_plan_skips WHERE auto_key IN (?, ?)').run(legacyAutoKey, newAutoKey);
  await createTransaction(
    { type: 'add', symbol: 'NVO', date: scheduledDate, euros: 25 },
    { origin: 'auto', autoKey: legacyAutoKey },
  );

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPlans: [{ symbol: 'NVO', amountEur: 25, day: 3, frequency: 'monthly', enabled: true, startDate: `${monthKey}-01` }] }),
  });
  await jsonRequest('/api/portfolio/summary');

  assert.equal(getTransactions().filter((item) => item.autoKey === legacyAutoKey).length, 1);
  assert.equal(getTransactions().filter((item) => item.autoKey === newAutoKey).length, 0);
});

test('automatic plans support weekly, biweekly, monthly backfill, and stable auto keys', async () => {
  for (const symbol of ['WEEK1', 'WEEK2', 'BIW1', 'MON1']) {
    seedTestInstrument({ symbol, yahooSymbol: symbol, name: symbol, type: 'etf' });
    db.prepare('DELETE FROM transactions WHERE symbol = ?').run(symbol);
  }

  await jsonRequest('/api/auto-plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoPlans: [
        { symbol: 'WEEK1', amountEur: 10, frequency: 'weekly', weekday: 3, enabled: true, startDate: '2026-05-07' },
        { symbol: 'WEEK2', amountEur: 10, frequency: 'weekly', weekday: 3, enabled: true, startDate: '2026-05-06' },
        { symbol: 'BIW1', amountEur: 10, frequency: 'biweekly', weekday: 3, enabled: true, startDate: '2026-04-22' },
        { symbol: 'MON1', amountEur: 10, frequency: 'monthly', day: 3, enabled: true, startDate: '2026-01-01' },
      ],
    }),
  });

  const firstRun = await jsonRequest('/api/portfolio/summary');
  assert.equal(firstRun.response.status, 200);

  const autoKeys = getTransactions()
    .filter((transaction) => ['WEEK1', 'WEEK2', 'BIW1', 'MON1'].includes(transaction.symbol))
    .map((transaction) => transaction.autoKey)
    .sort();
  assert.ok(autoKeys.includes('auto:WEEK1:2026-05-13'));
  assert.ok(autoKeys.includes('auto:WEEK2:2026-05-06'));
  assert.ok(autoKeys.includes('auto:WEEK2:2026-05-13'));
  assert.ok(autoKeys.includes('auto:BIW1:2026-04-22'));
  assert.ok(autoKeys.includes('auto:BIW1:2026-05-06'));
  assert.ok(autoKeys.includes('auto:MON1:2026-01-03'));
  assert.ok(autoKeys.includes('auto:MON1:2026-05-03'));
  const today = new Date();
  const startYear = 2026;
  const startMonth = 1;
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const totalMonths = (currentYear - startYear) * 12 + currentMonth - startMonth + 1;
  const expectedMon1 = today.getDate() < 3 ? totalMonths - 1 : totalMonths;
  assert.equal(autoKeys.filter((key) => key.startsWith('auto:MON1:')).length, expectedMon1);

  const beforeCount = autoKeys.length;
  await jsonRequest('/api/portfolio/summary');
  const afterCount = getTransactions()
    .filter((transaction) => ['WEEK1', 'WEEK2', 'BIW1', 'MON1'].includes(transaction.symbol))
    .length;
  assert.equal(afterCount, beforeCount);
});

test('onboarding wizard preview is read-only and commit is atomic', async () => {
  const payload = {
    group: { name: 'Wizard Atomic', color: '#16a34a', showInDistribution: true, showInMonthly: true, isExpandable: false },
    instrument: { symbol: 'WIZA', yahooSymbol: 'WIZA', name: 'Wizard Asset', type: 'etf', currency: 'EUR', color: '#2563eb' },
    transaction: { enabled: true, date: '2026-05-10', euros: 100, commissionEur: 1 },
    autoPlan: { enabled: true, amountEur: 25, frequency: 'monthly', day: 3, startDate: '2026-05-01' },
  };
  const preview = await jsonRequest('/api/onboarding/wizard/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE symbol = 'WIZA'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM instrument_groups WHERE name = 'Wizard Atomic'").get().count, 0);

  const needsConfirmation = preview.body?.preview?.requiresRetroactiveConfirmation;
  const commitPayload = { ...payload };
  if (needsConfirmation) commitPayload.confirmRetroactive = true;
  const commit = await jsonRequest('/api/onboarding/wizard/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(commitPayload),
  });
  assert.equal(commit.response.status, 201);
  assert.equal(getPositionShares('WIZA') > 0, true);
  assert.equal(db.prepare("SELECT frequency FROM auto_plans WHERE symbol = 'WIZA'").get().frequency, 'monthly');

  const badPayload = {
    group: { name: 'Wizard Rollback', color: '#16a34a' },
    instrument: { symbol: 'WIZB', yahooSymbol: 'WIZB', name: 'Wizard Bad', type: 'etf', currency: 'EUR', color: '#2563eb' },
    autoPlan: { enabled: true, amountEur: 25, frequency: 'weekly', weekday: 9, startDate: '2026-05-01' },
  };
  const failed = await jsonRequest('/api/onboarding/wizard/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(badPayload),
  });
  assert.equal(failed.response.status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE symbol = 'WIZB'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM instrument_groups WHERE name = 'Wizard Rollback'").get().count, 0);
});

test('portfolio history applies adaptive granularity and returns events', async () => {
  const ytd = await buildPortfolioHistory('ytd');
  const oneYear = await buildPortfolioHistory('1y');
  const twoYears = await buildPortfolioHistory('2y');
  const fiveYears = await buildPortfolioHistory('5y');
  const all = await buildPortfolioHistory('all');

  assert.equal(ytd.granularity, 'daily');
  assert.equal(oneYear.granularity, 'daily');
  assert.equal(twoYears.granularity, 'weekly');
  assert.equal(fiveYears.granularity, 'weekly');
  assert.equal(all.granularity, 'weekly');
  assert.ok(all.series.length > 0);
  assert.ok(all.series.every((point) => Number.isFinite(point.contributed)));
  assert.ok(all.events.some((event) => event.type === 'add'));
  assert.ok(all.events.some((event) => event.type === 'remove'));
  assert.ok(all.series[0].date >= all.from);
  assert.ok(all.events[0].plotDate >= all.events[0].date);
  assert.equal(all.meta.status, 'ready');
});

test('portfolio history stores persistent materialized values and positions', async () => {
  db.exec('DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM portfolio_events; DELETE FROM history_builds; DELETE FROM history_invalidations;');

  const first = await buildPortfolioHistory('5y');
  const buildRow = db.prepare("SELECT status, points FROM history_builds WHERE build_key = 'portfolio_daily'").get();
  const valueCount = db.prepare('SELECT COUNT(*) AS count FROM portfolio_value_daily').get().count;
  const weeklyCount = db.prepare('SELECT COUNT(*) AS count FROM portfolio_value_weekly').get().count;
  const positionCount = db.prepare('SELECT COUNT(*) AS count FROM portfolio_positions_daily').get().count;
  const second = await buildPortfolioHistory('5y');

  assert.equal(buildRow.status, 'ready');
  assert.ok(buildRow.points > 0);
  assert.deepEqual(second.series, first.series);
  assert.ok(valueCount > 0);
  assert.ok(weeklyCount > 0);
  assert.ok(positionCount > 0);
  assert.equal(second.meta.cached, true);
});

test('ledger writes invalidate materialized portfolio history versions', async () => {
  db.exec('DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM history_builds; DELETE FROM history_invalidations;');
  await buildPortfolioHistory('5y');
  const before = db.prepare("SELECT ledger_version AS version FROM history_builds WHERE build_key = 'portfolio_daily'").get();
  const beforeVersion = Number(before?.version || 0);

  cachePrice('NOV.DE', '2026-05-16', 40);
  const transaction = await createTransaction({ type: 'add', symbol: 'NVO', date: '2026-05-16', shares: 1 });
  assert.ok(db.prepare("SELECT 1 FROM history_invalidations WHERE reason = 'transaction-create'").get());
  await buildPortfolioHistory('5y');
  const after = db.prepare("SELECT ledger_version AS version FROM history_builds WHERE build_key = 'portfolio_daily'").get();

  assert.ok(after);
  assert.ok(after.version > beforeVersion);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM history_invalidations').get().count, 0);
  assert.equal(deleteTransaction(transaction.id), true);
});

test('portfolio history materialized cache survives server restart and hard reload style requests', async () => {
  db.exec('DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM portfolio_events; DELETE FROM history_builds; DELETE FROM history_invalidations;');
  const before = await jsonRequest('/api/portfolio/history?range=5y');
  assert.equal(before.response.status, 200);
  assert.ok(db.prepare("SELECT 1 FROM history_builds WHERE build_key = 'portfolio_daily' AND status = 'ready'").get());

  await stopTestServer();
  await startTestServer();

  const started = performance.now();
  const after = await jsonRequest('/api/portfolio/history?range=5y', {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  });
  const elapsed = performance.now() - started;

  assert.equal(after.response.status, 200);
  assert.deepEqual(after.body.series, before.body.series);
  assert.deepEqual(after.body.events, before.body.events);
  assert.ok(elapsed < 300, `cached restart response took ${elapsed}ms`);
});

test('GET /api/diagnostics/performance reports cache and timing data', async () => {
  cachePrice('NOV.DE', '2026-05-16', 40);
  const transaction = await createTransaction({ type: 'add', symbol: 'NVO', date: '2026-05-16', shares: 1 });
  await buildPortfolioHistory('5y');
  const { response, body } = await jsonRequest('/api/diagnostics/performance');

  assert.equal(response.status, 200);
  assert.ok(Number.isFinite(body.versions.ledgerVersion));
  assert.ok(Number.isFinite(body.versions.priceVersion));
  assert.ok(body.counts.portfolioValueDaily >= 1);
  assert.ok(body.counts.portfolioValueWeekly >= 1);
  assert.ok(body.counts.portfolioPositionsDaily >= 1);
  assert.ok(body.counts.historyBuilds >= 1);
  assert.ok(Number.isFinite(body.database.bytes));
  assert.ok(Number.isFinite(body.invalidations.pending));
  assert.ok(body.ranges['5y'].ms < 300);
  assert.equal(body.ranges['5y'].granularity, 'weekly');
  assert.equal(deleteTransaction(transaction.id), true);
});

test('portfolio history persists daily prices and FX cache', async () => {
  db.exec('DELETE FROM daily_price_cache; DELETE FROM daily_price_cache_ranges; DELETE FROM market_prices_daily; DELETE FROM fx_rates_daily; DELETE FROM portfolio_value_weekly; DELETE FROM history_builds; DELETE FROM history_invalidations;');
  seedTestInstrument({ symbol: 'FXUSD', yahooSymbol: 'FXUSD', name: 'FX USD Baseline', type: 'stock', currency: 'USD' });
  cachePrice('FXUSD', '2026-05-15', 10, 'USD');
  await createTransaction({ type: 'add', symbol: 'FXUSD', date: '2026-05-15', shares: 1 });
  const priceVersion = Number(db.prepare("SELECT value FROM app_meta WHERE key = 'price_version'").get().value);
  db.prepare("UPDATE app_meta SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'price_version'").run(
    String(priceVersion + 1),
  );
  const beforePrices = db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache').get().count;
  const beforeRanges = db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache_ranges').get().count;

  await buildPortfolioHistory('all');
  await buildPortfolioHistory('all');

  const afterPrices = db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache').get().count;
  const afterRanges = db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache_ranges').get().count;
  const fxRows = db
    .prepare("SELECT COUNT(*) AS count FROM daily_price_cache WHERE yahoo_symbol = 'USDEUR=X'")
    .get().count;
  const marketRows = db.prepare('SELECT COUNT(*) AS count FROM market_prices_daily').get().count;
  const fxMaterializedRows = db.prepare('SELECT COUNT(*) AS count FROM fx_rates_daily').get().count;

  assert.ok(afterPrices > beforePrices);
  assert.ok(afterRanges >= beforeRanges);
  assert.ok(fxRows > 0);
  assert.ok(marketRows > 0);
  assert.ok(fxMaterializedRows > 0);
});

test('GET /api/portfolio/summary returns calculated portfolio data', async () => {
  const { response, body } = await jsonRequest('/api/portfolio/summary');

  assert.equal(response.status, 200);
  assert.ok(Number.isFinite(body.total));
  assert.ok(Array.isArray(body.portfolio));
  assert.ok(Array.isArray(body.stockPositions));
});

test('GET /api/portfolio/monthly returns monthly rows and skips future months', async () => {
  const { response, body } = await jsonRequest('/api/portfolio/monthly?year=2026');
  const currentMonth = new Date().getMonth() + 1;

  assert.equal(response.status, 200);
  assert.equal(body.rows.length, currentMonth);
  assert.equal(body.months.length, currentMonth);
  assert.ok(Array.isArray(body.columns));
  assert.ok(body.summary);
  assert.ok(Number.isFinite(body.summary.currentValue));
  assert.ok(Number.isFinite(body.summary.netContributed));
  assert.ok(Number.isFinite(body.summary.resultYtd));
  assert.equal(body.columns.some((column) => /World valor|China valor|U308/.test(column.label)), false);
  assert.equal(body.months.some((month) => month.month > currentMonth), false);
  assert.equal(body.months.some((month) => month.total === null), false);
  assert.equal(body.rows.some((row) => row.total === null), false);
});

test('monthly tracking ignores zero-value groups and zero-share instruments', async () => {
  db.prepare(
    `INSERT OR REPLACE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES ('zero-monthly-test', 'Zero Monthly Test', '#64748b', 900, 1, 1, 0, 1)`,
  ).run();
  db.prepare(
    `INSERT OR REPLACE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES ('mixed-monthly-test', 'Mixed Monthly Test', '#0d9488', 901, 1, 1, 0, 1)`,
  ).run();
  db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order, show_in_monthly)
     VALUES (?, ?, ?, 'stock', 'EUR', ?, 0, 0, 1, ?, ?, 1)`,
  ).run('ZERO0', 'ZERO0.DE', 'Zero Position', '#64748b', 'zero-monthly-test', 900);
  db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order, show_in_monthly)
     VALUES (?, ?, ?, 'stock', 'EUR', ?, 0, 0, 1, ?, ?, 1)`,
  ).run('MIX1', 'MIX1.DE', 'Mixed Valued', '#0d9488', 'mixed-monthly-test', 901);
  db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id, display_order, show_in_monthly)
     VALUES (?, ?, ?, 'stock', 'EUR', ?, 0, 0, 1, ?, ?, 1)`,
  ).run('MIX0', 'MIX0.DE', 'Mixed Zero', '#94a3b8', 'mixed-monthly-test', 902);
  cachePrice('MIX1.DE', '2026-01-02', 20);
  cachePrice('MIX1.DE', '2026-01-03', 22);
  await createTransaction({
    id: 'monthly-effective-position',
    type: 'add',
    symbol: 'MIX1',
    date: '2026-01-02',
    shares: 1,
  });

  const monthly = await buildMonthly(2026);
  const zeroColumn = monthly.columns.find((column) => column.id === 'zero-monthly-test');
  const mixedColumn = monthly.columns.find((column) => column.id === 'mixed-monthly-test');
  const january = monthly.rows.find((row) => row.month === 1);
  const januaryInsight = monthly.months.find((row) => row.month === 1);
  const mixedCell = january.cells['mixed-monthly-test'];

  assert.equal(zeroColumn, undefined);
  assert.ok(mixedColumn);
  assert.equal(mixedCell.positions.length, 1);
  assert.equal(mixedCell.positions[0].symbol, 'MIX1');
  assert.equal(mixedCell.positions.some((position) => position.symbol === 'MIX0'), false);
  assert.equal(januaryInsight.groups.some((group) => group.id === 'zero-monthly-test'), false);
  assert.equal(januaryInsight.groups.some((group) => group.positions.some((position) => position.symbol === 'MIX0')), false);
});

test('GET /api/portfolio/history works for every range', async () => {
  for (const [range, granularity] of [
    ['ytd', 'daily'],
    ['1y', 'daily'],
    ['2y', 'weekly'],
    ['5y', 'weekly'],
    ['all', 'weekly'],
  ]) {
    const { response, body } = await jsonRequest(`/api/portfolio/history?range=${range}`);

    assert.equal(response.status, 200);
    assert.equal(body.range, range);
    assert.equal(body.granularity, granularity);
    assert.ok(Array.isArray(body.series));
    assert.ok(Array.isArray(body.events));
  }
});

test('portfolio history uses the canonical demo dataset for long-range cache performance', async () => {
  seedLoadtestDb(db, { from: '2021-06-01', to: '2026-05-16' });

  const firstStarted = performance.now();
  const first = await buildPortfolioHistory('5y');
  const firstElapsed = performance.now() - firstStarted;
  const secondStarted = performance.now();
  const second = await buildPortfolioHistory('5y');
  const secondElapsed = performance.now() - secondStarted;
  const all = await buildPortfolioHistory('all');
  const ytd = await buildPortfolioHistory('ytd');

  assert.ok(first.series.length > 150, `expected many weekly points, got ${first.series.length}`);
  assert.ok(first.events.length >= 180, `expected synthetic events, got ${first.events.length}`);
  assert.deepEqual(second.series, first.series);
  assert.equal(second.meta.cached, true);
  assert.ok(secondElapsed < 300, `warm history took ${secondElapsed}ms after ${firstElapsed}ms cold build`);
  assert.equal(all.granularity, 'weekly');
  assert.equal(ytd.granularity, 'daily');
  assert.ok(all.events.some((event) => event.date === '2021-06-12'));
});

test('loadtest dataset covers real stock tickers, range event boundaries, and cached history performance', async () => {
  const result = seedLoadtestDb(db, { from: '2023-01-01', to: '2026-05-16' });
  assert.ok(result.transactions >= 100);
  assert.ok(result.prices > 9000);

  const started = performance.now();
  const first = await buildPortfolioHistory('5y');
  const firstElapsed = performance.now() - started;
  const secondStarted = performance.now();
  const second = await buildPortfolioHistory('5y');
  const secondElapsed = performance.now() - secondStarted;
  const ytd = await buildPortfolioHistory('ytd');
  const all = await buildPortfolioHistory('all');

  for (const history of [first, second, ytd, all]) {
    assert.ok(history.events.every((event) => event.plotDate >= history.from), `${history.range} has no early events`);
    assert.ok(history.events.every((event) => event.plotDate <= history.to), `${history.range} has no late events`);
    if (history.events.length) {
      const expectedFirstEvent = getTransactions()
        .filter((transaction) => (transaction.marketDate || transaction.date) >= history.from)
        .sort((a, b) => (a.marketDate || a.date).localeCompare(b.marketDate || b.date))[0];
      assert.equal(history.events[0].id, expectedFirstEvent.id);
    }
  }

  assert.ok(first.events.some((event) => event.symbol === 'NVO'));
  assert.ok(first.events.some((event) => event.symbol === 'GOOG'));
  assert.ok(first.events.some((event) => event.symbol === 'META'));
  assert.ok(first.events.some((event) => event.symbol === 'SPPW'));
  assert.ok(first.events.some((event) => event.symbol === 'SEMI'));
  assert.ok(first.events.some((event) => event.type === 'remove'));
  assert.equal(db.prepare("SELECT frequency FROM auto_plans WHERE symbol = 'SEMI'").get().frequency, 'monthly');
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE symbol = 'SEMI' AND origin = 'auto'").get().count >= 24);
  assert.deepEqual(second.series, first.series);
  assert.equal(second.meta.cached, true);
  assert.ok(secondElapsed < 300, `warm 5y loadtest history took ${secondElapsed}ms after ${firstElapsed}ms cold build`);
  assert.ok(ytd.series[0].date >= ytd.from);
  assert.equal(all.series[0].date, all.from);
});

test('portfolio history uses SQLite daily cache when Yahoo is unavailable', async () => {
  seedLoadtestDb(db, { from: '2023-01-01', to: '2026-05-16' });
  db.exec('DELETE FROM daily_price_cache_ranges; DELETE FROM history_builds; DELETE FROM portfolio_value_daily; DELETE FROM portfolio_value_weekly; DELETE FROM portfolio_positions_daily; DELETE FROM portfolio_events; DELETE FROM history_invalidations;');
  const previousFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('network down');
  };

  try {
    const history = await buildPortfolioHistory('all');
    const secondStarted = performance.now();
    const cachedHistory = await buildPortfolioHistory('all');
    const secondElapsed = performance.now() - secondStarted;

    assert.ok(history.series.length > 100);
    assert.ok(history.events.length >= 100);
    assert.equal(cachedHistory.meta.cached, true);
    assert.deepEqual(cachedHistory.series, history.series);
    assert.ok(secondElapsed < 300, `warm cache fallback history took ${secondElapsed}ms`);
  } finally {
    global.fetch = previousFetch;
  }
});

test('YTD history starts at the range axis before the first operation', async () => {
  seedLoadtestDb(db, { from: '2026-01-01', to: '2026-05-16' });
  db.exec(`
    DELETE FROM transactions;
    DELETE FROM auto_plans;
    DELETE FROM history_builds;
    DELETE FROM portfolio_value_daily;
    DELETE FROM portfolio_value_weekly;
    DELETE FROM portfolio_positions_daily;
    DELETE FROM portfolio_events;
    DELETE FROM history_invalidations;
  `);
  bumpTestMeta('ledger_version');
  db.prepare(
    `INSERT INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin, auto_key)
     VALUES ('axis-start-buy', 'add', 'NVO', 'Novo Nordisk', '2026-01-03', '2026-01-03', 2, 100, 50, 'EUR', 1, '#0d9488', 'manual', NULL)`,
  ).run();

  const ytd = await buildPortfolioHistory('ytd');

  assert.equal(ytd.from, '2026-01-01');
  assert.equal(ytd.series[0].date, '2026-01-01');
  assert.equal(ytd.series[0].value, 0);
  assert.equal(ytd.events[0].plotDate, '2026-01-03');
  assert.equal(ytd.events[0].id, 'axis-start-buy');
});


