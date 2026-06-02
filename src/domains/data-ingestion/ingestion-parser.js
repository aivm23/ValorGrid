const crypto = require('node:crypto');
const XLSX = require('../../../vendor/xlsx.full.min.js');
const { typeAliases, adapterDefinitions, profileOverrides, LEGACY_GENERIC_SOURCES } = require('./ingestion-profiles');

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
    .replace(/[\u20ac$\u00a3%]/g, '')
    .replace(/[\u2212\u2013\u2014]/g, '-');
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

function normalizeType(value) {
  const key = normalizeHeader(value);
  if (typeAliases.add.has(key)) return 'add';
  if (typeAliases.remove.has(key)) return 'remove';
  return null;
}

function resolveAdapter(sourceInput = 'valorgrid-xlsx') {
  const source = String(sourceInput || 'valorgrid-xlsx').trim().toLowerCase();
  if (LEGACY_GENERIC_SOURCES.has(source)) {
    throw new Error('Fuente no soportada: usa la plantilla Excel de ValorGrid (valorgrid-xlsx). Descarga la plantilla en /api/import/template.xlsx');
  }
  const adapter = adapterDefinitions[source];
  if (!adapter) throw new Error(`Origen de importacion no soportado: ${sourceInput}`);
  return { source, ...adapter };
}

function mappedValue(row, mapping, profile, field) {
  const explicit = mapping?.[field];
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    if (typeof explicit === 'number') return row.values[explicit] ?? '';
    if (/^\d+$/.test(String(explicit))) return row.values[Number(explicit)] ?? '';
    return row.data[explicit] ?? '';
  }

  const aliases = profileOverrides[profile]?.fieldAliases?.[field] || [];
  const normalizedEntries = Object.entries(row.data).map(([key, value]) => [normalizeHeader(key), value]);
  for (const alias of aliases) {
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

function normalizeImportRow(ctx, row, mapping = {}, source = 'valorgrid-xlsx', profile = 'valorgrid') {
  const { normalizeSymbol } = ctx;
  const explicitType = normalizeType(mappedValue(row, mapping, profile, 'type'));
  const symbol = normalizeSymbol(mappedValue(row, mapping, profile, 'symbol'));
  const date = parseDateValue(mappedValue(row, mapping, profile, 'date'));
  const marketDate = parseDateValue(mappedValue(row, mapping, profile, 'marketDate')) || date;
  const rawShares = parseNumber(mappedValue(row, mapping, profile, 'shares'));
  const rawPrice = parseNumber(mappedValue(row, mapping, profile, 'price'));
  const rawValueEur = parseNumber(mappedValue(row, mapping, profile, 'valueEur'));
  const inferredType = inferTypeFromData(explicitType, rawShares, rawValueEur);
  const shares = Number.isFinite(rawShares) ? Math.abs(rawShares) : rawShares;
  const price = Number.isFinite(rawPrice) ? Math.abs(rawPrice) : rawPrice;
  const valueEurInput = Number.isFinite(rawValueEur) ? Math.abs(rawValueEur) : rawValueEur;
  const commissionEur = Math.abs(Number(parseNumber(mappedValue(row, mapping, profile, 'commissionEur')) || 0));
  const currency = String(mappedValue(row, mapping, profile, 'currency') || 'EUR').trim().toUpperCase();
  const fxInput = parseNumber(mappedValue(row, mapping, profile, 'fxToEur'));
  const fxToEur = currency === 'EUR' ? 1 : Number.isFinite(fxInput) && fxInput > 0 ? fxInput : null;
  const effectivePrice = price === 0 && inferredType === 'add' ? 0.0001 : price;
  const computedValueEur =
    Number.isFinite(shares) && Number.isFinite(effectivePrice) && (currency === 'EUR' || Number.isFinite(fxToEur))
      ? shares * effectivePrice * (currency === 'EUR' ? 1 : fxToEur)
      : null;
  const valueEur = Number.isFinite(valueEurInput) && valueEurInput > 0 ? valueEurInput : computedValueEur;
  const externalIdBase = String(mappedValue(row, mapping, profile, 'externalId') || '').trim();
  const externalId = externalIdBase ? `${externalIdBase}:${row.rowIndex}` : null;
  const errors = [];
  const warnings = [];

  if (!inferredType) errors.push('Tipo no reconocido');
  if (!date) errors.push('Fecha invalida');
  if (!Number.isFinite(shares) || shares <= 0) errors.push('Acciones debe ser mayor que 0');
  if (!Number.isFinite(price) || price < 0) errors.push('Precio no puede ser negativo');
  if (price === 0 && inferredType === 'add') warnings.push('Compra a 0 EUR (split/dividendo) - se importa con precio minimo');
  if (!/^[A-Z]{3}$/.test(currency)) errors.push('Divisa no soportada');
  if (currency !== 'EUR' && (!Number.isFinite(fxToEur) || fxToEur <= 0)) errors.push('FX a EUR obligatorio');
  if (!Number.isFinite(valueEur) || valueEur < 0) errors.push('Valor EUR no puede ser negativo');
  if (Number.isFinite(valueEurInput) && Number.isFinite(computedValueEur)) {
    const tolerance = Math.max(0.05, Math.abs(computedValueEur) * 0.02);
    if (Math.abs(valueEurInput - computedValueEur) > tolerance) {
      errors.push('Valor EUR no cuadra con precio, acciones y FX');
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
    cashFlowEur: (inferredType || 'add') === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur),
    externalId,
    source,
    externalIdentifiers: symbol
      ? [{ provider: 'manual', identifierType: 'ticker', identifierValue: symbol }]
      : [],
    rowKind: 'trade',
    ignoreReason: null,
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
  if (adapter.parser !== 'xlsx') {
    throw new Error('Fuente no soportada: usa la plantilla Excel de ValorGrid (valorgrid-xlsx).');
  }
  const contentBase64 = String(input.contentBase64 || '').trim();
  if (!contentBase64) throw new Error('Contenido XLSX obligatorio');
  const parsed = parseXlsxRows(contentBase64, input.sheetName || adapter.defaultSheet || null);
  return {
    parsed: { headers: parsed.headers, rows: parsed.rows },
    fileHash: sha256(contentBase64),
    payloadHash: sha256(`${adapter.profile}:${parsed.selectedSheet}:${contentBase64}`),
    sheets: parsed.sheets,
    selectedSheet: parsed.selectedSheet,
    fileSubtype: 'valorgrid_template',
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
