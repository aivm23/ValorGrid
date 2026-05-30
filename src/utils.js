const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['memoryCache', 'memoryCacheTtlMs'], 'utils');

  const { memoryCache, memoryCacheTtlMs } = ctx;

  function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(payload));
  }

  function sendText(response, statusCode, text, contentType = 'text/plain; charset=utf-8', headers = {}) {
    response.writeHead(statusCode, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      ...headers,
    });
    response.end(text);
  }

  async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {};
  }

  function normalizeSymbol(value) {
    return String(value || '').trim().toUpperCase();
  }

  function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateUtc(value) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  function formatDateUtc(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const date = typeof value === 'string' ? dateUtc(value) : new Date(value);
    date.setUTCDate(date.getUTCDate() + days);
    return formatDateUtc(date);
  }

  function addYears(value, years) {
    const date = typeof value === 'string' ? dateUtc(value) : new Date(value);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return formatDateUtc(date);
  }

  function toUnixSeconds(date) {
    return Math.floor(date.getTime() / 1000);
  }

  function toEur(price, currency, fxToEur = 1) {
    return String(currency || 'EUR').toUpperCase() === 'EUR' ? price : price * fxToEur;
  }

  function transactionSign(type) {
    return type === 'remove' ? -1 : 1;
  }

  function getMemoryCached(key) {
    const item = memoryCache.get(key);
    if (!item || Date.now() - item.createdAt > memoryCacheTtlMs) {
      memoryCache.delete(key);
      return null;
    }
    return item.value;
  }

  function setMemoryCached(key, value) {
    memoryCache.set(key, { createdAt: Date.now(), value });
    return value;
  }

  Object.assign(ctx, { sendJson, sendText, readJsonBody, normalizeSymbol, getToday, dateUtc, formatDateUtc, addDays, addYears, toUnixSeconds, toEur, transactionSign, getMemoryCached, setMemoryCached });
};
