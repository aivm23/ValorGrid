function makeGetYahooDividendEvents({ fetchYahooChart, dateUtc, addDays, toUnixSeconds }) {
  return async function getYahooDividendEvents(yahooSymbol, fromDate, toDate) {
    const fromUnix = toUnixSeconds(dateUtc(fromDate));
    const toUnix = toUnixSeconds(dateUtc(addDays(toDate, 1)));
    const result = await fetchYahooChart(
      yahooSymbol,
      `period1=${fromUnix}&period2=${toUnix}&interval=1d&events=div,splits`,
    );
    const currency = result.meta?.currency || 'EUR';
    const dividends = Object.values(result.events?.dividends || {});
    const splits = Object.values(result.events?.splits || {});
    const splitNotice = splits.length
      ? 'Yahoo Finance informa de un split o dividend split relacionado con este valor. ValorGrid todavía no trata splits de dividendos; será una mejora futura de una próxima edición.'
      : null;

    return dividends
      .map((event) => {
        const amountPerShare = Number(event.amount);
        const eventDate = Number(event.date);
        if (!Number.isFinite(amountPerShare) || amountPerShare <= 0 || !Number.isFinite(eventDate)) return null;
        const exDate = new Date(eventDate * 1000).toISOString().slice(0, 10);
        if (exDate < fromDate || exDate > toDate) return null;
        return {
          sourceEventId: `${yahooSymbol}:${exDate}:${amountPerShare}`,
          exDate,
          payDate: null,
          amountPerShare,
          currency,
          raw: event,
          splitNotice,
        };
      })
      .filter(Boolean);
  };
}

module.exports = { makeGetYahooDividendEvents };
