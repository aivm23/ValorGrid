export function attach(ctx) {
  const eurFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' });
  const sharesFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const cryptoSharesFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
  const historyRangeConfig = {
    all: { granularity: 'weekly', years: null },
    '5y': { granularity: 'weekly', years: 5 },
    '2y': { granularity: 'weekly', years: 2 },
    '1y': { granularity: 'daily', years: 1 },
    ytd: { granularity: 'daily', years: 0 },
  };
  const assetColors = {};
  const state = {
    dashboard: {
      summary: null,
      marketDataSources: null,
      onboarding: null,
      monthly: null,
      groupsEnabled: true,
      initialLoadComplete: false,
      version: null,
      edition: 'community',
      brandPaletteEnabled: false,
      liquidity: null,
      uiPreferences: null,
      uiPreferencesEditable: false,
    },
    history: {
      history: null,
      historyRange: 'ytd',
      historyCache: {},
      historyRequestId: 0,
      historyAbortController: null,
    },
    transactions: {
      transactions: [],
      autoPlans: [],
      autoPlanDrafts: [],
      autoPlanRetroactiveConfirmed: false,
      transactionEntryMode: 'market_eur',
      transactionPreviewOk: false,
      transactionEditPreviewOk: false,
      selectedTransactionIds: [],
      visibleTransactionIds: [],
      pendingTransactionDelete: [],
      ledgerCurrentPage: 1,
    },
    instruments: {
      instruments: [],
      groups: [],
      instrumentPositionFilter: 'all',
      instrumentFilters: { symbol: '', yahoo: '', name: '', group: '', currency: '' },
      selectedInstrumentSymbols: [],
      visibleInstrumentSymbols: [],
      selectedGroupIds: [],
      visibleGroupIds: [],
      selectedLiquiditySymbols: [],
      pendingInstrumentDelete: [],
      returnToOperationDialogAfterInstrumentCreate: false,
    },
    imports: {
      importPreview: null,
      importRowActions: {},
      importRowMappings: {},
      importRowEdits: {},
      importInstrumentChoices: {},
      importConfirmedSteps: {},
      importOperationFilter: 'all',
      importStep: 'file',
      importWorkflowBusy: false,
      importInstrumentValidationAttempted: false,
      importBatches: [],
      importFileMeta: null,
      importInstrumentChoicesSnapshot: null,
      importRollbackLog: [],
    },
    preferences: {
      hideBalances: false,
      negativeRed: true,
      dateFormat: 'dd/mm/yyyy',
      weekStart: 'monday',
      ledgerPageSize: 1000,
      language: 'es',
    },
    ui: {
      backups: [],
      expandedGroupId: null,
      dividendSummary: null,
      dividendDrafts: [],
      dividendScanInProgress: false,
      dividendStartupScanRequested: false,
      dividendDraftDialogOpen: false,
      extensionManifest: null,
      wizardPreview: null,
    },
  };

  // Bridge for modules not yet migrated to direct slice access. New state belongs in a named slice.
  for (const slice of Object.values(state)) {
    for (const key of Object.keys(slice)) {
      Object.defineProperty(state, key, {
        enumerable: false,
        configurable: false,
        get: () => slice[key],
        set: (value) => {
          slice[key] = value;
        },
      });
    }
  }

  Object.assign(ctx, { eurFormatter, sharesFormatter, cryptoSharesFormatter, historyRangeConfig, assetColors, state });
}
