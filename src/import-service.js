const crypto = require('node:crypto');
module.exports = function attach(ctx) {
  with (ctx) {
const typeAliases = {
  add: new Set(['add', 'buy', 'compra', 'comprar', 'c']),
  remove: new Set(['remove', 'sell', 'venta', 'vender', 'v']),
};

const fieldAliases = {
  type: ['type', 'tipo', 'operacion', 'operación', 'side', 'action'],
  symbol: ['symbol', 'ticker', 'simbolo', 'símbolo', 'instrumento'],
  date: ['date', 'fecha', 'fecha operacion', 'fecha operación'],
  marketDate: ['marketdate', 'market_date', 'fecha mercado'],
  shares: ['shares', 'acciones', 'titulos', 'títulos', 'cantidad'],
  price: ['price', 'precio', 'precio unitario'],
  valueEur: ['valueeur', 'value_eur', 'valor eur', 'valor €', 'importe eur', 'importe €', 'gross eur'],
  commissionEur: ['commissioneur', 'commission_eur', 'comision', 'comision eur', 'comisión', 'comisión eur', 'gastos', 'comisiones'],
  currency: ['currency', 'divisa', 'moneda'],
  usdToEur: ['usdtoeur', 'usd_to_eur', 'tipo de cambio', 'fx', 'cambio'],
  externalId: ['externalid', 'external_id', 'id externo', 'referencia'],
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

function parseCsv(content) {
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
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
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
      data: Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
    })),
  };
}

function chooseDelimiter(text) {
  const firstLine = String(text || '').split(/\r?\n/).find((line) => line.trim()) || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function mappedValue(row, mapping, field) {
  const explicit = mapping?.[field];
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    if (typeof explicit === 'number') return row.values[explicit] ?? '';
    if (/^\d+$/.test(String(explicit))) return row.values[Number(explicit)] ?? '';
    return row.data[explicit] ?? '';
  }

  const normalizedEntries = Object.entries(row.data).map(([key, value]) => [normalizeHeader(key), value]);
  for (const alias of fieldAliases[field] || []) {
    const target = normalizeHeader(alias);
    const found = normalizedEntries.find(([key]) => key === target);
    if (found) return found[1];
  }
  return '';
}

function parseNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const cleaned = text.replace(/[€$%\s]/g, '');
  const decimalComma = /,\d{1,8}$/.test(cleaned);
  const normalized = decimalComma
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDateValue(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
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

function normalizeImportRow(row, mapping = {}, source = 'csv') {
  const type = normalizeType(mappedValue(row, mapping, 'type'));
  const symbol = normalizeSymbol(mappedValue(row, mapping, 'symbol'));
  const date = parseDateValue(mappedValue(row, mapping, 'date'));
  const marketDate = parseDateValue(mappedValue(row, mapping, 'marketDate')) || date;
  const shares = parseNumber(mappedValue(row, mapping, 'shares'));
  const price = parseNumber(mappedValue(row, mapping, 'price'));
  const valueEurInput = parseNumber(mappedValue(row, mapping, 'valueEur'));
  const commissionEur = Math.abs(parseNumber(mappedValue(row, mapping, 'commissionEur')) || 0);
  const currency = String(mappedValue(row, mapping, 'currency') || 'EUR').trim().toUpperCase();
  const usdToEur = currency === 'USD' ? parseNumber(mappedValue(row, mapping, 'usdToEur')) : 1;
  const externalId = String(mappedValue(row, mapping, 'externalId') || '').trim() || null;
  const errors = [];

  if (!type) errors.push('Tipo no reconocido');
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
    type,
    symbol,
    date,
    marketDate,
    shares,
    valueEur,
    price,
    currency,
    usdToEur: usdToEur || 1,
    commissionEur,
    cashFlowEur: type === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur),
    externalId,
    source,
  };
  normalized.rowHash = sha256(JSON.stringify(normalized));
  normalized.transactionId = `import:${source}:${normalized.rowHash.slice(0, 24)}`;
  return { normalized, errors };
}

function positionWithPendingRows(symbol, date, pendingRows) {
  let shares = getPositionShares(symbol, date);
  for (const row of pendingRows) {
    if (row.symbol === symbol && row.date <= date) shares += transactionSign(row.type) * row.shares;
  }
  return shares;
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
  return {
    ...summary,
    symbols: Array.from(summary.symbols || []),
  };
}

