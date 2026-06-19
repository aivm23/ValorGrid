export const IMPORTED_GROUP_ID = 'importados';
export const IMPORTED_GROUP_NAME = 'Importados';

export const FIELD_LABELS = {
  symbol: 'ticker',
  yahooSymbol: 'ref. proveedor',
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
  return source === 'valorgrid-xlsx' || source === 'clicktrade-xlsx';
}

export function canDownloadTemplate(source) {
  return source === 'valorgrid-xlsx';
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

export function getImportSourceDisplayName(source) {
  if (source.key === 'degiro-csv') return 'DEGIRO';
  if (source.key === 'ibkr-csv') return 'Interactive Brokers';
  if (source.key === 'clicktrade-xlsx') return 'ClickTrade';
  return source.label;
}

export function getImportSourceOptionLabel(source) {
  const name = getImportSourceDisplayName(source);
  if (source.comingSoon) return name + ' - Pr\u00f3ximamente - Professional Edition';
  if (source.edition === 'professional') return name + ' - Professional Edition';
  return name;
}

function getImportSourceTooltip(source) {
  if (source.key === 'valorgrid-xlsx') return 'Importar Excel con la plantilla oficial de ValorGrid (hoja Movimientos)';
  if (source.key === 'degiro-csv') return 'Importar CSV exportado desde DEGIRO';
  if (source.key === 'ibkr-csv') return 'Importar CSV exportado desde Interactive Brokers (IBKR)';
  if (source.key === 'clicktrade-xlsx') return 'Importar XLSX exportado desde ClickTrade';
  return source.label || '';
}

export function renderImportSourceOptions(sources, edition, escapeHtml) {
  return sources
    .filter((source) => source.edition === 'community' || edition === 'professional' || !source.available)
    .sort((left, right) => {
      if (left.edition === right.edition) return 0;
      return left.edition === 'community' ? -1 : 1;
    })
    .map((source) => {
      const label = getImportSourceOptionLabel(source);
      const disabled = !source.available || source.comingSoon;
      const disabledAttr = disabled ? ' disabled' : '';
      const title = escapeHtml(getImportSourceTooltip(source));
      return `<option value="${escapeHtml(source.key)}"${disabledAttr} title="${title}">${escapeHtml(label)}</option>`;
    })
    .join('');
}

export function renderImportProBanners(sources, edition, escapeHtml) {
  const allPro = sources.filter((source) => source.edition === 'professional');
  if (edition !== 'community' || !allPro.length) return '';

  const proImplemented = allPro.filter((source) => !source.comingSoon);
  const proComingSoon = allPro.filter((source) => source.comingSoon);
  let html = '';

  if (proImplemented.length) {
    const names = proImplemented.map((source) => getImportSourceDisplayName(source)).join(', ');
      html +=
        '<div class="import-pro-banner import-pro-banner-brokers">' +
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;vertical-align:middle"><rect x="3" y="7" width="10" height="7" rx="2" stroke="#06b6d4" stroke-width="1.5"/><path d="M4.5 7V4.5a3.5 3.5 0 0 1 7 0V7" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round"/></svg> ' +
        '<span class="import-pro-banner-title">' +
        escapeHtml(names) +
        '</span> ' +
        '<span class="pro-edition-label">Professional Edition</span></div>';
  }

  if (proComingSoon.length) {
    const soonNames = proComingSoon.map((source) => getImportSourceDisplayName(source)).join(', ');
      html +=
        '<div class="import-pro-banner import-pro-banner-clicktrade">' +
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;vertical-align:middle"><rect x="3" y="7" width="10" height="7" rx="2" stroke="#06b6d4" stroke-width="1.5"/><path d="M4.5 7V4.5a3.5 3.5 0 0 1 7 0V7" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round"/></svg> ' +
        '<span class="import-pro-banner-title">' +
        escapeHtml(soonNames) +
        '</span> - ' +
        '<span class="import-soon-label">Próximamente</span> ' +
        '<span class="pro-edition-label">Professional Edition</span></div>';
  }

  return html;
}
