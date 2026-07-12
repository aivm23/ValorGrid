const crypto = require('node:crypto');
const { assertCtxDeps } = require('../../platform/ctx-utils');

const SPLIT_NOTICE =
  'Yahoo Finance informa de un split o dividend split relacionado con este valor. ValorGrid todavía no trata splits de dividendos; será una mejora futura de una próxima edición.';

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than 0`);
  return number;
}

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    [
      'repositories',
      'services',
      'getToday',
      'addDays',
      'listInstruments',
      'getPositionShares',
      'getYahooDividendEvents',
      'getFxToEur',
      'invalidateLedger',
    ],
    'dividend-service',
  );

  const {
    repositories,
    getToday,
    addDays,
    listInstruments,
    getPositionShares,
    getYahooDividendEvents,
    getFxToEur,
    invalidateLedger,
  } = ctx;

  const dividendRepository = repositories.dividends;
  const transactionRepository = repositories.transactions;
  if (!dividendRepository) throw new Error('dividend-service requires ctx.repositories.dividends');
  if (!transactionRepository) throw new Error('dividend-service requires ctx.repositories.transactions');

  function eligibleInstruments(symbols = null) {
    const wanted = symbols?.length ? new Set(symbols.map((item) => String(item).toUpperCase())) : null;
    return listInstruments().filter((instrument) => {
      if (!['stock', 'etf'].includes(instrument.type)) return false;
      if (!instrument.yahooSymbol && !instrument.yahoo_symbol) return false;
      return !wanted || wanted.has(String(instrument.symbol).toUpperCase());
    });
  }

  function scanWindow(input = {}) {
    const today = getToday();
    const latest = dividendRepository.getLatestDividendScanRun();
    const firstTransactionDate = dividendRepository.getFirstTransactionDate();
    const fromDate =
      input.fromDate ||
      (latest?.status === 'completed' && latest.toDate ? addDays(latest.toDate, -14) : firstTransactionDate) ||
      today;
    const toDate = input.toDate || today;
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) throw new Error('Dividend scan dates must use YYYY-MM-DD');
    if (fromDate > toDate) throw new Error('fromDate cannot be after toDate');
    return { fromDate, toDate };
  }

  function normalizeDraftInput(input) {
    return {
      amountPerShare: positiveNumber(input.amountPerShare, 'amountPerShare'),
      shares: positiveNumber(input.shares, 'shares'),
      totalEur: positiveNumber(input.totalEur, 'totalEur'),
    };
  }

  function transactionRowForEvent(event) {
    const id = `dividend:${Date.now().toString(36)}:${crypto.randomUUID()}`;
    return {
      id,
      symbol: event.symbol,
      name: event.name || event.symbol,
      date: event.exDate,
      marketDate: event.exDate,
      shares: Number(event.effectiveShares),
      valueEur: Number(event.effectiveTotalEur),
      price: Number(event.effectiveAmountPerShare),
      currency: event.currency,
      fxToEur: Number(event.fxToEur || 1),
      cashFlowEur: Number(event.effectiveTotalEur),
      color: null,
      autoKey: `dividend:${event.symbol}:${event.sourceEventId}`,
      externalId: event.sourceEventId,
      rawHash: hashJson({
        symbol: event.symbol,
        sourceEventId: event.sourceEventId,
        amountPerShare: event.effectiveAmountPerShare,
        shares: event.effectiveShares,
        totalEur: event.effectiveTotalEur,
      }),
    };
  }

  function confirmEvent(event, confirmedAutomatically = false) {
    if (!event || event.status !== 'draft') throw new Error('Dividend draft not found');
    if (confirmedAutomatically && event.hasSplitNotice) throw new Error('Dividend with split notice requires review');
    const autoKey = `dividend:${event.symbol}:${event.sourceEventId}`;
    if (transactionRepository.transactionExistsByAutoKey(autoKey)) {
      return event.transactionId ? event : dividendRepository.getDividendEvent(event.id);
    }
    const row = transactionRowForEvent(event);
    const confirmed = dividendRepository.insertDividendTransactionAndConfirm(event, row, confirmedAutomatically);
    invalidateLedger(event.exDate, confirmedAutomatically ? 'dividend-auto-confirm' : 'dividend-confirm');
    return confirmed;
  }

  async function processDividendEvent(instrument, yahooEvent, counters) {
    counters.detectedEvents += 1;
    const symbol = instrument.symbol;
    const yahooSymbol = instrument.yahooSymbol || instrument.yahoo_symbol;
    const shares = Number(getPositionShares(symbol, yahooEvent.exDate) || 0);
    if (shares <= 0.0000001) {
      counters.ignoredNoShares += 1;
      return null;
    }

    const currency = String(yahooEvent.currency || instrument.currency || 'EUR').toUpperCase();
    const fxToEur = currency === 'EUR' ? 1 : await getFxToEur(currency, yahooEvent.exDate, { allowStale: true });
    if (!Number.isFinite(Number(fxToEur)) || Number(fxToEur) <= 0) {
      counters.failedSymbols.push({ symbol, yahooSymbol, error: `FX not available for ${currency}` });
      return null;
    }

    const grossOriginal = shares * Number(yahooEvent.amountPerShare);
    const grossEur = grossOriginal * Number(fxToEur);
    const hasSplitNotice = Boolean(yahooEvent.splitNotice);
    if (hasSplitNotice) counters.splitNoticeCount += 1;
    const sourceEventId = yahooEvent.sourceEventId;
    const draft = {
      id: `dividend:${symbol}:${hashJson({ sourceEventId }).slice(0, 16)}`,
      symbol,
      yahooSymbol,
      sourceEventId,
      exDate: yahooEvent.exDate,
      payDate: yahooEvent.payDate || null,
      currency,
      detectedAmountPerShare: Number(yahooEvent.amountPerShare),
      detectedShares: shares,
      detectedTotalOriginal: grossOriginal,
      detectedTotalEur: grossEur,
      fxToEur: Number(fxToEur),
      hasSplitNotice,
      splitNotice: hasSplitNotice ? yahooEvent.splitNotice || SPLIT_NOTICE : null,
      rawJson: JSON.stringify(yahooEvent.raw || {}),
    };

    const setting = dividendRepository.getDividendSetting(symbol);
    const result = dividendRepository.upsertDividendDraft(draft);
    if (result.created && (!setting.autoInclude || hasSplitNotice)) counters.createdDrafts += 1;
    else if (result.updated && (!setting.autoInclude || hasSplitNotice)) counters.updatedDrafts += 1;

    if (setting.autoInclude && !hasSplitNotice) {
      const event = result.event || dividendRepository.findDividendEventBySource(symbol, sourceEventId);
      if (event?.status === 'draft') {
        confirmEvent(event, true);
        counters.autoConfirmed += 1;
      }
    }
    return result.event;
  }

  async function scanDividendEvents(input = {}) {
    const { fromDate, toDate } = scanWindow(input);
    const mode = input.mode || 'api';
    const runId = `dividend-scan:${Date.now().toString(36)}:${crypto.randomUUID()}`;
    dividendRepository.createDividendScanRun({ id: runId, mode, fromDate, toDate });
    const counters = {
      status: 'completed',
      scannedSymbols: 0,
      detectedEvents: 0,
      createdDrafts: 0,
      updatedDrafts: 0,
      autoConfirmed: 0,
      ignoredNoShares: 0,
      splitNoticeCount: 0,
      failedSymbols: [],
    };

    try {
      const instruments = eligibleInstruments(input.symbols || null);
      counters.scannedSymbols = instruments.length;
      for (const instrument of instruments) {
        const yahooSymbol = instrument.yahooSymbol || instrument.yahoo_symbol;
        try {
          const events = await getYahooDividendEvents(yahooSymbol, fromDate, toDate);
          for (const event of events) {
            await processDividendEvent(instrument, event, counters);
          }
        } catch (error) {
          counters.failedSymbols.push({ symbol: instrument.symbol, yahooSymbol, error: error.message });
        }
      }
      const latestScan = dividendRepository.finishDividendScanRun(runId, counters);
      return { summary: { ...counters, fromDate, toDate, latestScan }, drafts: listDividendDrafts().drafts };
    } catch (error) {
      const failed = { ...counters, status: 'failed', error: error.message };
      const latestScan = dividendRepository.finishDividendScanRun(runId, failed);
      return { summary: { ...failed, fromDate, toDate, latestScan }, drafts: listDividendDrafts().drafts };
    }
  }

  function runStartupDividendScan() {
    const running = dividendRepository.findRunningDividendScanRun();
    if (running) return { skipped: true, reason: 'scan-running', running };
    return scanDividendEvents({ mode: 'startup' });
  }

  function listDividendDrafts() {
    return { drafts: dividendRepository.listDividendEvents({ status: 'draft' }) };
  }

  function getDividendSummary() {
    return dividendRepository.getDividendSummary();
  }

  function updateDividendDraft(id, input) {
    const event = dividendRepository.getDividendEvent(id);
    if (!event || event.status !== 'draft') throw new Error('Dividend draft not found');
    return { draft: dividendRepository.updateDividendDraft(id, normalizeDraftInput(input)) };
  }

  function confirmDividendDraft(id, input = {}) {
    const event = dividendRepository.getDividendEvent(id);
    const confirmed = confirmEvent(event, false);
    if (input.autoIncludeNext) {
      dividendRepository.setDividendAutoInclude(confirmed.symbol, true);
    }
    return { draft: dividendRepository.getDividendEvent(id), transactionId: confirmed.transactionId };
  }

  function ignoreDividendDraft(id) {
    const event = dividendRepository.getDividendEvent(id);
    if (!event || event.status !== 'draft') throw new Error('Dividend draft not found');
    return { draft: dividendRepository.markDividendIgnored(id) };
  }

  function setDividendAutoInclude(symbol, autoInclude) {
    const normalized = String(symbol || '')
      .trim()
      .toUpperCase();
    if (!normalized) throw new Error('symbol is required');
    return { setting: dividendRepository.setDividendAutoInclude(normalized, Boolean(autoInclude)) };
  }

  Object.assign(ctx, {
    scanDividendEvents,
    listDividendDrafts,
    getDividendSummary,
    updateDividendDraft,
    confirmDividendDraft,
    ignoreDividendDraft,
    setDividendAutoInclude,
    runStartupDividendScan,
  });
};
