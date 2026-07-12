function saleDeficitMessage(code, available, shares) {
  if (code === 'unknown_sell_only') {
    return 'No existe este instrumento ni hay compras previas en el archivo; se omite para evitar una posición negativa.';
  }
  if (code === 'existing_empty_position') {
    return 'El instrumento existe, pero no hay cantidad registrada suficiente antes de esta venta.';
  }
  if (code === 'existing_insufficient_position') {
    return `Posición insuficiente: disponibles ${Number(available || 0).toFixed(6)} unidades, venta de ${Number(shares || 0).toFixed(6)} unidades.`;
  }
  return 'Venta sin posición suficiente; se omite para evitar una posición negativa.';
}

function markSkippedSaleDeficit(row, code, available = 0) {
  const message = saleDeficitMessage(code, available, row.normalized?.shares);
  return {
    ...row,
    status: 'skipped',
    rowKind: 'skipped',
    errors: [],
    ignoreReason: message,
    blockReasonCode: code,
    blockReasonMessage: message,
    defaultAction: 'skip',
  };
}

module.exports = { saleDeficitMessage, markSkippedSaleDeficit };
