const path = require('node:path');

const typeAliases = {
  add: new Set(['add', 'buy', 'compra', 'comprar', 'c']),
  remove: new Set(['remove', 'sell', 'venta', 'vender', 'v']),
};

const LEGACY_GENERIC_SOURCES = new Set(['csv', 'xlsx', 'generic-csv', 'generic-xlsx']);

const adapterDefinitions = {
  'valorgrid-xlsx': {
    parser: 'xlsx',
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
    label: 'DEGIRO',
    edition: 'professional',
  },
  'ibkr-csv': {
    parser: 'pro-csv',
    profile: 'ibkr',
    label: 'Interactive Brokers',
    edition: 'professional',
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
    const proAdapters = require(resolvedPath);
    if (!proAdapters?.adapters?.length) return;
    for (const adapter of proAdapters.adapters) {
      if (!adapter?.source || !adapter?.label) continue;
      adapterDefinitions[adapter.source] = {
        parser: 'pro-csv',
        profile: adapter.source,
        label: adapter.label,
        edition: 'professional',
        parse: adapter.parse,
      };
    }
  } catch {
    // PRO adapters not available; continue with community only
  }
}
loadProAdapters();

function listImportSources(edition = 'community') {
  const allAdapters = { ...adapterDefinitions, ...knownProAdapters };
  const sources = [];

  for (const [source, def] of Object.entries(allAdapters)) {
    const isAvailable = def.edition === 'community' || edition === 'professional';
    sources.push({
      key: source,
      label: def.label,
      edition: def.edition || 'community',
      available: isAvailable,
    });
  }

  return sources;
}

module.exports = {
  typeAliases,
  adapterDefinitions,
  profileOverrides,
  LEGACY_GENERIC_SOURCES,
  listImportSources,
  loadProAdapters,
};
