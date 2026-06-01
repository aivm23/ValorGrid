const typeAliases = {
  add: new Set(['add', 'buy', 'compra', 'comprar', 'c']),
  remove: new Set(['remove', 'sell', 'venta', 'vender', 'v']),
};

const baseFieldAliases = {
  type: ['type', 'tipo', 'operacion', 'operación', 'side', 'action'],
  symbol: ['symbol', 'ticker', 'simbolo', 'símbolo', 'instrumento'],
  date: ['date', 'fecha', 'fecha operacion', 'fecha operación', 'fecha de operación'],
  marketDate: ['marketdate', 'market_date', 'fecha mercado'],
  shares: ['shares', 'acciones', 'titulos', 'títulos', 'cantidad', 'quantity'],
  price: ['price', 'precio', 'precio unitario'],
  valueEur: ['valueeur', 'value_eur', 'valor eur', 'valor €', 'importe eur', 'importe €', 'gross eur'],
  commissionEur: [
    'commissioneur',
    'commission_eur',
    'comision',
    'comision eur',
    'comisión',
    'comisión eur',
    'gastos',
    'comisiones',
    'fee',
    'broker fee',
    'comm/fee',
  ],
  currency: ['currency', 'divisa', 'moneda'],
  fxToEur: ['fxtoeur', 'fx_to_eur', 'tipo de cambio', 'fx', 'cambio', 'exchange rate', 'usdtoeur', 'usd_to_eur'],
  externalId: ['externalid', 'external_id', 'id externo', 'referencia', 'order id', 'transaction id'],
};

const adapterDefinitions = {
  csv: { parser: 'csv', profile: 'generic' },
  xlsx: { parser: 'xlsx', profile: 'generic' },
  'generic-csv': { parser: 'csv', profile: 'generic' },
  'generic-xlsx': { parser: 'xlsx', profile: 'generic' },
  'degiro-csv': { parser: 'csv', profile: 'degiro' },
  'ibkr-csv': { parser: 'csv', profile: 'ibkr' },
};

const profileOverrides = {
  degiro: {
    fieldAliases: {
      type: ['tipo', 'type', 'action'],
      symbol: ['ticker', 'symbol', 'symbol/isin', 'isin', 'producto', 'product'],
      date: ['date', 'fecha', 'execution date', 'date/time'],
      shares: ['quantity', 'cantidad', 'acciones', 'numero', 'número'],
      price: ['price', 'precio', 'precio de'],
      valueEur: ['total in eur', 'total eur', 'importe eur', 'valor eur', 'valor en eur'],
      commissionEur: [
        'fee in eur',
        'broker fee',
        'fees',
        'comision',
        'comisión',
        'comision autofx',
        'comisión autofx',
        'costes de transaccion y/o externos eur',
        'costes de transacción y/o externos eur',
      ],
      currency: ['currency', 'divisa', 'valor local'],
      fxToEur: ['exchange rate', 'fx', 'tipo de cambio'],
      externalId: ['id', 'order id', 'transaction id', 'symbol/isin', 'isin', 'id orden'],
    },
  },
  ibkr: {
    fieldAliases: {
      type: ['buy/sell', 'action', 'side'],
      symbol: ['symbol', 'ticker'],
      date: ['date/time', 'trade date', 'date'],
      shares: ['quantity', 'qty', 'shares'],
      price: ['t. price', 'tradeprice', 'price'],
      valueEur: ['valor eur', 'value eur'],
      commissionEur: ['comm/fee', 'commission', 'comision', 'comisión'],
      currency: ['currency', 'divisa'],
      fxToEur: ['fx rate to base', 'exchange rate', 'fx'],
      externalId: ['trade id', 'execution id', 'transaction id'],
    },
  },
};

module.exports = {
  typeAliases,
  baseFieldAliases,
  adapterDefinitions,
  profileOverrides,
};
