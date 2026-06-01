const DEGIRO_SUBTYPE_LABELS = {
  transactions_export: 'DEGIRO Transacciones CSV',
  portfolio_snapshot: 'DEGIRO Snapshot de cartera',
  unknown: 'DEGIRO CSV',
};

function fileSubtypeWarnings(fileSubtype) {
  if (fileSubtype === 'transactions_export') return ['Formato recomendado: export de Transacciones de DEGIRO.'];
  if (fileSubtype === 'portfolio_snapshot') {
    return [
      'Este CSV parece un snapshot de cartera (Portfolio), no un historico de transacciones.',
      'Se usara para conciliacion de posiciones, no para reconstruir historico completo.',
    ];
  }
  return [];
}

module.exports = { DEGIRO_SUBTYPE_LABELS, fileSubtypeWarnings };
