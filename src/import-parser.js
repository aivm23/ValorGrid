const crypto = require('node:crypto');
const XLSX = require('../vendor/xlsx.full.min.js');

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
  commissionEur: ['commissioneur', 'commission_eur', 'comision', 'comision eur', 'comisión', 'comisión eur', 'gastos', 'comisiones', 'fee', 'broker fee', 'comm/fee'],
  currency: ['currency', 'divisa', 'moneda'],
  usdToEur: ['usdtoeur', 'usd_to_eur', 'tipo de cambio', 'fx', 'cambio', 'exchange rate'],
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
      symbol: ['ticker', 'symbol', 'product', 'isin'],
      date: ['date', 'fecha', 'execution date', 'date/time'],
      shares: ['quantity', 'cantidad', 'acciones'],
      price: ['price', 'precio'],
      valueEur: ['total in eur', 'total eur', 'importe eur', 'valor eur'],
      commissionEur: ['fee in eur', 'broker fee', 'fees', 'comision', 'comisión'],
      currency: ['currency', 'divisa'],
      usdToEur: ['exchange rate', 'fx', 'tipo de cambio'],
      externalId: ['id', 'order id', 'transaction id'],
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
      usdToEur: ['fx rate to base', 'exchange rate', 'fx'],
      externalId: ['trade id', 'execution id', 'transaction id'],
    },
  },
};

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function chooseDelimiter(text) {
  const firstLine = String(text || '').split(/\r?\n/).find((line) => line.trim()) || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function parseCsvRows(content) {
  const text = String(content || '').replace(/^\uFEFF/, '');
  const delimiter = chooseDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  row.push(cell);
  rows.push(row);

  const nonEmptyRows = rows.filter((item) => item.some((value) => String(value).trim() !== ''));
  if (nonEmptyRows.length < 2) return { headers: [], rows: [] };
  const headers = nonEmptyRows[0].map((header) => String(header || '').trim());
  return {
    headers,
    rows: nonEmptyRows.slice(1).map((values, rowIndex) => ({
      rowIndex: rowIndex + 2,
      values,
      data: Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
    })),
  };
}

function parseXlsxRows(contentBase64, sheetNameInput) {
  const buffer = Buffer.from(String(contentBase64 || ''), 'base64');
  if (!buffer.length) throw new Error('Contenido XLSX obligatorio');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const sheets = workbook.SheetNames || [];
  if (!sheets.length) throw new Error('El archivo XLSX no contiene hojas');
  const selectedSheet = sheetNameInput && sheets.includes(sheetNameInput) ? sheetNameInput : sheets[0];
  const worksheet = workbook.Sheets[selectedSheet];
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const nonEmptyRows = matrix.filter((item) => item.some((value) => String(value).trim() !== ''));
  if (nonEmptyRows.length < 2) return { headers: [], rows: [], sheets, selectedSheet };
  const headers = nonEmptyRows[0].map((header) => String(header || '').trim());
  return {
    headers,
    rows: nonEmptyRows.slice(1).map((values, rowIndex) => ({
      rowIndex: rowIndex + 2,
      values,
      data: Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
    })),
    sheets,
    selectedSheet,
  };
}

function parseNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const cleaned = text.replace(/[€$%\s]/g, '');
  const decimalComma = /,\d{1,8}$/.test(cleaned);
  const normalized = decimalComma ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDateValue(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const isoWithTime = text.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoWithTime) return isoWithTime[1];
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeType(value) {
  const key = normalizeHeader(value);
  if (typeAliases.add.has(key)) return 'add';
  if (typeAliases.remove.has(key)) return 'remove';
  return null;
}

function resolveAdapter(sourceInput = 'csv') {
  const source = String(sourceInput || 'csv').trim().toLowerCase();
  const adapter = adapterDefinitions[source];
  if (!adapter) throw new Error(`Origen de importación no soportado: ${sourceInput}`);
  return { source, ...adapter };
}

function resolveFieldAliases(profile, field) {
  const profileAliases = profileOverrides[profile]?.fieldAliases?.[field] || [];
  return [...profileAliases, ...(baseFieldAliases[field] || [])];
}

function mappedValue(row, mapping, profile, field) {
  const explicit = mapping?.[field];
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    if (typeof explicit === 'number') return row.values[explicit] ?? '';
    if (/^\d+$/.test(String(explicit))) return row.values[Number(explicit)] ?? '';
    return row.data[explicit] ?? '';
  }
  const normalizedEntries = Object.entries(row.data).map(([key, value]) => [normalizeHeader(key), value]);
  for (const alias of resolveFieldAliases(profile, field)) {
    const target = normalizeHeader(alias);
    const found = normalizedEntries.find(([key]) => key === target);
    if (found) return found[1];
  }
  return '';
}

function inferTypeFromData(explicitType, rawShares, valueEurInput) {
  if (explicitType) return explicitType;
  if (Number.isFinite(rawShares)) return rawShares < 0 ? 'remove' : rawShares > 0 ? 'add' : null;
  if (Number.isFinite(valueEurInput)) return valueEurInput < 0 ? 'add' : valueEurInput > 0 ? 'remove' : null;
  return null;
}

