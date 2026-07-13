const defaultFrom = '2020-01-01';
const defaultTo = '2026-05-16';

const instruments = [
  {
    symbol: 'NVO',
    yahooSymbol: 'NOV.DE',
    name: 'Novo Nordisk',
    type: 'stock',
    currency: 'EUR',
    color: '#0d9488',
    base: 39,
  },
  {
    symbol: 'GOOG',
    yahooSymbol: 'GOOG',
    name: 'Alphabet',
    type: 'stock',
    currency: 'USD',
    color: '#ea580c',
    base: 367,
  },
  {
    symbol: 'META',
    yahooSymbol: 'META',
    name: 'Meta Platforms',
    type: 'stock',
    currency: 'USD',
    color: '#16a34a',
    base: 577,
  },
  {
    symbol: 'MSFT',
    yahooSymbol: 'MSFT',
    name: 'Microsoft',
    type: 'stock',
    currency: 'USD',
    color: '#0891b2',
    base: 379,
  },
  { symbol: 'AAPL', yahooSymbol: 'AAPL', name: 'Apple', type: 'stock', currency: 'USD', color: '#be123c', base: 298 },
  {
    symbol: 'SPPW',
    yahooSymbol: 'SPPW.DE',
    name: 'ETF MSCI World',
    type: 'etf',
    currency: 'EUR',
    color: '#a855f7',
    base: 46,
  },
  {
    symbol: 'ICGA',
    yahooSymbol: 'ICGA.DE',
    name: 'ETF MSCI China',
    type: 'etf',
    currency: 'EUR',
    color: '#dc2626',
    base: 5,
  },
  { symbol: 'U308', yahooSymbol: 'URA', name: 'ETF U308', type: 'etf', currency: 'USD', color: '#f59e0b', base: 48 },
  {
    symbol: 'SEMI',
    yahooSymbol: 'SMH',
    name: 'ETF Semiconductores',
    type: 'etf',
    currency: 'USD',
    color: '#0284c7',
    base: 660,
  },
  {
    symbol: 'USDEUR',
    yahooSymbol: 'USDEUR=X',
    name: 'USD/EUR',
    type: 'fx',
    currency: 'EUR',
    color: '#64748b',
    base: 0.9,
  },
  {
    symbol: 'GOLD',
    yahooSymbol: 'GC=F',
    name: 'Gold Spot',
    type: 'commodity',
    currency: 'USD',
    color: '#eab308',
    base: 4173,
    provider: 'alpha_vantage',
    providerSymbol: 'GOLD',
  },
  {
    symbol: 'SILVER',
    yahooSymbol: 'SI=F',
    name: 'Silver Spot',
    type: 'commodity',
    currency: 'USD',
    color: '#94a3b8',
    base: 65,
    provider: 'alpha_vantage',
    providerSymbol: 'SILVER',
  },
  {
    symbol: 'BRENT',
    yahooSymbol: 'BZ=F',
    name: 'Brent Crude',
    type: 'commodity',
    currency: 'USD',
    color: '#f97316',
    base: 81,
    provider: 'alpha_vantage',
    providerSymbol: 'BRENT',
  },
  {
    symbol: 'BTC',
    yahooSymbol: 'BTC-EUR',
    name: 'Bitcoin',
    type: 'crypto',
    currency: 'EUR',
    color: '#f7931a',
    base: 70000,
  },
];

// Alphabet's 20-for-1 split began trading on a split-adjusted basis on 2022-07-18.
const corporateActions = [
  {
    id: 'split:GOOG:loadtest-20220718',
    type: 'split',
    symbol: 'GOOG',
    yahooSymbol: 'GOOG',
    source: 'Yahoo Finance',
    sourceEventId: 'GOOG:2022-07-18:20:1',
    effectiveDate: '2022-07-18',
    oldShares: 1,
    newShares: 20,
    ratio: 20,
  },
];

const stockShareAmounts = [2, 2, 1, 1];

