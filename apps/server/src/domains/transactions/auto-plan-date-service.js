const { assertCtxDeps } = require('../../platform/ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'getToday',
      'dateUtc',
      'addDays',
    ],
    'auto-plan-date-service',
  );

  const { getToday: _getToday, dateUtc, addDays } = ctx;

  function getToday() { return _getToday(); }

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

  Object.assign(ctx, {
    getAutoPlanScheduledDates,
  });
};
