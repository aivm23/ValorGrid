function parseDailyPrices(result) {
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const currency = result.meta?.currency || 'EUR';

  return timestamps
    .map((timestamp, index) => {
      const price = Number(closes[index]);
      if (!Number.isFinite(price) || price <= 0) return null;
      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        price,
        currency,
        source: 'Yahoo Finance',
      };
    })
    .filter(Boolean);
}

module.exports = { parseDailyPrices };
