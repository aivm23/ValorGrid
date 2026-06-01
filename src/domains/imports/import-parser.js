const crypto = require('node:crypto');
const XLSX = require('../../../vendor/xlsx.full.min.js');
const { typeAliases, baseFieldAliases, adapterDefinitions, profileOverrides } = require('./import-profiles');
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function normalizeHeader(value) {
  let text = String(value || '');
  for (let attempt = 0; attempt < 3 && /[ÃƒÃ‚]/.test(text); attempt += 1) {
    try {
      const decoded = Buffer.from(text, 'latin1').toString('utf8');
      if (!decoded || decoded === text || decoded.includes('ï¿½')) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
function headerSet(headers = []) { return new Set((headers || []).map(normalizeHeader)); }
function detectDegiroFileSubtype(headers = []) {
  const normalized = headerSet(headers);
  const has = (key) => normalized.has(normalizeHeader(key));
  const hasIndexedTransactionShape =
    headers.length >= 17 &&
    has('fecha') &&
    has('producto') &&
    has('isin') &&
    has('precio') &&
    has('valor local') &&
    (has('valor eur') || has('valor en eur')) &&
    has('id orden');
  const snapshotLike = has('producto') && (has('symbol/isin') || has('isin')) && has('cantidad') && has('valor en eur');
  const transactionLike =
    has('fecha') &&
    (has('numero') || has('nÃºmero')) &&
    has('precio') &&
    (has('valor eur') || has('valor en eur')) &&
    has('id orden');
  if (transactionLike || hasIndexedTransactionShape) return 'transactions_export';
  if (snapshotLike) return 'portfolio_snapshot';
  return 'unknown';
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
    } else if (char !== '\r') {
      cell += char;
    }
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
      headers,
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
      headers,
      data: Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
    })),
    sheets,
    selectedSheet,
  };
}
function parseNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let cleaned = text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[â‚¬$Â£%]/g, '')
    .replace(/[âˆ’â€“â€”]/g, '-');
  if (/^\(.*\)$/.test(cleaned)) cleaned = `-${cleaned.slice(1, -1)}`;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }
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
function defaultDegiroSnapshotDate(ctx, profile, dateInput, row, fileSubtype = 'unknown') {
  if (dateInput) return parseDateValue(dateInput);
  if (profile !== 'degiro' || typeof ctx.getToday !== 'function') return null;
  const subtype = fileSubtype === 'unknown' ? detectDegiroFileSubtype(Object.keys(row.data || {})) : fileSubtype;
  return subtype === 'portfolio_snapshot' ? ctx.getToday() : null;
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
  if (!adapter) throw new Error(`Origen de importaciÃ³n no soportado: ${sourceInput}`);
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
function rowValueByHeaders(row, aliases = []) {
  const headers = row.headers || [];
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const index = normalizedHeaders.findIndex((item) => item === target);
    if (index >= 0) return row.values[index] ?? '';
  }
  return '';
}
const degiroTransactionColumns = {
  date: 0, product: 2, isin: 3, exchange: 4, center: 5, shares: 6, price: 7, priceCurrency: 8,
  localValue: 9, localCurrency: 10, valueEur: 11, fx: 12, autoFx: 13, costs: 14, totalEur: 15, externalId: 16,
};
function degiroTransactionCell(row, field) {
  const index = degiroTransactionColumns[field];
  if (!Number.isInteger(index)) return '';
  return row.values?.[index] ?? '';
}
function degiroCurrencyHint(row) {
  const headers = row.headers || [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const candidates = [];
  const priceIndex = normalizedHeaders.findIndex((item) => item === 'precio');
  if (priceIndex >= 0 && row.values[priceIndex + 1] !== undefined) {
    candidates.push(String(row.values[priceIndex + 1] || '').trim().toUpperCase());
  }
  const localIndex = normalizedHeaders.findIndex((item) => item === 'valor local');
  if (localIndex >= 0 && row.values[localIndex + 1] !== undefined) {
    candidates.push(String(row.values[localIndex + 1] || '').trim().toUpperCase());
  }
  candidates.push(String(mappedValue(row, {}, 'degiro', 'currency') || '').trim().toUpperCase());
  return candidates.find((item) => /^[A-Z]{3}$/.test(item)) || '';
}
function inferTypeFromData(explicitType, rawShares, valueEurInput) {
  if (explicitType) return explicitType;
  if (Number.isFinite(rawShares)) return rawShares < 0 ? 'remove' : rawShares > 0 ? 'add' : null;
  if (Number.isFinite(valueEurInput)) return valueEurInput < 0 ? 'add' : valueEurInput > 0 ? 'remove' : null;
  return null;
}
function looksLikeIsin(value) {
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(String(value || '').trim().toUpperCase());
}
function extractExternalIdentifiers(profile, row, symbol, fileSubtype = 'unknown') {
  const identifiers = [];
  if (symbol) {
    identifiers.push({ provider: 'manual', identifierType: 'ticker', identifierValue: String(symbol || '').toUpperCase() });
  }
  if (profile !== 'degiro') return identifiers;
  const degiroTransactions = profile === 'degiro' && fileSubtype === 'transactions_export';
  const isinRaw = String(rowValueByHeaders(row, ['Symbol/ISIN', 'symbol/isin', 'ISIN', 'isin']) || (degiroTransactions ? degiroTransactionCell(row, 'isin') : ''))
    .trim()
    .toUpperCase();
  if (looksLikeIsin(isinRaw)) {
    identifiers.push({ provider: 'global', identifierType: 'isin', identifierValue: isinRaw });
  }
  const product = String(rowValueByHeaders(row, ['Producto', 'Product', 'producto', 'product']) || (degiroTransactions ? degiroTransactionCell(row, 'product') : '')).trim();
  if (product) {
    identifiers.push({ provider: 'degiro', identifierType: 'broker_product', identifierValue: product.toUpperCase(), displayName: product });
  }
  const exchange = String(
    rowValueByHeaders(row, ['Bolsa de referencia', 'Centro de ejecucion', 'Centro de ejecuciÃ³n']) || '',
  )
    .trim()
    .toUpperCase();
  if (exchange) {
    identifiers.push({ provider: 'degiro', identifierType: 'exchange', identifierValue: exchange });
  }
  return identifiers;
}
function normalizeText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function degiroCorporateActionReason(row, fileSubtype, values) {
  if (fileSubtype !== 'transactions_export') return null;
  const product = normalizeText(rowValueByHeaders(row, ['Producto', 'Product', 'producto', 'product']) || degiroTransactionCell(row, 'product'));
  const centerRaw = String(
    rowValueByHeaders(row, ['Centro de ejecuciÃ³n', 'Centro de ejecucion', 'Execution center', 'Execution venue']) || '',
  ).trim();
  const hasRightsKeyword = /\b(RTS?|RIGHTS?|NON\s*TRADEABLE)\b/.test(product);
  const centerLooksEmpty = !centerRaw || centerRaw === '-' || centerRaw === '--';
  const hasZeroFlow =
    values.shares === 0 ||
    values.price === 0 ||
    values.valueEurInput === 0 ||
    values.localValue === 0 ||
    values.totalEur === 0;
  if (hasRightsKeyword && (hasZeroFlow || centerLooksEmpty)) {
    return 'Accion corporativa sin flujo economico (RTS/RIGHT/NON TRADEABLE)';
  }
  if (hasZeroFlow && centerLooksEmpty && /\b(RTS?|RIGHTS?)\b/.test(product)) {
    return 'Accion corporativa sin ejecucion de mercado';
  }
  return null;
}
function normalizeImportRow(ctx, row, mapping = {}, source = 'csv', profile = 'generic', options = {}) {
  const { normalizeSymbol } = ctx;
  const fileSubtype = options.fileSubtype || 'unknown';
  const degiroTransactions = profile === 'degiro' && fileSubtype === 'transactions_export';
  const explicitType = normalizeType(mappedValue(row, mapping, profile, 'type'));
  const mappedSymbolRaw = mappedValue(row, mapping, profile, 'symbol');
  let symbol = normalizeSymbol(mappedSymbolRaw);
  if (profile === 'degiro' && fileSubtype === 'transactions_export' && looksLikeIsin(symbol)) symbol = '';
  const date = defaultDegiroSnapshotDate(
    ctx,
    profile,
    degiroTransactions ? degiroTransactionCell(row, 'date') || mappedValue(row, mapping, profile, 'date') : mappedValue(row, mapping, profile, 'date'),
    row,
    fileSubtype,
  );
  const marketDate = parseDateValue(mappedValue(row, mapping, profile, 'marketDate')) || date;
  const rawShares = parseNumber(degiroTransactions ? degiroTransactionCell(row, 'shares') || mappedValue(row, mapping, profile, 'shares') : mappedValue(row, mapping, profile, 'shares'));
  const rawPrice = parseNumber(degiroTransactions ? degiroTransactionCell(row, 'price') || mappedValue(row, mapping, profile, 'price') : mappedValue(row, mapping, profile, 'price'));
  const rawValueEur = parseNumber(degiroTransactions ? degiroTransactionCell(row, 'valueEur') || mappedValue(row, mapping, profile, 'valueEur') : mappedValue(row, mapping, profile, 'valueEur'));
  const inferredType = inferTypeFromData(explicitType, rawShares, rawValueEur);
  const shares = Number.isFinite(rawShares) ? Math.abs(rawShares) : rawShares;
  const price = Number.isFinite(rawPrice) ? Math.abs(rawPrice) : rawPrice;
  const valueEurInput = Number.isFinite(rawValueEur) ? Math.abs(rawValueEur) : rawValueEur;
  const totalEur = parseNumber(rowValueByHeaders(row, ['Total EUR', 'Total in EUR', 'Total eur']) || (degiroTransactions ? degiroTransactionCell(row, 'totalEur') : ''));
  const mappedCommission = parseNumber(mappedValue(row, mapping, profile, 'commissionEur'));
  const degiroAutoFx =
    profile === 'degiro'
      ? parseNumber(rowValueByHeaders(row, ['Comisión AutoFX', 'Comision AutoFX', 'Comisión AutoFx', 'Comision AutoFx']) || (degiroTransactions ? degiroTransactionCell(row, 'autoFx') : ''))
      : null;
  const degiroCosts =
    profile === 'degiro'
      ? parseNumber(rowValueByHeaders(row, ['Costes de transacción y/o externos EUR', 'Costes de transaccion y/o externos EUR']) || (degiroTransactions ? degiroTransactionCell(row, 'costs') : ''))
      : null;
  const commissionEur = Math.abs(
    profile === 'degiro' && (Number.isFinite(degiroAutoFx) || Number.isFinite(degiroCosts))
      ? Number(degiroAutoFx || 0) + Number(degiroCosts || 0)
      : Number(mappedCommission || 0),
  );
  const detectedCurrency =
    profile === 'degiro' && fileSubtype === 'transactions_export'
      ? String(degiroTransactionCell(row, 'priceCurrency') || degiroTransactionCell(row, 'localCurrency') || degiroCurrencyHint(row)).trim().toUpperCase()
      : String(mappedValue(row, mapping, profile, 'currency') || '').trim().toUpperCase();
  const currency = detectedCurrency || 'EUR';
  const fxInput = parseNumber(degiroTransactions ? degiroTransactionCell(row, 'fx') || mappedValue(row, mapping, profile, 'fxToEur') : mappedValue(row, mapping, profile, 'fxToEur'));
  const explicitLocalValue = parseNumber(rowValueByHeaders(row, ['Valor local', 'Local value', 'valor local']) || (degiroTransactions ? degiroTransactionCell(row, 'localValue') : ''));
  const localValue = Number.isFinite(explicitLocalValue)
    ? Math.abs(explicitLocalValue)
    : Number.isFinite(shares) && Number.isFinite(price)
      ? shares * price
      : null;
  const derivedFxToEur = Number.isFinite(valueEurInput) && Number.isFinite(localValue) && localValue > 0 ? valueEurInput / localValue : null;
  let fxToEur = 1;
  if (currency !== 'EUR') {
    if (Number.isFinite(derivedFxToEur) && derivedFxToEur > 0) fxToEur = derivedFxToEur;
    else if (Number.isFinite(fxInput) && fxInput > 0) fxToEur = profile === 'degiro' ? 1 / fxInput : fxInput;
    else fxToEur = null;
  }
  const externalIdBase =
    profile === 'degiro' && fileSubtype === 'transactions_export'
      ? String(rowValueByHeaders(row, ['ID Orden', 'Id Orden', 'ID orden']) || degiroTransactionCell(row, 'externalId') || '').trim() || ((row.values || []).slice(degiroTransactionColumns.totalEur + 1).find((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '').trim())) || '')
      : String(mappedValue(row, mapping, profile, 'externalId') || '').trim();
  const externalId = externalIdBase ? `${externalIdBase}:${row.rowIndex}` : null;
  const corporateReason =
    profile === 'degiro'
      ? degiroCorporateActionReason(row, fileSubtype, {
          shares,
          price,
          valueEurInput,
          localValue,
          totalEur,
        })
      : null;
  const errors = [];
  const warnings = [];
  if (!corporateReason) {
    if (!inferredType) errors.push('Tipo no reconocido');
    if (!date) errors.push('Fecha invalida');
    if (!Number.isFinite(shares) || shares <= 0) errors.push('Acciones debe ser mayor que 0');
    if (!Number.isFinite(price) || price < 0) errors.push('Precio no puede ser negativo');
    if (price === 0 && inferredType === 'add') warnings.push('Compra a 0€ (split/dividendo) — se importa con precio mínimo');
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('Divisa no soportada');
    if (currency !== 'EUR' && (!Number.isFinite(fxToEur) || fxToEur <= 0)) errors.push('FX a EUR obligatorio');
  }
  const effectivePrice = price === 0 && inferredType === 'add' ? 0.0001 : price;
  const computedValueEur = Number.isFinite(shares) && Number.isFinite(effectivePrice) && (currency === 'EUR' || Number.isFinite(fxToEur))
    ? currency === 'EUR' ? shares * effectivePrice : shares * effectivePrice * fxToEur : null;
  const valueEur = Number.isFinite(valueEurInput) && valueEurInput > 0 ? valueEurInput : computedValueEur;
  if (!corporateReason && (!Number.isFinite(valueEur) || valueEur < 0)) errors.push('Valor EUR no puede ser negativo');
  if (!corporateReason && Number.isFinite(valueEurInput) && Number.isFinite(computedValueEur)) {
    const tolerance = Math.max(0.05, Math.abs(computedValueEur) * 0.02);
    if (Math.abs(valueEurInput - computedValueEur) > tolerance) {
      const isDegiroTransactions = profile === 'degiro' && fileSubtype === 'transactions_export';
      if (!isDegiroTransactions) errors.push('Valor EUR no cuadra con precio, acciones y FX');
    }
  }
  const normalized = {
    type: inferredType || 'add',
    symbol,
    date,
    marketDate,
    shares,
    valueEur,
    price: effectivePrice,
    originalPrice: price,
    currency,
    fxToEur: currency !== 'EUR' && Number.isFinite(fxToEur) ? fxToEur : 1,
    commissionEur,
    cashFlowEur: degiroTransactions && Number.isFinite(totalEur) ? totalEur : ((inferredType || 'add') === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur)),
    externalId,
    source,
    externalIdentifiers: extractExternalIdentifiers(profile, row, symbol, fileSubtype),
    rowKind: corporateReason ? 'corporate_action_ignored' : 'trade',
    ignoreReason: corporateReason || null,
    warnings,
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
      if (row.status === 'blocked') summary.blockedCount += 1;
      if (row.status === 'duplicate') {
        summary.duplicateCount += 1;
        if (row.rowKind === 'duplicate_ledger_match') summary.duplicateLedgerCount += 1;
      }
      if (row.status === 'needs_mapping') summary.needsMappingCount += 1;
      if (row.status === 'ignored') summary.ignoredCount += 1;
      if (row.status === 'skipped') summary.skippedCount += 1;
      if (row.status === 'valid') {
        if (row.normalized.type === 'add') summary.buys += 1;
        if (row.normalized.type === 'remove') summary.sells += 1;
        summary.valueEur += Number(row.normalized.valueEur || 0);
        summary.cashFlowEur += Number(row.normalized.cashFlowEur || 0);
        summary.symbols.add(row.normalized.symbol);
        if (!summary.firstDate || row.normalized.date < summary.firstDate) summary.firstDate = row.normalized.date;
        if (!summary.lastDate || row.normalized.date > summary.lastDate) summary.lastDate = row.normalized.date;
      }
      if (row.rowKind !== 'corporate_action_ignored' && row.normalized) {
        summary.commissionEur += Number(row.normalized.commissionEur || 0);
      }
      return summary;
    },
    {
      rowCount: 0,
      errorCount: 0,
      blockedCount: 0,
      duplicateCount: 0,
      duplicateLedgerCount: 0,
      needsMappingCount: 0,
      ignoredCount: 0,
      skippedCount: 0,
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
    const parsed = parseCsvRows(content);
    return {
      parsed,
      fileHash: sha256(content),
      payloadHash: sha256(`${adapter.profile}:${content}`),
      sheets: [],
      selectedSheet: null,
      fileSubtype: adapter.profile === 'degiro' ? detectDegiroFileSubtype(parsed.headers) : 'unknown',
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
    fileSubtype: adapter.profile === 'degiro' ? detectDegiroFileSubtype(parsed.headers) : 'unknown',
  };
}
module.exports = {
  sha256,
  resolveAdapter,
  detectDegiroFileSubtype,
  parseImportPayload,
  normalizeImportRow,
  summarizeImportRows,
  serializeSummary,
};
