function acceptLanguage() {
  try {
    const language = localStorage.getItem('valorgrid-language') || navigator.language || 'es';
    return String(language).toLowerCase().startsWith('en') ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

export async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal.reason || 'cancelled');
  if (options.signal) {
    if (options.signal.aborted) abortFromCaller();
    options.signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeoutId = window.setTimeout(() => controller.abort('timeout'), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Accept-Language': acceptLanguage() },
    });
  } finally {
    window.clearTimeout(timeoutId);
    if (options.signal) {
      options.signal.removeEventListener('abort', abortFromCaller);
    }
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

export async function sendJson(url, method, payload, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort(new Error('tiempo de espera agotado'));
  }, options.timeoutMs || 45000);
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept-Language': acceptLanguage() },
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeoutId));

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

export async function fetchBlob(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort('timeout'), options.timeoutMs || 45000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Accept-Language': acceptLanguage() },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.blob();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function normalizeErrorMessage(error) {
  if (error.name === 'AbortError') return 'peticion cancelada o tiempo de espera agotado';
  return error.message || String(error) || 'error desconocido';
}