function previewImport(input = {}) {
  const source = String(input.source || 'csv').trim().toLowerCase() || 'csv';
  if (source !== 'csv') throw new Error('Solo CSV genérico está soportado en esta versión');
  const content = String(input.content || input.csv || '');
  if (!content.trim()) throw new Error('Contenido CSV obligatorio');
  const mapping = input.mapping || {};
  const parsed = parseCsv(content);
  const accepted = [];
  const seenHashes = new Set();
  let rows = parsed.rows.map((row) => {
    const { normalized, errors } = normalizeImportRow(row, mapping, source);
    const instrument = normalized.symbol ? getInstrument(normalized.symbol) : null;
    if (normalized.symbol && !instrument) errors.push(`Instrumento no existe: ${normalized.symbol}`);
    if (instrument?.type === 'fx') errors.push('No se importan movimientos sobre instrumentos FX');
    if (normalized.type === 'remove' && normalized.symbol && normalized.date && Number.isFinite(normalized.shares)) {
      const available = positionWithPendingRows(normalized.symbol, normalized.date, accepted);
      if (available + 0.0000001 < normalized.shares) errors.push('Venta superior a la posición disponible');
    }
    const duplicate = db.prepare('SELECT id FROM transactions WHERE raw_hash = ? AND origin = ?').get(normalized.rowHash, 'import');
    const repeatedInFile = seenHashes.has(normalized.rowHash);
    const status = errors.length ? 'error' : duplicate || repeatedInFile ? 'duplicate' : 'valid';
    if (!errors.length) seenHashes.add(normalized.rowHash);
    if (status === 'valid') accepted.push(normalized);
    return {
      rowIndex: row.rowIndex,
      raw: row.data,
      normalized,
      status,
      errors,
      duplicateTransactionId: duplicate?.id || null,
    };
  });
  rows = applyTimelineValidation(rows);
  const summary = serializeSummary(summarizeImportRows(rows));
  return {
    source,
    filename: input.filename || null,
    fileHash: sha256(content),
    headers: parsed.headers,
    rows,
    summary,
    canCommit: summary.errorCount === 0,
  };
}

function applyTimelineValidation(rows) {
  const validRows = rows.filter((row) => row.status === 'valid').map((row) => row.normalized);
  if (!validRows.length) return rows;
  const errors = validateFuturePositions(validRows);
  if (!errors.length) return rows;
  return rows.map((row) => {
    const match = errors.find((error) => error.symbol === row.normalized.symbol && error.date >= row.normalized.date);
    if (!match || row.status !== 'valid') return row;
    return {
      ...row,
      status: 'error',
      errors: [...row.errors, `La importación dejaría posición negativa en ${match.symbol} el ${match.date}`],
    };
  });
}

function validateFuturePositions(pendingRows) {
  const bySymbol = new Map();
  for (const row of pendingRows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }
  const errors = [];
  for (const [symbol, rows] of bySymbol) {
    const firstDate = rows.map((row) => row.date).sort()[0];
    let shares = getPositionShares(symbol, addDays(firstDate, -1));
    const events = db
      .prepare('SELECT date, type, shares FROM transactions WHERE symbol = ? AND date >= ? ORDER BY date ASC, created_at ASC')
      .all(symbol, firstDate)
      .map((row) => ({ date: row.date, type: row.type, shares: Number(row.shares || 0), source: 'ledger' }));
    events.push(...rows.map((row) => ({ date: row.date, type: row.type, shares: row.shares, source: 'import' })));
    events.sort((a, b) => a.date.localeCompare(b.date));
    const grouped = new Map();
    for (const event of events) {
      const current = grouped.get(event.date) || 0;
      grouped.set(event.date, current + transactionSign(event.type) * event.shares);
    }
    for (const [date, delta] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      shares += delta;
      if (shares < -0.0000001) {
        errors.push({ symbol, date });
        break;
      }
    }
  }
  return errors;
}

function insertImportBatch(preview) {
  const batchId = `import-batch:${preview.source}:${preview.fileHash.slice(0, 24)}`;
  const existing = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId);
  if (existing?.status === 'committed') return { batchId, existing };
  db.prepare(
    `INSERT INTO import_batches
      (id, source, filename, file_hash, status, mapping_json, summary_json, row_count,
       error_count, first_date, last_date)
     VALUES (?, ?, ?, ?, 'committed', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = 'committed',
       summary_json = excluded.summary_json,
       row_count = excluded.row_count,
       error_count = excluded.error_count,
       first_date = excluded.first_date,
       last_date = excluded.last_date,
       committed_at = CURRENT_TIMESTAMP`,
  ).run(
    batchId,
    preview.source,
    preview.filename,
    preview.fileHash,
    JSON.stringify({}),
    JSON.stringify(preview.summary),
    preview.summary.rowCount,
    preview.summary.errorCount,
    preview.summary.firstDate,
    preview.summary.lastDate,
  );
  return { batchId, existing: null };
}

