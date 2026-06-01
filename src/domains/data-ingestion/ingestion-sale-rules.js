function saleDeficitMessage(code, available, shares) {
  if (code === 'unknown_sell_only') {
    return 'No existe este instrumento ni hay compras previas en el archivo; se omite para evitar una posicion negativa.';
  }
  if (code === 'existing_empty_position') {
    return 'El instrumento existe, pero no hay acciones registradas suficientes antes de esta venta.';
  }
  if (code === 'existing_insufficient_position') {
    return `Posicion insuficiente: disponibles ${Number(available || 0).toFixed(6)} acciones, venta de ${Number(shares || 0).toFixed(6)} acciones.`;
  }
  return 'Venta sin posicion suficiente; se omite para evitar una posicion negativa.';
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
