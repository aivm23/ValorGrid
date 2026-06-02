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

module.exports = {
  typeAliases,
  adapterDefinitions,
  profileOverrides,
  LEGACY_GENERIC_SOURCES,
};
