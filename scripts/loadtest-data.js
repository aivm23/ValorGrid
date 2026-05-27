const defaultFrom = '2023-01-01';
const defaultTo = '2026-05-16';

const instruments = [
  { symbol: 'NVO', yahooSymbol: 'NOV.DE', name: 'Novo Nordisk', type: 'stock', currency: 'EUR', color: '#0d9488', base: 52 },
  { symbol: 'GOOG', yahooSymbol: 'GOOG', name: 'Alphabet', type: 'stock', currency: 'USD', color: '#ea580c', base: 118 },
  { symbol: 'META', yahooSymbol: 'META', name: 'Meta Platforms', type: 'stock', currency: 'USD', color: '#16a34a', base: 172 },
  { symbol: 'MSFT', yahooSymbol: 'MSFT', name: 'Microsoft', type: 'stock', currency: 'USD', color: '#0891b2', base: 214 },
  { symbol: 'AAPL', yahooSymbol: 'AAPL', name: 'Apple', type: 'stock', currency: 'USD', color: '#be123c', base: 142 },
  { symbol: 'SPPW', yahooSymbol: 'SPPW.DE', name: 'ETF MSCI World', type: 'etf', currency: 'EUR', color: '#a855f7', base: 36 },
  { symbol: 'ICGA', yahooSymbol: 'ICGA.DE', name: 'ETF MSCI China', type: 'etf', currency: 'EUR', color: '#dc2626', base: 4.6 },
  { symbol: 'U308', yahooSymbol: 'URA', name: 'ETF U308', type: 'etf', currency: 'USD', color: '#f59e0b', base: 31 },
  { symbol: 'SEMI', yahooSymbol: 'SMH', name: 'ETF Semiconductores', type: 'etf', currency: 'USD', color: '#0284c7', base: 152 },
  { symbol: 'USDEUR', yahooSymbol: 'USDEUR=X', name: 'USD/EUR', type: 'fx', currency: 'EUR', color: '#64748b', base: 0.9 },
];

function dateUtc(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = typeof value === 'string' ? dateUtc(value) : new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function dateRange(fromDate, toDate) {
  const dates = [];
  for (let date = dateUtc(fromDate); date <= dateUtc(toDate); date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(formatDate(date));
  }
  return dates;
}

function monthDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthsBetween(fromDate, toDate) {
  const from = dateUtc(fromDate);
  const to = dateUtc(toDate);
  const months = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear(); year += 1) {
    const startMonth = year === from.getUTCFullYear() ? from.getUTCMonth() + 1 : 1;
    const endMonth = year === to.getUTCFullYear() ? to.getUTCMonth() + 1 : 12;
    for (let month = startMonth; month <= endMonth; month += 1) {
      months.push({ year, month });
    }
  }
  return months;
}

function daysSince(fromDate, date) {
  return Math.floor((dateUtc(date) - dateUtc(fromDate)) / 86400000);
}

function deterministicPrice(instrument, date, fromDate) {
  const day = daysSince(fromDate, date);
  const hash = [...instrument.symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  if (instrument.symbol === 'USDEUR') {
    return Number((0.88 + Math.sin(day / 45) * 0.025 + Math.cos(day / 17) * 0.008).toFixed(6));
  }
  const trend = instrument.type === 'etf' ? day * 0.006 : day * 0.035;
  const cycle = Math.sin(day / (18 + (hash % 9)) + hash) * (instrument.base * 0.08);
  const drawdown = Math.cos(day / (41 + (hash % 11))) * (instrument.base * 0.035);
  return Number(Math.max(1, instrument.base + trend + cycle + drawdown).toFixed(4));
}

function clearLoadtestTables(db) {
  db.exec(`
    DELETE FROM history_builds;
    DELETE FROM portfolio_value_daily;
    DELETE FROM portfolio_value_weekly;
    DELETE FROM portfolio_positions_daily;
    DELETE FROM portfolio_events;
    DELETE FROM history_invalidations;
    DELETE FROM market_prices_daily;
    DELETE FROM fx_rates_daily;
    DELETE FROM daily_price_cache_ranges;
    DELETE FROM daily_price_cache;
    DELETE FROM price_cache;
    DELETE FROM auto_plan_skips;
    DELETE FROM transactions;
    DELETE FROM auto_plans;
    DELETE FROM instruments;
  `);
}

function bumpMeta(db, key) {
  const current = Number(db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value || 0);
  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
  ).run(key, String(current + 1));
}

