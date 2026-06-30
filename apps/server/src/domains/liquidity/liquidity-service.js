const { assertCtxDeps } = require('../../platform/ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['repositories', 'normalizeSymbol', 'getToday', 'getFxToEur', 'invalidateLedger'], 'liquidity-service');

  const { repositories, normalizeSymbol, getToday, getFxToEur, invalidateLedger } = ctx;
  const repository = repositories.liquidity;
  if (!repository) throw new Error('liquidity-service requires ctx.repositories.liquidity');

  function normalizeColor(value, fallback = '#06b6d4') {
    const color = String(value || fallback).trim();
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Color must be a hex value');
    return color;
  }

  function normalizeCurrency(value) {
    const currency = String(value || 'EUR').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a 3-letter code');
    return currency;
  }

  function normalizeBalance(value) {
    const balance = Number(value ?? 0);
    if (!Number.isFinite(balance) || balance < 0) throw new Error('Liquidity balance must be zero or greater');
    return balance;
  }

  function normalizeName(value) {
    const name = String(value || '').trim();
    if (!name) throw new Error('Liquidity account name is required');
    return name.slice(0, 80);
  }

  function symbolBaseFromName(name, currency) {
    return `CASH_${name}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
      .slice(0, 32) + `_${currency}`;
  }

  function nextCashSymbol(name, currency) {
    const base = normalizeSymbol(symbolBaseFromName(name, currency));
    if (!repository.symbolExists(base)) return base;
    for (let index = 2; index < 1000; index += 1) {
      const candidate = normalizeSymbol(`${base}_${index}`);
      if (!repository.symbolExists(candidate)) return candidate;
    }
    throw new Error('Unable to allocate liquidity account symbol');
  }

  async function enrichAccount(account) {
    const currency = normalizeCurrency(account.currency);
    const balance = normalizeBalance(account.cashBalance);
    let fxToEur = 1;
    let valueEur = balance;
    let dataQuality = 'ok';
    if (currency !== 'EUR') {
      const fx = await getFxToEur(currency, getToday(), { allowStale: true });
      if (!Number.isFinite(Number(fx))) {
        fxToEur = null;
        valueEur = 0;
        dataQuality = 'missing_fx';
      } else {
        fxToEur = Number(fx);
        valueEur = balance * fxToEur;
      }
    }
    return { ...account, currency, cashBalance: balance, fxToEur, valueEur, dataQuality };
  }

  async function getLiquidityState() {
    const group = repository.ensureLiquidityGroup();
    const accounts = await Promise.all(repository.listLiquidityAccounts().map(enrichAccount));
    return {
      group,
      accounts,
      totalEur: accounts.reduce((sum, account) => sum + Number(account.valueEur || 0), 0),
      updatedAt: new Date().toISOString(),
    };
  }

  async function createLiquidityAccount(input = {}) {
    repository.ensureLiquidityGroup();
    const name = normalizeName(input.name);
    const currency = normalizeCurrency(input.currency);
    const account = repository.insertLiquidityAccount({
      symbol: nextCashSymbol(name, currency),
      name,
      currency,
      color: normalizeColor(input.color),
      cashBalance: normalizeBalance(input.cashBalance ?? input.balance),
      displayOrder: repository.countLiquidityAccounts() + 1,
      showInDistribution: input.showInDistribution !== false,
    });
    invalidateLedger(getToday(), 'liquidity-create');
    return { account: await enrichAccount(account), state: await getLiquidityState() };
  }

  async function updateLiquidityAccount(symbol, input = {}) {
    repository.ensureLiquidityGroup();
    const normalized = normalizeSymbol(symbol);
    const existing = repository.findLiquidityAccount(normalized);
    if (!existing) throw new Error('Liquidity account not found');
    const account = repository.updateLiquidityAccount(normalized, {
      name: normalizeName(input.name ?? existing.name),
      currency: normalizeCurrency(input.currency ?? existing.currency),
      color: normalizeColor(input.color ?? existing.color),
      cashBalance: normalizeBalance(input.cashBalance ?? input.balance ?? existing.cashBalance),
      displayOrder: Number(input.displayOrder ?? existing.displayOrder ?? 0),
      showInDistribution:
        input.showInDistribution === undefined ? Boolean(existing.showInDistribution) : Boolean(input.showInDistribution),
    });
    invalidateLedger(getToday(), 'liquidity-update');
    return { account: await enrichAccount(account), state: await getLiquidityState() };
  }

  async function deleteLiquidityAccount(symbol) {
    const normalized = normalizeSymbol(symbol);
    if (!repository.findLiquidityAccount(normalized)) return { symbol: normalized, status: 'missing' };
    repository.deactivateLiquidityAccount(normalized);
    invalidateLedger(getToday(), 'liquidity-delete');
    return { symbol: normalized, status: 'deleted', state: await getLiquidityState() };
  }

  const api = {
    getLiquidityState,
    createLiquidityAccount,
    updateLiquidityAccount,
    deleteLiquidityAccount,
  };

  Object.assign(ctx.services.liquidity, api);
  Object.assign(ctx, api);
};
