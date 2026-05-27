function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const knownNameHints = [
  { pattern: /\bADVANCED MICRO DEVICES\b|\bAMD\b/, symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', currency: 'USD', exchange: 'NMS' },
  { pattern: /\bALPHABET\b.*\bCLASS C\b|\bGOOGLE\b|\bGOOG\b/, symbol: 'GOOG', name: 'Alphabet Inc. Class C', currency: 'USD', exchange: 'NMS' },
  { pattern: /\bALPHABET\b.*\bCLASS A\b|\bGOOGL\b/, symbol: 'GOOGL', name: 'Alphabet Inc. Class A', currency: 'USD', exchange: 'NMS' },
  { pattern: /\bMETA PLATFORMS\b|\bFACEBOOK\b/, symbol: 'META', name: 'Meta Platforms, Inc.', currency: 'USD', exchange: 'NMS' },
  { pattern: /\bINDUSTRIA DE DISENO TEXTIL\b|\bINDITEX\b/, symbol: 'ITX.MC', name: 'Industria de Diseno Textil, S.A.', currency: 'EUR', exchange: 'MCE' },
  { pattern: /\bVIDRALA\b/, symbol: 'VID.MC', name: 'Vidrala, S.A.', currency: 'EUR', exchange: 'MCE' },
];

const wseInstruments = [
  { isin: 'PLTXTPL00011', symbol: 'TXT.WA', name: 'Ten Square Games S.A.', currency: 'PLN', exchange: 'WSE' },
  { isin: 'PLSPRPL00012', symbol: 'SPR.WA', name: 'Sprintrade S.A.', currency: 'PLN', exchange: 'WSE' },
];

function localTickerSuggestions(identity = {}) {
  const text = normalizeSearchText(`${identity.name || identity.label || ''} ${identity.isin || ''} ${identity.exchange || ''}`);
  const currency = String(identity.currency || '').trim().toUpperCase();
  const isin = String(identity.isin || '').trim().toUpperCase();
  const suggestions = [];
  for (const hint of knownNameHints) {
    if (!hint.pattern.test(text)) continue;
    suggestions.push({
      yahooSymbol: hint.symbol,
      displayName: hint.name,
      currency: hint.currency,
      exchange: hint.exchange,
      confidence: hint.currency === currency || !currency ? 'alta' : 'media',
      reason: 'Coincidencia por nombre normalizado',
      source: 'local',
    });
  }
  if (isin) {
    for (const wse of wseInstruments) {
      if (wse.isin.toUpperCase() === isin) {
        suggestions.push({
          yahooSymbol: wse.symbol,
          displayName: wse.name,
          currency: wse.currency,
          exchange: wse.exchange,
          confidence: 'alta',
          reason: 'Coincidencia por ISIN (WSE)',
          source: 'local',
        });
      }
    }
  }
  return suggestions;
}

async function yahooSearchSuggestions(identity = {}) {
  const rawQuery = String(identity.name || identity.label || identity.isin || '').trim();
  if (!rawQuery || typeof fetch !== 'function') return [];
  const query = rawQuery.replace(/\.[A-Z]{2,}$/, '').trim();
  if (!query) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.quotes || [])
      .filter((quote) => quote.symbol && quote.quoteType === 'EQUITY')
      .slice(0, 5)
      .map((quote) => ({
        yahooSymbol: quote.symbol,
        displayName: quote.shortname || quote.longname || quote.symbol,
        currency: quote.currency || null,
        exchange: quote.exchDisp || quote.exchange || null,
        confidence: 'media',
        reason: 'Resultado de busqueda Yahoo por nombre',
        source: 'yahoo',
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function mergeSuggestions(...groups) {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const item of group || []) {
      const symbol = String(item.yahooSymbol || '').trim().toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      merged.push({ ...item, yahooSymbol: symbol });
    }
  }
  return merged.slice(0, 6);
}

module.exports = function attach(ctx) {
  function suggestTickersForIdentity(identity = {}) {
    return localTickerSuggestions(identity);
  }

  async function searchTickerSuggestions(identity = {}) {
    return mergeSuggestions(localTickerSuggestions(identity), await yahooSearchSuggestions(identity));
  }

  Object.assign(ctx, {
    suggestTickersForIdentity,
    searchTickerSuggestions,
  });
};
