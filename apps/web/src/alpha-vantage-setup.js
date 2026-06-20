export function attach(ctx) {
  const elements = {
    dialog: document.getElementById('alpha-vantage-dialog'),
    close: document.getElementById('alpha-vantage-dialog-close'),
    getKey: document.getElementById('alpha-vantage-get-key'),
    keyInput: document.getElementById('alpha-vantage-key-input'),
    saveKey: document.getElementById('alpha-vantage-save-key'),
    skip: document.getElementById('alpha-vantage-skip'),
    feedback: document.getElementById('alpha-vantage-feedback'),
    copy: document.getElementById('alpha-vantage-assistant-copy'),
  };

  let pendingCommodityCreate = null;

  function setFeedback(message, isError = false) {
    elements.feedback.textContent = message;
    elements.feedback.dataset.state = message ? (isError ? 'error' : 'ok') : '';
  }

  async function checkAlphaVantageStatus() {
    try {
      const data = await ctx.fetchJson('/api/market-data/alpha-vantage/status');
      return data;
    } catch {
      return { configured: false, mode: 'server', hint: 'No se pudo comprobar el estado' };
    }
  }

  async function openAlphaVantageAssistant(callback) {
    pendingCommodityCreate = callback || null;
    const status = await checkAlphaVantageStatus();
    if (status.configured) {
      if (pendingCommodityCreate) {
        pendingCommodityCreate();
        pendingCommodityCreate = null;
      }
      return;
    }
    if (status.mode !== 'desktop') {
      elements.copy.textContent = 'Alpha Vantage no está configurado. En modo servidor, configura VALORGRID_ALPHA_VANTAGE_API_KEY en las variables de entorno.';
      elements.getKey.hidden = true;
      elements.keyInput.hidden = true;
      elements.saveKey.hidden = true;
      elements.skip.textContent = 'Cerrar';
    } else {
      elements.copy.textContent = 'Para obtener precios de commodities necesitas una clave gratuita de Alpha Vantage.';
      elements.getKey.hidden = false;
      elements.keyInput.hidden = false;
      elements.saveKey.hidden = false;
      elements.skip.textContent = 'Ahora no';
    }
    elements.keyInput.value = '';
    setFeedback('');
    elements.dialog.showModal();
  }

  function closeAlphaVantageAssistant() {
    elements.dialog.close();
    pendingCommodityCreate = null;
  }

  async function saveKey() {
    const key = elements.keyInput.value.trim();
    if (!key) {
      setFeedback('Introduce la clave que has recibido de Alpha Vantage.', true);
      return;
    }
    setFeedback('Validando clave con Alpha Vantage...');
    elements.saveKey.disabled = true;
    try {
      const result = await ctx.sendJson('/api/market-data/alpha-vantage/key', 'POST', { apiKey: key });
      setFeedback(result.message || 'Clave guardada correctamente.');
      elements.saveKey.disabled = false;
      if (pendingCommodityCreate) {
        window.setTimeout(() => {
          closeAlphaVantageAssistant();
          pendingCommodityCreate();
          pendingCommodityCreate = null;
        }, 1200);
      } else {
        window.setTimeout(closeAlphaVantageAssistant, 1200);
      }
    } catch (error) {
      setFeedback(ctx.normalizeErrorMessage(error), true);
      elements.saveKey.disabled = false;
    }
  }

  elements.close.addEventListener('click', closeAlphaVantageAssistant);
  elements.skip.addEventListener('click', () => {
    closeAlphaVantageAssistant();
  });
  elements.getKey.addEventListener('click', () => {
    window.open('https://www.alphavantage.co/support/#api-key', '_blank');
  });
  elements.saveKey.addEventListener('click', saveKey);
  elements.keyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveKey();
  });

  async function createCommodityWithAlphaVantageCheck(payload) {
    const status = await checkAlphaVantageStatus();
    if (status.configured) {
      await ctx.sendJson('/api/instruments', 'POST', payload);
      return true;
    }
    return new Promise((resolve) => {
      openAlphaVantageAssistant(async () => {
        try {
          await ctx.sendJson('/api/instruments', 'POST', payload);
          resolve(true);
        } catch (error) {
          const errEl = document.getElementById('instrument-create-error');
          if (errEl) {
            errEl.textContent = ctx.normalizeErrorMessage(error);
            errEl.hidden = false;
          }
          resolve(false);
        }
      });
    });
  }

  Object.assign(ctx, { openAlphaVantageAssistant, closeAlphaVantageAssistant, checkAlphaVantageStatus, createCommodityWithAlphaVantageCheck });
}