function seedLoadtestDb(db, options = {}) {
  const from = options.from || defaultFrom;
  const to = options.to || defaultTo;
  const cacheFrom = options.cacheFrom || '2021-01-01';
  const dates = dateRange(from, to);
  const months = monthsBetween(from, to);
  const bySymbol = new Map(instruments.map((instrument) => [instrument.symbol, instrument]));
  const holdings = new Map(instruments.filter((item) => item.type !== 'fx').map((item) => [item.symbol, 0]));

  const insertInstrument = db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)`,
  );
  const insertDaily = db.prepare(
    `INSERT OR REPLACE INTO daily_price_cache
      (yahoo_symbol, date, price, currency, source)
     VALUES (?, ?, ?, ?, 'loadtest')`,
  );
  const insertRange = db.prepare(
    `INSERT OR REPLACE INTO daily_price_cache_ranges (yahoo_symbol, from_date, to_date)
     VALUES (?, ?, ?)`,
  );
  const insertTransaction = db.prepare(
    `INSERT OR REPLACE INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, usd_to_eur, color, origin, auto_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL)`,
  );
  const insertAutoTransaction = db.prepare(
    `INSERT OR REPLACE INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, usd_to_eur, color, origin, auto_key)
     VALUES (?, 'add', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?)`,
  );
  const insertAutoPlan = db.prepare(
    `INSERT OR REPLACE INTO auto_plans
      (symbol, amount_eur, day, enabled, start_date, frequency, weekday)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  clearLoadtestTables(db);
  db.exec('BEGIN');
  try {
    for (const instrument of instruments) {
      insertInstrument.run(
        instrument.symbol,
        instrument.yahooSymbol,
        instrument.name,
        instrument.type,
        instrument.currency,
        instrument.color,
        instrument.base,
      );
      insertRange.run(instrument.yahooSymbol, cacheFrom, to);
      for (const date of dates) {
        insertDaily.run(
          instrument.yahooSymbol,
          date,
          deterministicPrice(instrument, date, from),
          instrument.currency,
        );
      }
    }

    for (const [index, { year, month }] of months.entries()) {
      if (index % 7 === 5) continue;
      const buySymbols = [
        instruments[index % 5].symbol,
        instruments[5 + (index % 3)].symbol,
        instruments[(index + 2) % 5].symbol,
      ];
      const buyDates = [3, 12, 21].map((day) => monthDate(year, month, day));

      for (let slot = 0; slot < buySymbols.length; slot += 1) {
        const symbol = buySymbols[slot];
        const instrument = bySymbol.get(symbol);
        const date = buyDates[slot] <= to ? buyDates[slot] : to;
        const price = deterministicPrice(instrument, date, from);
        const fx = instrument.currency === 'USD' ? deterministicPrice(bySymbol.get('USDEUR'), date, from) : 1;
        const priceEur = instrument.currency === 'USD' ? price * fx : price;
        const valueEur = 125 + ((index + slot) % 6) * 35;
        const shares = Number((valueEur / priceEur).toFixed(8));
        holdings.set(symbol, holdings.get(symbol) + shares);
        insertTransaction.run(
          `loadtest-buy-${index}-${slot}`,
          'add',
          symbol,
          instrument.name,
          date,
          date,
          shares,
          valueEur,
          price,
          instrument.currency,
          fx,
          instrument.color,
        );
      }

      if (index > 4 && index % 3 === 0) {
        const symbol = buySymbols[0];
        const instrument = bySymbol.get(symbol);
        const held = holdings.get(symbol);
        const shares = Number(Math.min(held * 0.35, held - 0.000001).toFixed(8));
        if (shares > 0) {
          const date = addDays(monthDate(year, month, 24), 0) <= to ? monthDate(year, month, 24) : to;
          const price = deterministicPrice(instrument, date, from);
          const fx = instrument.currency === 'USD' ? deterministicPrice(bySymbol.get('USDEUR'), date, from) : 1;
          const valueEur = Number((shares * (instrument.currency === 'USD' ? price * fx : price)).toFixed(2));
          holdings.set(symbol, held - shares);
          insertTransaction.run(
            `loadtest-sell-${index}`,
            'remove',
            symbol,
            instrument.name,
            date,
            date,
            shares,
            valueEur,
            price,
            instrument.currency,
            fx,
            instrument.color,
          );
        }
      }
    }

    insertAutoPlan.run('SEMI', 100, 3, 1, '2024-01-01', 'monthly', null);
    const semi = bySymbol.get('SEMI');
    for (const { year, month } of monthsBetween('2024-01-01', to)) {
      const date = monthDate(year, month, 3);
      if (date > to) continue;
      const price = deterministicPrice(semi, date, from);
      const fx = deterministicPrice(bySymbol.get('USDEUR'), date, from);
      const priceEur = price * fx;
      const shares = Number((100 / priceEur).toFixed(8));
      holdings.set('SEMI', holdings.get('SEMI') + shares);
      insertAutoTransaction.run(
        `loadtest-auto-semi-${date}`,
        'SEMI',
        semi.name,
        date,
        date,
        shares,
        100,
        price,
        semi.currency,
        fx,
        semi.color,
        `auto:SEMI:${date}`,
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  bumpMeta(db, 'ledger_version');
  bumpMeta(db, 'price_version');
  return {
    from,
    to,
    cacheFrom,
    instruments: instruments.filter((instrument) => instrument.type !== 'fx').map((instrument) => instrument.symbol),
    transactions: db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count,
    prices: db.prepare('SELECT COUNT(*) AS count FROM daily_price_cache').get().count,
  };
}

module.exports = {
  defaultFrom,
  defaultTo,
  instruments,
  seedLoadtestDb,
};
