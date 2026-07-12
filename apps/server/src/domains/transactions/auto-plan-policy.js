function createAutoPlanPolicy({ normalizeSymbol, getInstrument, getAutoPlans, getToday }) {
  function autoPlanFrequency(value) {
    if (value === '') throw new Error('Auto plan frequency is required');
    const frequency = String(value || 'monthly')
      .trim()
      .toLowerCase();
    if (!['daily', 'weekly', 'biweekly', 'monthly'].includes(frequency)) {
      throw new Error('Invalid auto plan frequency');
    }
    return frequency;
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
      const frequency = autoPlanFrequency(plan.frequency);
      const day = frequency === 'monthly' ? Number(plan.day) : 1;
      const weekday = ['weekly', 'biweekly'].includes(frequency) ? Number(plan.weekday) : null;
      const startDate = String(plan.startDate || plan.start_date || '').trim() || null;
      if (!Number.isFinite(amountEur) || amountEur <= 0) {
        throw new Error('Auto plan amount must be greater than 0');
      }
      if (frequency === 'monthly' && (!Number.isInteger(day) || day < 1 || day > 28)) {
        throw new Error('Auto plan day must be between 1 and 28');
      }
      if (['weekly', 'biweekly'].includes(frequency) && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
        throw new Error('Auto plan weekday must be between 1 and 7');
      }
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw new Error('Auto plan startDate must use YYYY-MM-DD');
      }

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

  return {
    autoPlanFrequency,
    normalizeAutoPlans,
    autoPlanMateriallyChanged,
    applyAutoPlanEditPolicy,
  };
}

module.exports = { createAutoPlanPolicy };
