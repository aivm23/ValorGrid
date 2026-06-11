/**
 * Catálogo compartido de métricas de Operativa (backend + frontend).
 * Las 6 métricas por defecto son fijas en Community; PRO puede reordenarlas.
 */

const DEFAULT_OPERATION_METRIC_IDS = [
  'marketValue',
  'netContributed',
  'totalGain',
  'unrealizedGain',
  'realizedGain',
  'commissions',
];

const ALL_OPERATION_METRIC_IDS = [
  ...DEFAULT_OPERATION_METRIC_IDS,
  'simpleReturnPct',
  'transactionCount',
  'averageCommission',
  'openInvestment',
  'netCashFlow',
  'grossBought',
  'grossSold',
];

const OPERATION_METRIC_IDS = new Set(ALL_OPERATION_METRIC_IDS);

module.exports = {
  DEFAULT_OPERATION_METRIC_IDS,
  OPERATION_METRIC_IDS,
};
