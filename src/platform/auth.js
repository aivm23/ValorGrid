const crypto = require('node:crypto');

function safeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBasicAuth(header) {
  const match = String(header || '').match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  let decoded = '';
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return null;
  }

  const separator = decoded.indexOf(':');
  if (separator === -1) return null;

  return {
    user: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

function reject(response) {
  response.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'WWW-Authenticate': 'Basic realm="ValorGrid", charset="UTF-8"',
  });
  response.end('Authentication required');
}

function createBasicAuthGuard(config = {}) {
  if (!config.enabled) return null;

  const expectedUser = String(config.user || 'valorgrid');
  const expectedPassword = String(config.password || '');

  return function authorize(request, response) {
    const credentials = parseBasicAuth(request.headers.authorization);
    const userMatches = credentials ? safeEqualString(credentials.user, expectedUser) : false;
    const passwordMatches = credentials ? safeEqualString(credentials.password, expectedPassword) : false;
    const ok = userMatches && passwordMatches;

    if (!ok) {
      reject(response);
      return false;
    }

    return true;
  };
}

module.exports = {
  createBasicAuthGuard,
  parseBasicAuth,
};