const liquidityAccounts = [
  {
    symbol: 'CASH_CUENTA_OPERATIVA_EUR',
    name: 'Cuenta operativa EUR',
    currency: 'EUR',
    color: '#06b6d4',
    cashBalance: 2500,
  },
  { symbol: 'CASH_BROKER_USD', name: 'Broker USD', currency: 'USD', color: '#0284c7', cashBalance: 1500 },
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

function loadtestPurchaseShares(instrument, index, slot, valueEur, priceEur) {
  if (instrument.type === 'stock') return stockShareAmounts[(index + slot) % stockShareAmounts.length];
  return Number((valueEur / priceEur).toFixed(8));
}

function loadtestSaleShares(instrument, held, ratio) {
  if (instrument.type === 'stock') {
    const maxShares = Math.max(0, Math.floor(held) - 1);
    return Math.min(Math.floor(held * ratio), maxShares);
  }
  return Number(Math.min(held * ratio, held - 0.000001).toFixed(8));
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
    DELETE FROM market_price_points;
    DELETE FROM market_price_ranges;
    DELETE FROM instrument_price_sources;
    DELETE FROM corporate_actions;
    DELETE FROM auto_plan_skips;
    DELETE FROM transactions;
    DELETE FROM auto_plans;
    DELETE FROM instrument_groups;
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
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?)`,
  );
  const insertGroup = db.prepare(
    `INSERT OR REPLACE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES (?, ?, ?, ?, 1, 1, ?, 1)`,
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
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin, auto_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL)`,
  );
  const insertAutoTransaction = db.prepare(
    `INSERT OR REPLACE INTO transactions
      (id, type, symbol, name, date, market_date, shares, value_eur, price, currency, fx_to_eur, color, origin, auto_key)
     VALUES (?, 'add', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?)`,
  );
  const insertAutoPlan = db.prepare(
    `INSERT OR REPLACE INTO auto_plans
      (symbol, amount_eur, day, enabled, start_date, frequency, weekday)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPriceSource = db.prepare(
    `INSERT OR REPLACE INTO instrument_price_sources
      (instrument_symbol, provider, provider_symbol, priority, enabled, pricing_mode, max_staleness_days)
     VALUES (?, ?, ?, ?, 1, 'provider', ?)`,
  );
  const insertMarketPricePoint = db.prepare(
    `INSERT OR REPLACE INTO market_price_points
      (instrument_symbol, provider, provider_symbol, date, price, currency, source, quality)
     VALUES (?, 'alpha_vantage', ?, ?, ?, ?, 'loadtest', 'ok')`,
  );
  const insertLiquidityGroup = db.prepare(
    `INSERT OR REPLACE INTO instrument_groups
      (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
     VALUES ('liquidez', 'Liquidez', '#06b6d4', 95, 1, 0, 0, 1)`,
  );
  const insertLiquidityAccount = db.prepare(
    `INSERT OR REPLACE INTO instruments
      (symbol, yahoo_symbol, name, type, currency, color, base_shares, cash_balance,
       cash_balance_updated_at, fallback_price, active, group_id, display_order,
       show_in_distribution, show_in_monthly)
     VALUES (?, ?, ?, 'cash', ?, ?, 0, ?, CURRENT_TIMESTAMP, 0, 1, 'liquidez', ?, 1, 0)`,
  );
  const insertCorporateAction = db.prepare(
    `INSERT OR REPLACE INTO corporate_actions
      (id, type, symbol, yahoo_symbol, source, source_event_id, effective_date, old_shares, new_shares, ratio)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  clearLoadtestTables(db);
  db.exec('BEGIN');
  try {
    const groups = [
      { id: 'core', name: 'Core', color: '#a855f7', order: 10, expandable: 0 },
      { id: 'stock-picking', name: 'Stock picking', color: '#16a34a', order: 20, expandable: 1 },
      { id: 'specialized', name: 'Especializado', color: '#f59e0b', order: 30, expandable: 0 },
      { id: 'general', name: 'General', color: '#64748b', order: 90, expandable: 0 },
    ];
    for (const group of groups) {
      insertGroup.run(group.id, group.name, group.color, group.order, group.expandable);
    }
    insertLiquidityGroup.run();
    for (const [index, account] of liquidityAccounts.entries()) {
      insertLiquidityAccount.run(
        account.symbol,
        account.symbol,
        account.name,
        account.currency,
        account.color,
        account.cashBalance,
        index + 1,
      );
    }

    function groupFor(symbol, type) {
      if (['SPPW', 'ICGA'].includes(symbol)) return 'core';
      if (['META', 'NVO'].includes(symbol) || type === 'stock') return 'stock-picking';
      if (['U308', 'GOLD', 'SILVER', 'BRENT'].includes(symbol)) return 'specialized';
      if (type === 'etf') return 'core';
      return 'general';
    }

    for (const instrument of instruments) {
      insertInstrument.run(
        instrument.symbol,
        instrument.yahooSymbol,
        instrument.name,
        instrument.type,
        instrument.currency,
        instrument.color,
        instrument.base,
        groupFor(instrument.symbol, instrument.type),
      );
      insertRange.run(instrument.yahooSymbol, cacheFrom, to);
      for (const date of dates) {
        insertDaily.run(instrument.yahooSymbol, date, deterministicPrice(instrument, date, from), instrument.currency);
      }
      if (instrument.provider) {
        insertPriceSource.run(instrument.symbol, instrument.provider, instrument.providerSymbol, 0, 45);
        insertPriceSource.run(instrument.symbol, 'yahoo', instrument.yahooSymbol, 10, 45);
        for (const date of dates) {
          insertMarketPricePoint.run(
            instrument.symbol,
            instrument.providerSymbol,
            date,
            deterministicPrice(instrument, date, from),
            instrument.currency,
          );
        }
      }
    }

    for (const action of corporateActions) {
      insertCorporateAction.run(
        action.id,
        action.type,
        action.symbol,
        action.yahooSymbol,
        action.source,
        action.sourceEventId,
        action.effectiveDate,
        action.oldShares,
        action.newShares,
        action.ratio,
      );
    }

    let nextCorporateActionIndex = 0;
    function applyCorporateActionsThrough(date) {
      while (corporateActions[nextCorporateActionIndex]?.effectiveDate <= date) {
        const action = corporateActions[nextCorporateActionIndex];
        holdings.set(action.symbol, holdings.get(action.symbol) * action.ratio);
        nextCorporateActionIndex += 1;
      }
    }

    for (const [index, { year, month }] of months.entries()) {
      if (index % 7 === 5) continue;
      const extraSymbols = ['GOLD', 'BTC'];
      const buySymbols = [
        instruments[index % 5].symbol,
        instruments[5 + (index % 3)].symbol,
        instruments[(index + 2) % 5].symbol,
        extraSymbols[index % 2],
      ];
      const buyDates = [3, 12, 21, 28].map((day) => monthDate(year, month, day));

      for (let slot = 0; slot < buySymbols.length; slot += 1) {
        const symbol = buySymbols[slot];
        const instrument = bySymbol.get(symbol);
        const date = buyDates[slot] <= to ? buyDates[slot] : to;
        applyCorporateActionsThrough(date);
        const price = deterministicPrice(instrument, date, from);
        const fx = instrument.currency === 'USD' ? deterministicPrice(bySymbol.get('USDEUR'), date, from) : 1;
        const priceEur = instrument.currency === 'USD' ? price * fx : price;
        const plannedValueEur = 15 + ((index + slot) % 6) * 5;
        const shares = loadtestPurchaseShares(instrument, index, slot, plannedValueEur, priceEur);
        const valueEur = instrument.type === 'stock' ? Number((shares * priceEur).toFixed(2)) : plannedValueEur;
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
        const date = addDays(monthDate(year, month, 24), 0) <= to ? monthDate(year, month, 24) : to;
        applyCorporateActionsThrough(date);
        const held = holdings.get(symbol);
        const shares = loadtestSaleShares(instrument, held, 0.35);
        if (shares > 0) {
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

      if (index > 6 && index % 6 === 0) {
        const extraSymbols = ['GOLD', 'BTC'];
        const sym = extraSymbols[index % 2];
        const extraInstrument = bySymbol.get(sym);
        const date = addDays(monthDate(year, month, 25), 0) <= to ? monthDate(year, month, 25) : to;
        applyCorporateActionsThrough(date);
        const held = holdings.get(sym);
        const shares = loadtestSaleShares(extraInstrument, held, 0.2);
        if (shares > 0) {
          const price = deterministicPrice(extraInstrument, date, from);
          const fx = extraInstrument.currency === 'USD' ? deterministicPrice(bySymbol.get('USDEUR'), date, from) : 1;
          const valueEur = Number((shares * (extraInstrument.currency === 'USD' ? price * fx : price)).toFixed(2));
          holdings.set(sym, held - shares);
          insertTransaction.run(
            `loadtest-sell-extra-${index}`,
            'remove',
            sym,
            extraInstrument.name,
            date,
            date,
            shares,
            valueEur,
            price,
            extraInstrument.currency,
            fx,
            extraInstrument.color,
          );
        }
      }
    }

    insertAutoPlan.run('GOLD', 6, 15, 1, '2024-06-01', 'monthly', null);
    const gold = bySymbol.get('GOLD');
    for (const { year, month } of monthsBetween('2024-06-01', to)) {
      const date = monthDate(year, month, 15);
      if (date > to) continue;
      const price = deterministicPrice(gold, date, from);
      const fx = deterministicPrice(bySymbol.get('USDEUR'), date, from);
      const valueEur = 6;
      const priceEur = price * fx;
      const shares = Number((valueEur / priceEur).toFixed(8));
      holdings.set('GOLD', holdings.get('GOLD') + shares);
      insertAutoTransaction.run(
        `loadtest-auto-gold-${date}`,
        'GOLD',
        gold.name,
        date,
        date,
        shares,
        valueEur,
        price,
        gold.currency,
        fx,
        gold.color,
        `auto:GOLD:${date}`,
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
    corporateActions: db.prepare('SELECT COUNT(*) AS count FROM corporate_actions').get().count,
    liquidityAccounts: db.prepare("SELECT COUNT(*) AS count FROM instruments WHERE type = 'cash' AND active = 1").get()
      .count,
  };
}

module.exports = {
  defaultFrom,
  defaultTo,
  instruments,
  corporateActions,
  liquidityAccounts,
  stockShareAmounts,
  seedLoadtestDb,
};
