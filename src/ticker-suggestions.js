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

function nameHintSuggestions(identity = {}) {
  const text = normalizeSearchText(`${identity.name || identity.label || ''} ${identity.isin || ''} ${identity.exchange || ''}`);
  const currency = String(identity.currency || '').trim().toUpperCase();
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
  return suggestions;
}

function dbTickerSuggestions(ctx, identity = {}) {
  const isin = String(identity.isin || '').trim().toUpperCase();
  if (!isin || !ctx?.db) return [];
  try {
    const row = ctx.db
      .prepare(
        `SELECT ii.instrument_symbol AS symbol, ii.display_name AS displayName,
                ii.currency, ii.exchange, i.yahoo_symbol AS yahooSymbol, i.name, i.color
         FROM instrument_identifiers ii
         JOIN instruments i ON i.symbol = ii.instrument_symbol
         WHERE ii.provider = 'global' AND ii.identifier_type = 'isin' AND ii.identifier_value = ?
         LIMIT 1`,
      )
      .get(isin);
    if (!row) return [];
    return [{
      yahooSymbol: row.yahooSymbol || row.symbol,
      displayName: row.displayName || row.name || row.symbol,
      currency: row.currency || null,
      exchange: row.exchange || null,
      confidence: 'alta',
      reason: 'Coincidencia por ISIN en importaciones anteriores',
      source: 'history',
    }];
  } catch {
    return [];
  }
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
    return mergeSuggestions(dbTickerSuggestions(ctx, identity), nameHintSuggestions(identity));
  }

  async function searchTickerSuggestions(identity = {}) {
    return mergeSuggestions(
      dbTickerSuggestions(ctx, identity),
      nameHintSuggestions(identity),
      await yahooSearchSuggestions(identity),
    );
  }

  Object.assign(ctx, {
    suggestTickersForIdentity,
    searchTickerSuggestions,
  });
};
