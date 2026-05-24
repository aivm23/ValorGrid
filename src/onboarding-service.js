module.exports = function attach(ctx) {
  with (ctx) {
function normalizeWizardPayload(input = {}) {
  const group = input.group || {};
  const instrument = input.instrument || {};
  const transaction = input.transaction || null;
  const plan = input.autoPlan || input.plan || null;
  const groupName = String(group.name || '').trim();
  const symbol = normalizeSymbol(instrument.symbol || instrument.ticker);

  if (!groupName) throw new Error('Group name is required');
  if (!symbol) throw new Error('Instrument symbol is required');
  if (db.prepare('SELECT id FROM instrument_groups WHERE id = ?').get(groupIdFromName(groupName))) {
    throw new Error('Group already exists');
  }
  if (getInstrument(symbol)) throw new Error('Instrument already exists');

  return {
    group: {
      name: groupName,
      color: String(group.color || '#16a34a').trim(),
      showInDistribution: group.showInDistribution !== false,
      showInMonthly: group.showInMonthly !== false,
      isExpandable: Boolean(group.isExpandable),
    },
    instrument: {
      symbol,
      yahooSymbol: String(instrument.yahooSymbol || instrument.yahoo_symbol || symbol).trim(),
      name: String(instrument.name || symbol).trim(),
      type: String(instrument.type || 'etf').trim().toLowerCase(),
      currency: String(instrument.currency || 'EUR').trim().toUpperCase(),
      color: String(instrument.color || '#2563eb').trim(),
    },
    transaction: transaction?.enabled ? transaction : null,
    plan: plan?.enabled ? plan : null,
  };
}

async function previewWizardTransaction(payload) {
  if (!payload.transaction) return null;
  const date = payload.transaction.date || getToday();
  const hasEuros = Number.isFinite(Number(payload.transaction.euros)) && Number(payload.transaction.euros) > 0;
  const hasShares = Number.isFinite(Number(payload.transaction.shares)) && Number(payload.transaction.shares) > 0;
  if (hasEuros === hasShares) throw new Error('Provide euros or shares, but not both');

  const quote = await getQuoteForYahooSymbol(payload.instrument.symbol, payload.instrument.yahooSymbol, date);
  const usdToEur = (await getFxToEur(quote.currency, quote.marketDate || date)) ?? 1;
  const priceEur = toEur(quote.price, quote.currency, usdToEur);
  const shares = hasShares ? Number(payload.transaction.shares) : Number(payload.transaction.euros) / priceEur;
  const valueEur = hasEuros ? Number(payload.transaction.euros) : shares * priceEur;
  const commissionEur = Number.isFinite(Number(payload.transaction.commissionEur ?? payload.transaction.commission))
    ? Math.abs(Number(payload.transaction.commissionEur ?? payload.transaction.commission))
    : 0;

  return {
    type: 'add',
    symbol: payload.instrument.symbol,
    date,
    marketDate: quote.marketDate || date,
    shares,
    valueEur,
    price: quote.price,
    priceEur,
    currency: quote.currency,
    usdToEur,
    commissionEur,
    cashFlowEur: -(valueEur + commissionEur),
  };
}

function normalizeWizardPlan(payload) {
  if (!payload.plan) return null;
  const frequency = autoPlanFrequency(payload.plan.frequency);
  const amountEur = Number(payload.plan.amountEur);
  const day = frequency === 'monthly' ? Number(payload.plan.day) : 1;
  const weekday = ['weekly', 'biweekly'].includes(frequency) ? Number(payload.plan.weekday) : null;
  const startDate = String(payload.plan.startDate || payload.plan.start_date || '').trim();

  if (!Number.isFinite(amountEur) || amountEur <= 0) throw new Error('Auto plan amount must be greater than 0');
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Auto plan startDate must use YYYY-MM-DD');
  if (frequency === 'monthly' && (!Number.isInteger(day) || day < 1 || day > 28)) {
    throw new Error('Auto plan day must be between 1 and 28');
  }
  if (['weekly', 'biweekly'].includes(frequency) && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
    throw new Error('Auto plan weekday must be between 1 and 7');
  }

  return {
    symbol: payload.instrument.symbol,
    amountEur,
    day,
    frequency,
    weekday,
    enabled: true,
    startDate,
  };
}

async function previewOnboardingWizard(input = {}) {
  const payload = normalizeWizardPayload(input);
  const transactionPreview = await previewWizardTransaction(payload);
  const plan = normalizeWizardPlan(payload);
  const scheduledDates = plan ? getAutoPlanScheduledDates(plan) : [];
  const planPreview = plan
    ? {
        plans: [
          {
            symbol: plan.symbol,
            frequency: plan.frequency,
            amountEur: plan.amountEur,
            pendingCount: scheduledDates.length,
            firstDate: scheduledDates[0] || null,
            lastDate: scheduledDates[scheduledDates.length - 1] || null,
            estimatedTotalEur: scheduledDates.length * plan.amountEur,
          },
        ],
        pendingCount: scheduledDates.length,
        estimatedTotalEur: scheduledDates.length * plan.amountEur,
        dates: scheduledDates.slice(0, 5),
      }
    : { plans: [], pendingCount: 0, estimatedTotalEur: 0, dates: [] };

  return {
    group: payload.group,
    instrument: payload.instrument,
    transaction: transactionPreview,
    autoPlan: planPreview,
    requiresRetroactiveConfirmation: planPreview.pendingCount > 1,
  };
}

async function commitOnboardingWizard(input = {}) {
  const payload = normalizeWizardPayload(input);
  const plan = normalizeWizardPlan(payload);
  const preview = await previewOnboardingWizard(input);
  if (preview.requiresRetroactiveConfirmation && !input.confirmRetroactive) {
    throw new Error('Confirm retroactive auto-plan executions before saving');
  }

  db.exec('BEGIN');
  try {
    const group = createInstrumentGroup(payload.group);
    const instrument = createInstrument({ ...payload.instrument, groupId: group.id });

    let transaction = null;
    if (payload.transaction) {
      transaction = await createTransaction({
        id: payload.transaction.id || `wizard-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: 'add',
        symbol: instrument.symbol,
        date: payload.transaction.date || getToday(),
        euros: payload.transaction.euros,
        shares: payload.transaction.shares,
        commissionEur: payload.transaction.commissionEur ?? payload.transaction.commission,
      });
    }

    if (plan) {
      const normalizedPlan = normalizeAutoPlans([{ ...plan, symbol: instrument.symbol }])[0];
      db.prepare(
        `INSERT INTO auto_plans
          (symbol, amount_eur, day, enabled, start_date, frequency, weekday)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        normalizedPlan.symbol,
        normalizedPlan.amountEur,
        normalizedPlan.frequency === 'monthly' ? normalizedPlan.day : 1,
        normalizedPlan.enabled ? 1 : 0,
        normalizedPlan.startDate || null,
        normalizedPlan.frequency,
        normalizedPlan.weekday || null,
      );
    }

    db.exec('COMMIT');
    invalidateLedger(plan?.startDate || transaction?.date || getToday(), 'onboarding-wizard');
    return { group, instrument, transaction, autoPlans: getAutoPlans() };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Transaction may already have been closed by SQLite.
    }
    throw error;
  }
}

    Object.assign(ctx, { previewOnboardingWizard, commitOnboardingWizard });
  }
};
