const path = require('node:path');

const typeAliases = {
  add: new Set(['add', 'buy', 'compra', 'comprar', 'c']),
  remove: new Set(['remove', 'sell', 'venta', 'vender', 'v']),
};

const adapterDefinitions = {
  'valorgrid-xlsx': {
    parser: 'exceljs',
    profile: 'valorgrid',
    defaultSheet: 'Movimientos',
    label: 'Plantilla Excel de ValorGrid',
    edition: 'community',
  },
};

const knownProAdapters = {
  'degiro-csv': {
    parser: 'pro-csv',
    profile: 'degiro',
    label: 'DEGIRO Transactions CSV',
    edition: 'professional',
  },
  'ibkr-csv': {
    parser: 'pro-csv',
    profile: 'ibkr',
    label: 'Interactive Brokers Transactions CSV',
    edition: 'professional',
  },
  'clicktrade-xlsx': {
    parser: 'pro-xlsx',
    profile: 'clicktrade',
    label: 'ClickTrade',
    edition: 'professional',
    inputKind: 'xlsx',
  },
};

const profileOverrides = {
  valorgrid: {
    fieldAliases: {
      type: ['Tipo'],
      symbol: ['Ticker'],
      date: ['Fecha'],
      marketDate: ['Fecha mercado'],
      shares: ['Acciones'],
      price: ['Precio'],
      valueEur: ['Valor EUR'],
      commissionEur: ['Comision EUR'],
      currency: ['Divisa'],
      fxToEur: ['FX a EUR'],
      externalId: ['Referencia'],
    },
  },
};

function loadProAdapters() {
  const proPath = process.env.VALORGRID_PRO_ADAPTERS_PATH;
  if (!proPath) return;
  try {
    const resolvedPath = path.resolve(proPath);
    let proAdapters;
    try {
      proAdapters = require(resolvedPath);
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') throw error;
      proAdapters = require(path.join(resolvedPath, 'index.cjs'));
    }
    registerProAdapters(proAdapters.adapters);
  } catch {
    // PRO adapters not available; continue with community only
  }
}
loadProAdapters();

function registerProAdapters(adapters = []) {
  if (!Array.isArray(adapters)) return;
  for (const adapter of adapters) {
    if (!adapter?.source || !adapter?.label) continue;
    adapterDefinitions[adapter.source] = {
      parser: adapter.inputKind === 'xlsx' ? 'pro-xlsx' : 'pro-csv',
      profile: adapter.profile || 'valorgrid',
      label: adapter.label,
      edition: 'professional',
      inputKind: adapter.inputKind || 'text',
      parse: adapter.parse,
      ...(adapter.comingSoon ? { comingSoon: adapter.comingSoon } : {}),
    };
  }
}

function listImportSources(edition = 'community') {
  const allAdapters = { ...knownProAdapters, ...adapterDefinitions };
  const sources = [];

  for (const [source, def] of Object.entries(allAdapters)) {
    const isAvailable = def.comingSoon ? false : def.edition === 'community' || edition === 'professional';
    sources.push({
      key: source,
      label: def.label,
      edition: def.edition || 'community',
      available: isAvailable,
      ...(def.inputKind ? { inputKind: def.inputKind } : {}),
      ...(def.comingSoon ? { comingSoon: true } : {}),
    });
  }

  return sources;
}

module.exports = {
  typeAliases,
  adapterDefinitions,
  knownProAdapters,
  profileOverrides,
  listImportSources,
  registerProAdapters,
  loadProAdapters,
};
