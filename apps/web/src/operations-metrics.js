/**
 * Catálogo de métricas de Operativa.
 * Registry público de métricas renderizables para las tarjetas de performance.
 * Las 6 métricas por defecto son fijas en Community; PRO puede reordenarlas.
 */

export const DEFAULT_OPERATION_METRIC_IDS = [
  'marketValue',
  'netContributed',
  'totalGain',
  'unrealizedGain',
  'realizedGain',
  'commissions',
];

export const OPERATION_METRIC_IDS = new Set([
  ...DEFAULT_OPERATION_METRIC_IDS,
  'simpleReturnPct',
  'transactionCount',
  'averageCommission',
  'openInvestment',
  'netCashFlow',
  'grossBought',
  'grossSold',
  'dividendIncome',
]);

/** @type {Record<string, OperationMetricDefinition>} */
export const OPERATION_METRICS = {
  marketValue: {
    id: 'marketValue',
    label: 'Valor mercado',
    tooltip: 'Valor actual de la cartera a precios de mercado.',
    borderClass() {
      return 'has-border-accent';
    },
    valueClass() {
      return '';
    },
    value(data) {
      return data.currentValue != null ? data.currentValue : 0;
    },
    microcopy() {
      return 'a precios actuales';
    },
  },
  netContributed: {
    id: 'netContributed',
    label: 'Aportado neto',
    tooltip:
      'Aportado neto total desde el primer movimiento: compras y comisiones menos ventas netas. Si es negativo, ya has retirado más caja de la aportada.',
    borderClass() {
      return 'has-border-accent';
    },
    valueClass(data) {
      if (data._ctx && typeof data._ctx.moneyClass === 'function') {
        return data._ctx.moneyClass(data.netContributed);
      }
      return '';
    },
    value(data) {
      return data.netContributed != null ? data.netContributed : 0;
    },
    microcopy(data) {
      const netContributed = data.netContributed;
      if (netContributed >= 0) {
        return 'desde primer movimiento';
      }
      return 'retirada neta total';
    },
  },
  totalGain: {
    id: 'totalGain',
    label: 'Resultado total',
    tooltip:
      'Resultado total = valor mercado - aportado neto. Cuando el aportado neto es negativo, se lee como valor mercado + retirada neta.',
    borderClass(data) {
      const totalGain = data.totalGain;
      if (totalGain >= 0) return 'has-border-positive';
      return 'has-border-negative';
    },
    valueClass(data) {
      if (data._ctx && typeof data._ctx.moneyClass === 'function') {
        return data._ctx.moneyClass(data.totalGain);
      }
      return '';
    },
    value(data) {
      return data.totalGain != null ? data.totalGain : 0;
    },
    microcopy(data) {
      const netContributed = data.netContributed;
      const performance = data.performance;
      if (netContributed < 0) {
        return 'valor + retirado neto';
      }
      if (netContributed === 0) {
        return 'sin aportación neta';
      }
      const ctx = data._ctx;
      const simpleReturnPct = performance?.simpleReturnPct;
      if (ctx && typeof ctx.formatPercent === 'function') {
        return `${ctx.formatPercent(simpleReturnPct)} sobre aportado`;
      }
      return `${(simpleReturnPct ?? 0).toFixed(1)}% sobre aportado`;
    },
  },
  unrealizedGain: {
    id: 'unrealizedGain',
    label: 'Plusvalía latente',
    tooltip:
      'Plusvalía no realizada de posiciones abiertas. El porcentaje compara la plusvalía latente con la inversión que sigue abierta tras ventas FIFO, no con todas las compras históricas.',
    borderClass(data) {
      const unrealizedGain = data.unrealizedGain;
      if (unrealizedGain >= 0) return 'has-border-positive';
      return 'has-border-negative';
    },
    valueClass(data) {
      if (data._ctx && typeof data._ctx.moneyClass === 'function') {
        return data._ctx.moneyClass(data.unrealizedGain);
      }
      return '';
    },
    value(data) {
      return data.unrealizedGain != null ? data.unrealizedGain : 0;
    },
    microcopy(data) {
      const currentValue = data.currentValue;
      const unrealizedGain = data.unrealizedGain;
      const openInvestment = currentValue - unrealizedGain;
      if (openInvestment > 0 && typeof unrealizedGain === 'number') {
        const latentPct = (unrealizedGain / openInvestment) * 100;
        return `${latentPct.toFixed(1)}% sobre inversión abierta`;
      }
      return 'sin inversión abierta';
    },
  },
  realizedGain: {
    id: 'realizedGain',
    label: 'Plusvalía realizada',
    tooltip: 'Resultado de ventas FIFO: diferencia entre precio de venta y precio de compra de las unidades vendidas.',
    borderClass(data) {
      const realizedGain = data.realizedGain;
      if (realizedGain >= 0) return 'has-border-positive';
      return 'has-border-negative';
    },
    valueClass(data) {
      if (data._ctx && typeof data._ctx.moneyClass === 'function') {
        return data._ctx.moneyClass(data.realizedGain);
      }
      return '';
    },
    value(data) {
      return data.realizedGain != null ? data.realizedGain : 0;
    },
    microcopy() {
      return 'resultado ventas FIFO';
    },
  },
  commissions: {
    id: 'commissions',
    label: 'Comisiones',
    tooltip: 'Total de comisiones pagadas en todas las operaciones.',
    borderClass() {
      return 'has-border-amber';
    },
    valueClass() {
      return '';
    },
    value(data) {
      return data.commissions != null ? data.commissions : 0;
    },
    microcopy(data) {
      const performance = data.performance;
      if (performance && performance.commissions > 0 && performance.transactionCount > 0) {
        const avg = performance.commissions / performance.transactionCount;
        return `${avg.toFixed(2)} €/movimiento`;
      }
      return 'sin comisiones';
    },
  },
  simpleReturnPct: {
    id: 'simpleReturnPct',
    label: 'Rentabilidad simple',
    tooltip: 'Rentabilidad simple expresada en porcentaje sobre el aportado neto.',
    borderClass() {
      return '';
    },
    valueClass(data) {
      if (data._ctx && typeof data._ctx.moneyClass === 'function') {
        return data._ctx.moneyClass(data.performance?.simpleReturnPct);
      }
      return '';
    },
    value(data) {
      return data.performance?.simpleReturnPct ?? 0;
    },
    microcopy() {
      return '% rentabilidad simple';
    },
  },
  transactionCount: {
    id: 'transactionCount',
    label: 'Nº movimientos',
    tooltip: 'Número total de movimientos en el libro.',
    borderClass() {
      return '';
    },
    valueClass() {
      return '';
    },
    value(data) {
      return data.performance?.transactionCount ?? 0;
    },
    microcopy() {
      return 'operaciones totales';
    },
  },
  averageCommission: {
    id: 'averageCommission',
    label: 'Comisión media',
    tooltip: 'Comisión media por movimiento.',
    borderClass() {
      return '';
    },
    valueClass() {
      return '';
    },
    value(data) {
      const perf = data.performance;
      if (perf && perf.transactionCount > 0 && perf.commissions > 0) {
        return perf.commissions / perf.transactionCount;
      }
      return 0;
    },
    microcopy() {
      return '€/movimiento';
    },
  },
  openInvestment: {
    id: 'openInvestment',
    label: 'Inversión abierta',
    tooltip: 'Inversión que sigue abierta tras ventas FIFO.',
    borderClass() {
      return '';
    },
    valueClass() {
      return '';
    },
    value(data) {
      return (data.currentValue ?? 0) - (data.unrealizedGain ?? 0);
    },
    microcopy() {
      return 'inversión abierta';
    },
  },
  netCashFlow: {
    id: 'netCashFlow',
    label: 'Cash-flow neto',
    tooltip: 'Flujo de caja neto: entradas menos salidas.',
    borderClass() {
      return '';
    },
    valueClass() {
      return '';
    },
    value(_data) {
      return 0;
    },
    microcopy() {
      return 'cash-flow neto';
    },
  },
  grossBought: {
    id: 'grossBought',
    label: 'Compras brutas',
    tooltip: 'Total bruto gastado en compras.',
    borderClass() {
      return '';
    },
    valueClass() {
      return '';
    },
    value() {
      return 0;
    },
    microcopy() {
      return 'compras brutas';
    },
  },
  grossSold: {
    id: 'grossSold',
    label: 'Ventas brutas',
    tooltip: 'Total bruto recibido en ventas.',
    borderClass() {
      return '';
    },
    valueClass() {
      return '';
    },
    value() {
      return 0;
    },
    microcopy() {
      return 'ventas brutas';
    },
  },
  dividendIncome: {
    id: 'dividendIncome',
    label: 'Dividendos',
    tooltip: 'Total cobrado por dividendos confirmados desde eventos de Yahoo Finance.',
    borderClass() {
      return 'has-border-accent';
    },
    valueClass() {
      return '';
    },
    value(data) {
      return data.performance?.dividendIncomeEur ?? 0;
    },
    microcopy(data) {
      const count = data.performance?.dividendCount ?? 0;
      return `${count} dividendo${count === 1 ? '' : 's'}`;
    },
  },
};
