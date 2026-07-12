function normalizeRowDecisions(input = {}) {
  const rowActions = input.rowActions && typeof input.rowActions === 'object' ? input.rowActions : {};
  const rowMappings = input.rowMappings && typeof input.rowMappings === 'object' ? input.rowMappings : {};
  const rowEdits = input.rowEdits && typeof input.rowEdits === 'object' ? input.rowEdits : {};
  const byIndex = new Map();
  for (const [rawIndex, rawAction] of Object.entries(rowActions)) {
    const rowIndex = Number(rawIndex);
    if (!Number.isFinite(rowIndex)) continue;
    const action = String(rawAction || '')
      .trim()
      .toLowerCase();
    if (!['import', 'skip'].includes(action)) continue;
    byIndex.set(rowIndex, { ...(byIndex.get(rowIndex) || {}), action });
  }
  for (const [rawIndex, rawMapping] of Object.entries(rowMappings)) {
    const rowIndex = Number(rawIndex);
    if (!Number.isFinite(rowIndex)) continue;
    const symbol =
      typeof rawMapping === 'string'
        ? rawMapping.trim().toUpperCase()
        : String(rawMapping?.symbol || '')
            .trim()
            .toUpperCase();
    if (!symbol) continue;
    byIndex.set(rowIndex, { ...(byIndex.get(rowIndex) || {}), symbol });
  }
  for (const [rawIndex, rawEdit] of Object.entries(rowEdits)) {
    const rowIndex = Number(rawIndex);
    if (!Number.isFinite(rowIndex) || !rawEdit || typeof rawEdit !== 'object' || Array.isArray(rawEdit)) continue;
    byIndex.set(rowIndex, { ...(byIndex.get(rowIndex) || {}), edit: rawEdit });
  }
  return byIndex;
}

function parseEditNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function parseEditDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return '';
}

function applyRowEdit(normalized, edit = {}, source = 'import', rebuildIdentity = () => {}) {
  const next = { ...normalized };
  const errors = [];

  if (edit.symbol !== undefined) {
    const symbol = String(edit.symbol || '')
      .trim()
      .toUpperCase();
    if (!symbol) errors.push('Ticker vacío en edición');
    else next.symbol = symbol;
  }
  if (edit.type !== undefined) {
    const type = String(edit.type || '')
      .trim()
      .toLowerCase();
    if (!['add', 'remove'].includes(type)) errors.push('Tipo inválido en edición');
    else next.type = type;
  }
  if (edit.date !== undefined) {
    const date = parseEditDate(edit.date);
    if (!date) errors.push('Fecha inválida en edición');
    else next.date = date;
  }
  if (edit.shares !== undefined) {
    const shares = parseEditNumber(edit.shares);
    if (!Number.isFinite(shares) || shares <= 0) errors.push('Acciones inválidas en edición');
    else next.shares = Number(shares);
  }
  if (edit.price !== undefined) {
    const price = parseEditNumber(edit.price);
    if (!Number.isFinite(price) || price <= 0) errors.push('Precio inválido en edición');
    else next.price = Number(price);
  }
  if (edit.valueEur !== undefined) {
    const valueEur = parseEditNumber(edit.valueEur);
    if (!Number.isFinite(valueEur) || valueEur <= 0) errors.push('Valor EUR inválido en edición');
    else next.valueEur = Number(valueEur);
  }
  if (edit.commissionEur !== undefined) {
    const commissionEur = parseEditNumber(edit.commissionEur);
    if (!Number.isFinite(commissionEur) || commissionEur < 0) errors.push('Comisión inválida en edición');
    else next.commissionEur = Number(commissionEur);
  }
  if (edit.currency !== undefined) {
    const currency = String(edit.currency || '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('Divisa inválida en edición');
    else next.currency = currency;
  }
  if (edit.fxToEur !== undefined) {
    const fx = parseEditNumber(edit.fxToEur);
    if (!Number.isFinite(fx) || fx <= 0) errors.push('FX inválido en edición');
    else next.fxToEur = Number(fx);
  }

  if (!errors.length) {
    const commission = Number(next.commissionEur || 0);
    if (!Number.isFinite(next.valueEur) && Number.isFinite(next.shares) && Number.isFinite(next.price)) {
      const fx = Number(next.fxToEur || 1);
      next.valueEur = Number((next.shares * next.price * fx).toFixed(6));
    }
    next.cashFlowEur = next.type === 'remove' ? next.valueEur - commission : -(next.valueEur + commission);
    rebuildIdentity(next, source);
  }

  return { normalized: next, errors };
}

function buildDetectedInstrumentOutput(detectedInstruments) {
  return Array.from(detectedInstruments.values()).map((item) => ({
    ...item,
    buys: item.buys || 0,
    sells: item.sells || 0,
    approxValueEur: Number((item.approxValueEur || 0).toFixed(2)),
    firstDate: item.firstDate || null,
    lastDate: item.lastDate || null,
    rowIndexes: Array.from(item.rowIndexes || []),
  }));
}

function buildImpactPreview(ctx, rows) {
  const impactBySymbol = new Map();
  for (const row of rows) {
    if (row.status !== 'valid' || row.rowKind !== 'trade') continue;
    const symbol = row.normalized.symbol;
    if (!symbol) continue;
    if (!impactBySymbol.has(symbol)) {
      impactBySymbol.set(symbol, {
        symbol,
        beforeShares: Number(ctx.getPositionShares(symbol, ctx.getToday()) || 0),
        deltaShares: 0,
        buys: 0,
        sells: 0,
        valueEur: 0,
        commissionEur: 0,
        cashFlowEur: 0,
      });
    }
    const item = impactBySymbol.get(symbol);
    const sign = ctx.transactionSign(row.normalized.type);
    item.deltaShares += sign * Number(row.normalized.shares || 0);
    if (row.normalized.type === 'add') item.buys += 1;
    else item.sells += 1;
    item.valueEur += Number(row.normalized.valueEur || 0);
    item.commissionEur += Number(row.normalized.commissionEur || 0);
    item.cashFlowEur += Number(row.normalized.cashFlowEur || 0);
  }
  const instruments = Array.from(impactBySymbol.values()).map((item) => ({
    ...item,
    afterShares: Number((item.beforeShares + item.deltaShares).toFixed(6)),
    deltaShares: Number(item.deltaShares.toFixed(6)),
    valueEur: Number(item.valueEur.toFixed(2)),
    commissionEur: Number(item.commissionEur.toFixed(2)),
    cashFlowEur: Number(item.cashFlowEur.toFixed(2)),
  }));
  return {
    buyCount: instruments.reduce((sum, item) => sum + item.buys, 0),
    sellCount: instruments.reduce((sum, item) => sum + item.sells, 0),
    instrumentCount: instruments.length,
    totalValueEur: Number(instruments.reduce((sum, item) => sum + item.valueEur, 0).toFixed(2)),
    totalCommissionEur: Number(instruments.reduce((sum, item) => sum + item.commissionEur, 0).toFixed(2)),
    totalCashFlowEur: Number(instruments.reduce((sum, item) => sum + item.cashFlowEur, 0).toFixed(2)),
    instruments: instruments.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
}

module.exports = {
  normalizeRowDecisions,
  applyRowEdit,
  buildDetectedInstrumentOutput,
  buildImpactPreview,
};
