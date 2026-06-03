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
  'pro-broker-a-csv': {
    parser: 'pro-csv',
    profile: 'pro-broker-a',
    label: 'Broker A',
    edition: 'professional',
  },
  'pro-broker-b-csv': {
    parser: 'pro-csv',
    profile: 'pro-broker-b',
    label: 'Broker B',
    edition: 'professional',
    comingSoon: true,
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
    if (!proAdapters?.adapters?.length) return;
    for (const adapter of proAdapters.adapters) {
      if (!adapter?.source || !adapter?.label) continue;
      adapterDefinitions[adapter.source] = {
        parser: 'pro-csv',
        profile: adapter.profile || 'valorgrid',
        label: adapter.label,
        edition: 'professional',
        parse: adapter.parse,
        ...(adapter.comingSoon ? { comingSoon: adapter.comingSoon } : {}),
      };
    }
  } catch {
    // PRO adapters not available; continue with community only
  }
}
loadProAdapters();

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
      ...(def.comingSoon ? { comingSoon: true } : {}),
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