function normalizeImportRow(ctx, row, mapping = {}, source = 'csv', profile = 'generic') {
  const { normalizeSymbol, toEur } = ctx;
  const explicitType = normalizeType(mappedValue(row, mapping, profile, 'type'));
  const symbol = normalizeSymbol(mappedValue(row, mapping, profile, 'symbol'));
  const date = parseDateValue(mappedValue(row, mapping, profile, 'date'));
  const marketDate = parseDateValue(mappedValue(row, mapping, profile, 'marketDate')) || date;
  const rawShares = parseNumber(mappedValue(row, mapping, profile, 'shares'));
  const inferredType = inferTypeFromData(explicitType, rawShares, parseNumber(mappedValue(row, mapping, profile, 'valueEur')));
  const shares = Number.isFinite(rawShares) ? Math.abs(rawShares) : rawShares;
  const rawPrice = parseNumber(mappedValue(row, mapping, profile, 'price'));
  const price = Number.isFinite(rawPrice) ? Math.abs(rawPrice) : rawPrice;
  const rawValueEurInput = parseNumber(mappedValue(row, mapping, profile, 'valueEur'));
  const valueEurInput = Number.isFinite(rawValueEurInput) ? Math.abs(rawValueEurInput) : rawValueEurInput;
  const commissionEur = Math.abs(parseNumber(mappedValue(row, mapping, profile, 'commissionEur')) || 0);
  const currency = String(mappedValue(row, mapping, profile, 'currency') || 'EUR').trim().toUpperCase();
  const usdToEur = currency === 'USD' ? parseNumber(mappedValue(row, mapping, profile, 'usdToEur')) : 1;
  const externalId = String(mappedValue(row, mapping, profile, 'externalId') || '').trim() || null;
  const errors = [];

  if (!inferredType) errors.push('Tipo no reconocido');
  if (!symbol) errors.push('Ticker obligatorio');
  if (!date) errors.push('Fecha inválida');
  if (!Number.isFinite(shares) || shares <= 0) errors.push('Acciones debe ser mayor que 0');
  if (!Number.isFinite(price) || price <= 0) errors.push('Precio debe ser mayor que 0');
  if (!['EUR', 'USD'].includes(currency)) errors.push('Divisa no soportada');
  if (currency === 'USD' && (!Number.isFinite(usdToEur) || usdToEur <= 0)) errors.push('FX USD/EUR obligatorio');

  const computedValueEur =
    Number.isFinite(shares) && Number.isFinite(price) && Number.isFinite(usdToEur)
      ? shares * toEur(price, currency, usdToEur)
      : null;
  const valueEur = Number.isFinite(valueEurInput) && valueEurInput > 0 ? valueEurInput : computedValueEur;
  if (!Number.isFinite(valueEur) || valueEur <= 0) errors.push('Valor EUR debe ser mayor que 0');
  if (Number.isFinite(valueEurInput) && Number.isFinite(computedValueEur)) {
    const tolerance = Math.max(0.05, Math.abs(computedValueEur) * 0.02);
    if (Math.abs(valueEurInput - computedValueEur) > tolerance) errors.push('Valor EUR no cuadra con precio, acciones y FX');
  }

  const normalized = {
    type: inferredType,
    symbol,
    date,
    marketDate,
    shares,
    valueEur,
    price,
    currency,
    usdToEur: usdToEur || 1,
    commissionEur,
    cashFlowEur: inferredType === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur),
    externalId,
    source,
  };
  normalized.rowHash = sha256(JSON.stringify(normalized));
  normalized.transactionId = `import:${source}:${normalized.rowHash.slice(0, 24)}`;
  return { normalized, errors };
}

function summarizeImportRows(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.rowCount += 1;
      if (row.status === 'error') summary.errorCount += 1;
      if (row.status === 'duplicate') summary.duplicateCount += 1;
      if (row.status === 'valid') {
        if (row.normalized.type === 'add') summary.buys += 1;
        if (row.normalized.type === 'remove') summary.sells += 1;
        summary.valueEur += Number(row.normalized.valueEur || 0);
        summary.commissionEur += Number(row.normalized.commissionEur || 0);
        summary.cashFlowEur += Number(row.normalized.cashFlowEur || 0);
        summary.symbols.add(row.normalized.symbol);
        if (!summary.firstDate || row.normalized.date < summary.firstDate) summary.firstDate = row.normalized.date;
        if (!summary.lastDate || row.normalized.date > summary.lastDate) summary.lastDate = row.normalized.date;
      }
      return summary;
    },
    {
      rowCount: 0,
      errorCount: 0,
      duplicateCount: 0,
      buys: 0,
      sells: 0,
      valueEur: 0,
      commissionEur: 0,
      cashFlowEur: 0,
      firstDate: null,
      lastDate: null,
      symbols: new Set(),
    },
  );
}

function serializeSummary(summary) {
  return { ...summary, symbols: Array.from(summary.symbols || []) };
}

function parseImportPayload(input, adapter) {
  if (adapter.parser === 'csv') {
    const content = String(input.content || input.csv || '');
    if (!content.trim()) throw new Error('Contenido CSV obligatorio');
    return {
      parsed: parseCsvRows(content),
      fileHash: sha256(content),
      payloadHash: sha256(`${adapter.profile}:${content}`),
      sheets: [],
      selectedSheet: null,
    };
  }

  const contentBase64 = String(input.contentBase64 || '').trim();
  if (!contentBase64) throw new Error('Contenido XLSX obligatorio');
  const parsed = parseXlsxRows(contentBase64, input.sheetName || null);
  return {
    parsed: { headers: parsed.headers, rows: parsed.rows },
    fileHash: sha256(contentBase64),
    payloadHash: sha256(`${adapter.profile}:${parsed.selectedSheet}:${contentBase64}`),
    sheets: parsed.sheets,
    selectedSheet: parsed.selectedSheet,
  };
}

module.exports = {
  sha256,
  resolveAdapter,
  parseImportPayload,
  normalizeImportRow,
  summarizeImportRows,
  serializeSummary,
};
