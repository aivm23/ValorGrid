function normalizeTransactionNote(value) {
  if (value === undefined || value === null) return null;
  const note = String(value).trim();
  if (!note) return null;
  if (note.length > 1000) throw new Error('La nota no puede superar los 1000 caracteres');
  return note;
}

function createTransactionEditor({
  getTransactions,
  getInstrument,
  transactionSign,
  listSplitsForSymbolUntil,
  updateTransactionEconomics,
  invalidateLedger,
}) {
  function validateCandidateHistory(transaction, candidate) {
    const instrument = getInstrument(transaction.symbol);
    if (!instrument) throw new Error('Instrument not found');

    const transactions = getTransactions()
      .filter((item) => item.symbol === transaction.symbol && item.type !== 'dividend')
      .map((item) => (item.id === transaction.id ? { ...item, ...candidate } : item))
      .sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) ||
          String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
      );
    const splits = listSplitsForSymbolUntil(instrument.symbol, null)
      .slice()
      .sort((a, b) =>
        String(a.effectiveDate || a.effective_date).localeCompare(String(b.effectiveDate || b.effective_date)),
      );

    let shares = Number(instrument.base_shares || 0);
    let splitIndex = 0;
    for (const item of transactions) {
      while (splitIndex < splits.length) {
        const split = splits[splitIndex];
        const effectiveDate = String(split.effectiveDate || split.effective_date || '');
        if (effectiveDate > item.date) break;
        shares *= Number(split.ratio || 1);
        splitIndex += 1;
      }
      shares += transactionSign(item.type) * Number(item.shares || 0);
      if (shares < -0.0000001) {
        throw new Error(
          `Not enough shares. Available before ${item.date}: ${(shares + Number(item.shares || 0)).toFixed(6)}`,
        );
      }
    }
  }

  function previewTransactionEdit(id, input) {
    const transaction = getTransactions().find((item) => item.id === id);
    if (!transaction) {
      const error = new Error('Transaction not found');
      error.statusCode = 404;
      throw error;
    }
    if (transaction.type === 'dividend') throw new Error('Los dividendos se gestionan desde su flujo propio');
    for (const forbidden of [
      'symbol',
      'ticker',
      'type',
      'origin',
      'marketDate',
      'autoKey',
      'importBatchId',
      'externalId',
      'rawHash',
      'createdAt',
    ]) {
      if (input[forbidden] !== undefined) throw new Error(`${forbidden} no se puede modificar`);
    }

    const date = String(input.date || '').trim();
    const shares = Number(input.shares);
    const price = Number(input.price);
    const currency = String(input.currency || '')
      .trim()
      .toUpperCase();
    const fxToEur = Number(input.fxToEur);
    const commissionEur = Number(input.commissionEur ?? 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('La fecha debe usar YYYY-MM-DD');
    if (!Number.isFinite(shares) || shares <= 0) throw new Error('La cantidad debe ser mayor que cero');
    if (!Number.isFinite(price) || price <= 0) throw new Error('El precio debe ser mayor que cero');
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('La divisa debe tener tres letras');
    if (!Number.isFinite(fxToEur) || fxToEur <= 0 || (currency === 'EUR' && fxToEur !== 1)) {
      throw new Error('El FX a EUR no es válido');
    }
    if (!Number.isFinite(commissionEur) || commissionEur < 0) throw new Error('La comisión no es válida');

    const valueEur = shares * price * fxToEur;
    const cashFlowEur = transaction.type === 'remove' ? valueEur - commissionEur : -(valueEur + commissionEur);
    const candidate = {
      date,
      shares,
      price,
      currency,
      fxToEur,
      commissionEur,
      valueEur,
      cashFlowEur,
      note: normalizeTransactionNote(input.note),
    };
    validateCandidateHistory(transaction, candidate);
    return { ...transaction, ...candidate, affectedFrom: [transaction.date, date].sort()[0] };
  }

  function updateTransaction(id, input) {
    const preview = previewTransactionEdit(id, input);
    const result = updateTransactionEconomics(id, preview);
    if (!result.changes) {
      const error = new Error('Transaction not found');
      error.statusCode = 404;
      throw error;
    }
    invalidateLedger(preview.affectedFrom, 'transaction-update');
    return getTransactions().find((item) => item.id === id);
  }

  return { previewTransactionEdit, updateTransaction };
}

module.exports = { createTransactionEditor, normalizeTransactionNote };
