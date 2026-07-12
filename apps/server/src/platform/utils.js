const { assertCtxDeps } = require('./ctx-utils');

/**
 * @param {Record<string, unknown>} ctx
 */
module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['memoryCache', 'memoryCacheTtlMs'], 'utils');

  const { memoryCache, memoryCacheTtlMs } = ctx;

  /**
   * @param {import('node:http').ServerResponse} response
   * @param {number} statusCode
   * @param {unknown} payload
   */
  function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(payload));
  }

  /**
   * @param {import('node:http').ServerResponse} response
   * @param {number} statusCode
   * @param {string} text
   * @param {string} [contentType]
   * @param {Record<string, string>} [headers]
   */
  function sendText(response, statusCode, text, contentType = 'text/plain; charset=utf-8', headers = {}) {
    response.writeHead(statusCode, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      ...headers,
    });
    response.end(text);
  }

  /**
   * @param {import('node:http').IncomingMessage} request
   * @returns {Promise<Record<string, unknown>>}
   */
  const MAX_BODY_BYTES = 1024 * 1024;

  async function readJsonBody(request) {
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of request) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        request.destroy();
        throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
      }
      chunks.push(chunk);
    }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {};
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeSymbol(value) {
    return String(value || '')
      .trim()
      .toUpperCase();
  }

  /** @returns {string} */
  function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * @param {string} value
   * @returns {Date}
   */
  function dateUtc(value) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  /**
   * @param {Date} date
   * @returns {string}
   */
  function formatDateUtc(date) {
    return date.toISOString().slice(0, 10);
  }

  /**
   * @param {string | Date} value
   * @param {number} days
   * @returns {string}
   */
  function addDays(value, days) {
    const date = typeof value === 'string' ? dateUtc(value) : new Date(value);
    date.setUTCDate(date.getUTCDate() + days);
    return formatDateUtc(date);
  }

  /**
   * @param {string | Date} value
   * @param {number} years
   * @returns {string}
   */
  function addYears(value, years) {
    const date = typeof value === 'string' ? dateUtc(value) : new Date(value);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return formatDateUtc(date);
  }

  /**
   * @param {Date} date
   * @returns {number}
   */
  function toUnixSeconds(date) {
    return Math.floor(date.getTime() / 1000);
  }

  /**
   * @param {number} price
   * @param {string} currency
   * @param {number} [fxToEur]
   * @returns {number}
   */
  function toEur(price, currency, fxToEur = 1) {
    return String(currency || 'EUR').toUpperCase() === 'EUR' ? price : price * fxToEur;
  }

  /**
   * @param {string} type
   * @returns {number}
   */
  function transactionSign(type) {
    if (type === 'remove') return -1;
    if (type === 'dividend') return 0;
    return 1;
  }

  /**
   * @template T
   * @param {string} key
   * @returns {T | null}
   */
  function getMemoryCached(key) {
    const item = memoryCache.get(key);
    if (!item || Date.now() - item.createdAt > memoryCacheTtlMs) {
      memoryCache.delete(key);
      return null;
    }
    return item.value;
  }

  /**
   * @template T
   * @param {string} key
   * @param {T} value
   * @returns {T}
   */
  function setMemoryCached(key, value) {
    memoryCache.set(key, { createdAt: Date.now(), value });
    return value;
  }

  Object.assign(ctx, {
    sendJson,
    sendText,
    readJsonBody,
    normalizeSymbol,
    getToday,
    dateUtc,
    formatDateUtc,
    addDays,
    addYears,
    toUnixSeconds,
    toEur,
    transactionSign,
    getMemoryCached,
    setMemoryCached,
  });
};