function commitImport(input = {}) {
  const preview = previewImport(input);
  if (preview.summary.errorCount > 0) throw new Error('La importación contiene errores y no se puede guardar');
  const duplicateOnly = preview.rows.every((row) => row.status === 'duplicate');

  db.exec('BEGIN');
  try {
    const { batchId, existing } = insertImportBatch(preview);
    if (existing) {
      db.exec('COMMIT');
      return { batch: getImportBatch(batchId), rows: getImportRows(batchId), summary: JSON.parse(existing.summary_json || '{}') };
    }
    const rowInsert = db.prepare(
      `INSERT OR REPLACE INTO import_rows
        (id, batch_id, row_index, raw_json, normalized_json, status, error, row_hash, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const transactionInsert = db.prepare(
      `INSERT INTO transactions
        (id, type, symbol, name, date, market_date, shares, value_eur, price, currency,
         usd_to_eur, commission_eur, cash_flow_eur, color, origin, auto_key,
         import_batch_id, external_id, raw_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', NULL, ?, ?, ?)`,
    );

    for (const row of preview.rows) {
      const rowId = `${batchId}:row:${row.rowIndex}`;
      if (row.status === 'duplicate') {
        rowInsert.run(rowId, batchId, row.rowIndex, JSON.stringify(row.raw), JSON.stringify(row.normalized), 'duplicate', null, row.normalized.rowHash, row.duplicateTransactionId);
        continue;
      }
      const instrument = getInstrument(row.normalized.symbol);
      transactionInsert.run(
        row.normalized.transactionId,
        row.normalized.type,
        instrument.symbol,
        instrument.name,
        row.normalized.date,
        row.normalized.marketDate,
        row.normalized.shares,
        row.normalized.valueEur,
        row.normalized.price,
        row.normalized.currency,
        row.normalized.usdToEur,
        row.normalized.commissionEur,
        row.normalized.cashFlowEur,
        instrument.color,
        batchId,
        row.normalized.externalId,
        row.normalized.rowHash,
      );
      rowInsert.run(rowId, batchId, row.rowIndex, JSON.stringify(row.raw), JSON.stringify(row.normalized), 'committed', null, row.normalized.rowHash, row.normalized.transactionId);
    }
    db.prepare('UPDATE import_batches SET committed_at = CURRENT_TIMESTAMP WHERE id = ?').run(batchId);
    db.exec('COMMIT');
    if (!duplicateOnly) invalidateLedger(preview.summary.firstDate || getToday(), 'import-commit');
    return { batch: getImportBatch(batchId), rows: getImportRows(batchId), summary: preview.summary };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  }
}

function getImportBatch(id) {
  const batch = db
    .prepare(
      `SELECT id, source, filename, file_hash AS fileHash, status, summary_json AS summaryJson,
              row_count AS rowCount, error_count AS errorCount, first_date AS firstDate,
              last_date AS lastDate, created_at AS createdAt, committed_at AS committedAt,
              rolled_back_at AS rolledBackAt
       FROM import_batches
       WHERE id = ?`,
    )
    .get(id);
  return batch ? { ...batch, summary: JSON.parse(batch.summaryJson || '{}'), summaryJson: undefined } : null;
}

function getImportRows(batchId) {
  return db
    .prepare(
      `SELECT id, batch_id AS batchId, row_index AS rowIndex, raw_json AS rawJson,
              normalized_json AS normalizedJson, status, error, row_hash AS rowHash,
              transaction_id AS transactionId, created_at AS createdAt
       FROM import_rows
       WHERE batch_id = ?
       ORDER BY row_index ASC`,
    )
    .all(batchId)
    .map((row) => ({
      ...row,
      raw: JSON.parse(row.rawJson || '{}'),
      normalized: row.normalizedJson ? JSON.parse(row.normalizedJson) : null,
      rawJson: undefined,
      normalizedJson: undefined,
    }));
}

function listImportBatches() {
  return db
    .prepare(
      `SELECT id FROM import_batches
       ORDER BY COALESCE(committed_at, created_at) DESC`,
    )
    .all()
    .map((row) => getImportBatch(row.id));
}

function rollbackImportBatch(id) {
  const batch = getImportBatch(id);
  if (!batch) return false;
  if (batch.status === 'rolled_back') return true;
  const firstDate = batch.firstDate || getToday();
  db.exec('BEGIN');
  try {
    db.prepare("DELETE FROM transactions WHERE import_batch_id = ? AND origin = 'import'").run(id);
    db.prepare("UPDATE import_rows SET status = 'rolled_back' WHERE batch_id = ? AND status = 'committed'").run(id);
    db.prepare("UPDATE import_batches SET status = 'rolled_back', rolled_back_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    db.exec('COMMIT');
    invalidateLedger(firstDate, 'import-rollback');
    return true;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  }
}

    Object.assign(ctx, { previewImport, commitImport, listImportBatches, getImportBatch, getImportRows, rollbackImportBatch });
  }
};
