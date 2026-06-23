const { assertCtxDeps } = require('../../platform/ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(
    ctx,
    ['sendJson', 'readJsonBody', 'config', 'readAlphaVantageKey', 'saveAlphaVantageKey', 'deleteAlphaVantageKey'],
    'route-market-data-alpha-vantage',
  );

  const { sendJson, readJsonBody, config, saveAlphaVantageKey, deleteAlphaVantageKey } = ctx;
  const ALPHA_VANTAGE_KEY_PATTERN = /^[A-Z0-9]{16}$/;

  function currentKey() {
    return process.env.VALORGRID_ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY || '';
  }

  function currentKeySource() {
    const key = currentKey();
    if (!key) return null;
    return process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE === 'local' ? 'local' : 'env';
  }

  function setKey(key) {
    process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = key;
    process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = 'local';
    if (config?.marketData) config.marketData.alphaVantageApiKey = key;
  }

  function clearKey() {
    delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY;
    delete process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE;
    if (config?.marketData) config.marketData.alphaVantageApiKey = '';
  }

  async function testAlphaVantageKey(key) {
    const params = new URLSearchParams({ function: 'GOLD_SILVER_SPOT', apikey: key, symbol: 'GOLD' });
    const reqUrl = `https://www.alphavantage.co/query?${params.toString()}`;
    const fetchResponse = await fetch(reqUrl, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 ValorGrid' },
      signal: AbortSignal.timeout(12000),
    });
    if (!fetchResponse.ok)
      return { valid: false, limited: false, error: `Alpha Vantage responded ${fetchResponse.status}` };
    const payload = await fetchResponse.json();
    if (payload.price && payload.nominal) return { valid: true, limited: false };
    if (payload.Note) return { valid: false, limited: payload.Note.includes('limit'), error: payload.Note };
    if (payload.Information)
      return { valid: false, limited: payload.Information.includes('limit'), error: payload.Information };
    if (payload['Error Message']) return { valid: false, limited: false, error: payload['Error Message'] };
    return { valid: false, limited: false, error: 'Alpha Vantage no devolvió datos de commodity' };
  }

  function isDesktopMode() {
    return config?.runtime?.mode === 'desktop';
  }

  function secretsDir() {
    const userDataDir = config?.runtime?.userDataDir || '';
    return userDataDir || config?.secretsDir || '';
  }

  function canSaveLocalKey() {
    return Boolean(secretsDir()) && currentKeySource() !== 'env';
  }

  async function handleAlphaVantageKeyRoutes(_ctx, request, response, url) {
    if (url.pathname === '/api/market-data/alpha-vantage/status' && request.method === 'GET') {
      const key = currentKey();
      const canSaveKey = canSaveLocalKey();
      sendJson(response, 200, {
        configured: Boolean(key),
        mode: isDesktopMode() ? 'desktop' : 'server',
        source: currentKeySource(),
        canSaveKey,
        hint: !key
          ? isDesktopMode()
            ? 'Abre https://www.alphavantage.co/support/#api-key para obtener tu clave gratuita'
            : canSaveKey
              ? 'Pega tu clave de Alpha Vantage para guardarla en el volumen persistente'
              : 'Configura VALORGRID_ALPHA_VANTAGE_API_KEY en tus variables de entorno'
          : null,
      });
      return true;
    }

    if (url.pathname === '/api/market-data/alpha-vantage/key' && request.method === 'POST') {
      if (!canSaveLocalKey()) {
        sendJson(response, 400, {
          error: 'Alpha Vantage API key está gestionada por variable de entorno',
          hint: 'Elimina o cambia VALORGRID_ALPHA_VANTAGE_API_KEY en la configuración del contenedor para sustituirla',
        });
        return true;
      }
      const body = await readJsonBody(request);
      const key = String(body.apiKey || '')
        .trim()
        .toUpperCase();
      if (!ALPHA_VANTAGE_KEY_PATTERN.test(key)) {
        sendJson(response, 400, {
          error: 'La clave de Alpha Vantage debe tener 16 caracteres alfanuméricos mayúsculas',
          hint: 'Copia exactamente la clave de https://www.alphavantage.co/support/#api-key',
        });
        return true;
      }
      try {
        const testResult = await testAlphaVantageKey(key);
        if (!testResult.valid) {
          if (testResult.limited) {
            saveAlphaVantageKey(secretsDir(), key);
            setKey(key);
            sendJson(response, 200, {
              message: 'Clave guardada. El límite diario de Alpha Vantage está activo (25 llamadas/día).',
            });
            return true;
          }
          sendJson(response, 400, {
            error: 'La clave no es válida. Alpha Vantage no la reconoce.',
            hint: testResult.error,
          });
          return true;
        }
        saveAlphaVantageKey(secretsDir(), key);
        setKey(key);
        sendJson(response, 201, { message: 'Clave de Alpha Vantage guardada correctamente' });
        return true;
      } catch (error) {
        sendJson(response, 502, { error: 'No se pudo validar la clave con Alpha Vantage', hint: error.message });
        return true;
      }
    }

    if (url.pathname === '/api/market-data/alpha-vantage/key' && request.method === 'DELETE') {
      if (currentKeySource() === 'env') {
        sendJson(response, 400, {
          error: 'Alpha Vantage API key está gestionada por variable de entorno',
          hint: 'Elimina la variable VALORGRID_ALPHA_VANTAGE_API_KEY de tu entorno',
        });
        return true;
      }
      deleteAlphaVantageKey(secretsDir());
      clearKey();
      sendJson(response, 200, {
        message: 'Clave de Alpha Vantage eliminada. Los precios de commodities quedan desactivados.',
      });
      return true;
    }

    return false;
  }

  Object.assign(ctx, { handleAlphaVantageKeyRoutes });
};
