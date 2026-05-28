export const IMPORTED_GROUP_ID = 'importados';
export const IMPORTED_GROUP_NAME = 'Importados';

export const FIELD_LABELS = {
  symbol: 'ticker',
  yahooSymbol: 'ticker Yahoo',
  name: 'nombre',
  type: 'tipo',
  currency: 'divisa',
};

export function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function isXlsxSource(source) {
  return source === 'generic-xlsx';
}

export function suggestSymbol(label = '') {
  const cleaned = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('')
    .toUpperCase();
  return cleaned.slice(0, 10) || 'NEW01';
}

export function parseMapping(rawText = '') {
  const raw = String(rawText || '').trim();
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El mapping debe ser un JSON válido');
  }
  return value;
}

export function rowsForDetected(preview, item) {
  const indexes = new Set(item.rowIndexes || []);
  return (preview.rows || []).filter((row) => indexes.has(row.rowIndex));
}

export function shouldOmitInstrumentByDefault(preview, item) {
  const rows = rowsForDetected(preview, item);
  if (!rows.length) return false;
  const productText = `${item.label || ''} ${item.isin || ''}`.toUpperCase();
  const hasCorporateActionHint = /\b(RTS?|RIGHTS?|NON\s*TRADEABLE)\b/.test(productText);
  const allIgnored = rows.every((row) => row.status === 'ignored' || row.rowKind === 'corporate_action_ignored');
  if (hasCorporateActionHint || allIgnored) return true;
  const unresolvedSellOnly = item.resolutionStatus === 'needs_mapping' && Number(item.sells || 0) > 0 && Number(item.buys || 0) === 0;
  return unresolvedSellOnly;
}

export function inferInstrumentType(item) {
  const label = String(item?.label || '').toUpperCase();
  return /\b(ETF|ETC|ETN|UCITS|FUND|INDEX)\b/.test(label) ? 'etf' : 'stock';
}
