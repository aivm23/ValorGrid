module.exports = function attach(ctx) {
  with (ctx) {
function getTransactions() {
  return db
    .prepare(
      `SELECT id, type, symbol, name, date, market_date AS marketDate, shares,
              value_eur AS valueEur, price, currency, usd_to_eur AS usdToEur,
              commission_eur AS commissionEur, cash_flow_eur AS cashFlowEur,
              color, origin, auto_key AS autoKey, created_at AS createdAt
       FROM transactions
       ORDER BY date ASC, created_at ASC`,
    )
    .all();
}

function getAutoPlans() {
  return db
    .prepare(
      `SELECT symbol, amount_eur AS amountEur, day, enabled, start_date AS startDate
       FROM auto_plans
       ORDER BY symbol ASC`,
    )
    .all()
    .map((plan) => ({ ...plan, enabled: Boolean(plan.enabled) }));
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
  const summary = await buildSummary();
  const analytics = buildLedgerAnalytics(summary.total);
  return {
    updatedAt: summary.updatedAt,
    currentValue: summary.total,
    ...analytics,
  };
}

function replaceAutoPlans(plans) {
  const normalizedPlans = normalizeAutoPlans(plans);
  const invalidationDate =
    normalizedPlans
      .map((plan) => plan.startDate)
      .filter(Boolean)
      .sort()[0] || getToday();

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM auto_plans');
    const insert = db.prepare(
      'INSERT INTO auto_plans (symbol, amount_eur, day, enabled, start_date) VALUES (?, ?, ?, ?, ?)',
    );
    for (const plan of normalizedPlans) {
      insert.run(plan.symbol, plan.amountEur, plan.day, plan.enabled ? 1 : 0, plan.startDate || null);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  invalidateLedger(invalidationDate, 'auto-plans');
}

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
    const day = Number(plan.day);
    const startDate = String(plan.startDate || plan.start_date || '').trim() || null;
    if (!Number.isFinite(amountEur) || amountEur <= 0) throw new Error('Auto plan amount must be greater than 0');
    if (!Number.isInteger(day) || day < 1 || day > 28) throw new Error('Auto plan day must be between 1 and 28');
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Auto plan startDate must use YYYY-MM-DD');

    return {
      symbol: instrument.symbol,
      amountEur,
      day,
      enabled: Boolean(plan.enabled),
      startDate,
    };
  });
}

function getPositionShares(symbol, asOfDate = null) {
  const instrument = getInstrument(symbol);
  if (!instrument) return 0;

  const transactions = asOfDate
    ? db
        .prepare('SELECT type, shares FROM transactions WHERE symbol = ? AND date <= ?')
        .all(instrument.symbol, asOfDate)
    : db.prepare('SELECT type, shares FROM transactions WHERE symbol = ?').all(instrument.symbol);

  return transactions.reduce(
    (shares, transaction) => shares + transactionSign(transaction.type) * Number(transaction.shares),
    Number(instrument.base_shares || 0),
  );
}

function getStockColorsUsed() {
  return new Set(
    db
      .prepare("SELECT color FROM instruments WHERE type = 'stock'")
      .all()
      .map((item) => item.color),
  );
}

async function createTransaction(input, options = {}) {
  const preview = await previewTransaction(input);
  const instrument = preview.type === 'add' ? ensureInstrument(preview.symbol, preview.quote) : preview.instrument;

  const id = input.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const origin = options.origin || input.origin || 'manual';
  const autoKey = options.autoKey || input.autoKey || null;

  db.prepare(
    `INSERT INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
       usd_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    preview.type,
    instrument.symbol,
    instrument.name,
    preview.date,
    preview.marketDate,
    preview.shares,
    preview.valueEur,
    preview.price,
    preview.currency,
    preview.usdToEur,
    preview.commissionEur,
    preview.cashFlowEur,
    instrument.color,
    origin,
    autoKey,
  );
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
  const usdToEur = quote.currency === 'USD' ? await getUsdToEur(quote.marketDate || date) : 1;
  const priceEur = toEur(quote.price, quote.currency, usdToEur);
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
    usdToEur,
    commissionEur,
    cashFlowEur,
    instrument,
    quote,
  };
}

function deleteTransaction(id) {
  const transaction = db.prepare('SELECT auto_key, date FROM transactions WHERE id = ?').get(id);
  if (!transaction) return false;

  const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  if (result.changes > 0 && transaction.auto_key) {
    db.prepare('INSERT OR IGNORE INTO auto_plan_skips (auto_key) VALUES (?)').run(transaction.auto_key);
  }
  if (result.changes > 0) invalidateLedger(transaction.date, 'transaction-delete');
  return result.changes > 0;
}

function isAutoPlanSkipped(autoKey) {
  return Boolean(db.prepare('SELECT auto_key FROM auto_plan_skips WHERE auto_key = ?').get(autoKey));
}
    Object.assign(ctx, { getTransactions, getAutoPlans, buildLedgerAnalytics, buildPortfolioPerformance, replaceAutoPlans, normalizeAutoPlans, getPositionShares, getStockColorsUsed, createTransaction, previewTransaction, deleteTransaction, isAutoPlanSkipped });
  }
};
