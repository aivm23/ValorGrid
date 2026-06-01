/**
 * Tipos de dominio para ValorGrid --- fase 12 incremental.
 * Definiciones puras sin impacto en runtime.
 */

/** Instrumento financiero almacenado en el ledger. */
export interface Instrument {
  symbol: string;
  yahoo_symbol: string;
  name: string;
  type: 'stock' | 'etf' | 'fx' | string;
  currency: string;
  color: string;
  base_shares: number;
  fallback_price: number;
  active: number;
  group_id: string | null;
  display_order: number;
  show_in_distribution: boolean | number;
  show_in_monthly: boolean | number;
}

/** Grupo de instrumentos. */
export interface InstrumentGroup {
  id: string;
  name: string;
  color: string;
  display_order: number;
  show_in_distribution: boolean | number;
  show_in_monthly: boolean | number;
  is_expandable: boolean | number;
  active: number;
}

/** Identificador externo (ISIN, ticker, etc.) asociado a un instrumento. */
export interface InstrumentIdentifier {
  id: string;
  instrument_symbol: string;
  provider: string;
  identifier_type: string;
  identifier_value: string;
  display_name: string | null;
  currency: string | null;
  exchange: string | null;
  metadata: Record<string, unknown> | null;
}

/** Transacción del ledger (fila plana devuelta por la DB). */
export interface Transaction {
  id: string;
  type: 'add' | 'remove';
  symbol: string;
  name: string;
  date: string;
  marketDate: string | null;
  shares: number;
  valueEur: number;
  price: number;
  currency: string;
  fxToEur: number;
  commissionEur: number;
  cashFlowEur: number;
  color: string;
  origin: string;
  autoKey: string | null;
  importBatchId: string | null;
  externalId: string | null;
  rawHash: string | null;
  createdAt: string;
}

/** Plan automático de aportación periódica. */
export interface AutoPlan {
  symbol: string;
  amountEur: number;
  day: number;
  enabled: boolean;
  startDate: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | string;
  weekday: number | null;
}

/** Resumen de cartera devuelto por buildSummary. */
export interface PortfolioSummary {
  updatedAt: string;
  total: number;
  portfolio: PortfolioItem[];
  groups: InstrumentGroup[];
  groupedPositions: Record<string, PortfolioItem[]>;
  stockPositions: PortfolioItem[];
  autoPlans: AutoPlan[];
  performance: LedgerAnalytics;
  onboarding: OnboardingStatus;
}

/** Elemento individual dentro del portfolio. */
export interface PortfolioItem {
  symbol: string;
  groupId: string | null;
  name: string;
  type: string;
  color: string;
  isExpandable?: boolean;
  shares: number | null;
  priceEur: number | null;
  value: number;
  pct?: number;
  price?: number;
  currency?: string;
  marketDate?: string | null;
  showInDistribution?: boolean;
}

/** Métricas del ledger calculadas por buildLedgerAnalytics. */
export interface LedgerAnalytics {
  grossInvested: number;
  grossWithdrawn: number;
  commissions: number;
  netCashFlow: number;
  netContributed: number;
  realizedGain: number;
  unrealizedGain: number;
  totalGain: number;
  simpleReturnPct: number | null;
  transactionCount: number;
}

/** Estado de onboarding. */
export interface OnboardingStatus {
  setupComplete: boolean;
  instruments: number;
  transactions: number;
  groups: number;
}

/** Resultado de preview de importación. */
export interface ImportPreviewSummary {
  rowCount: number;
  errorCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

/** Lote de importación almacenado. */
export interface ImportBatch {
  id: string;
  source: string;
  filename: string;
  fileHash: string;
  status: string;
  rowCount: number;
  errorCount: number;
  firstDate: string | null;
  lastDate: string | null;
  createdAt: string;
  committedAt: string | null;
  rolledBackAt: string | null;
  summary: ImportPreviewSummary;
}

/** Fila individual de importación. */
export interface ImportRow {
  id: string;
  batchId: string;
  rowIndex: number;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown> | null;
  status: string;
  error: string | null;
  rowHash: string | null;
  transactionId: string | null;
  createdAt: string;
}

/** Punto de histórico materializado. */
export interface HistoryPoint {
  date: string;
  value: number;
  dataQuality: 'live' | 'historical' | string;
}

/** Cotización puntual cacheada. */
export interface PriceQuote {
  price: number;
  currency: string;
  marketDate: string | null;
  source: string;
}
