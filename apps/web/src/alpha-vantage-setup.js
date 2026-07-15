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
      const data = await ctx.api.marketData.alphaVantage.status();
      return data;
    } catch {
      return { configured: false, mode: 'server', hint: 'No se pudo comprobar el estado' };
    }
  }

  function showInstrumentCreateError(error) {
    const errEl = document.getElementById('instrument-create-error');
    if (!errEl) return;
    errEl.textContent = ctx.normalizeErrorMessage(error);
    errEl.hidden = false;
  }

  async function openAlphaVantageAssistant(callback, knownStatus = null) {
    pendingCommodityCreate = callback || null;
    const status =
      knownStatus ||
      (await ctx.withAppLoading(
        { title: ctx.t('loading.alphaVantage.check.title'), message: ctx.t('loading.alphaVantage.check.message') },
        checkAlphaVantageStatus,
      ));
    if (status.configured) {
      const pending = pendingCommodityCreate;
      pendingCommodityCreate = null;
      if (pending) await pending();
      return;
    }
    if (!status.canSaveKey) {
      elements.copy.textContent =
        'Alpha Vantage no está configurado. En modo servidor, configura VALORGRID_ALPHA_VANTAGE_API_KEY en las variables de entorno.';
      elements.getKey.hidden = true;
      elements.keyInput.hidden = true;
      elements.saveKey.hidden = true;
      elements.skip.textContent = 'Cerrar';
    } else {
      elements.copy.textContent =
        status.mode === 'desktop'
          ? 'Para obtener precios de commodities necesitas una clave gratuita de Alpha Vantage.'
          : 'Para obtener precios de commodities en Docker o CasaOS puedes guardar aquí tu clave gratuita de Alpha Vantage sin reiniciar el contenedor.';
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
    if (elements.saveKey.disabled) return;
    const key = elements.keyInput.value.trim();
    if (!key) {
      setFeedback('Introduce la clave que has recibido de Alpha Vantage.', true);
      return;
    }
    setFeedback('Validando clave con Alpha Vantage...');
    elements.saveKey.disabled = true;
    try {
      const result = await ctx.withAppLoading(
        {
          title: ctx.t('loading.alphaVantage.validate.title'),
          message: ctx.t('loading.alphaVantage.validate.message'),
        },
        async () => ctx.api.marketData.alphaVantage.saveKey(key),
      );
      setFeedback(result.message || 'Clave guardada correctamente.');
      const pending = pendingCommodityCreate;
      window.setTimeout(() => {
        elements.dialog.close();
        pendingCommodityCreate = null;
        elements.saveKey.disabled = false;
        if (pending) Promise.resolve(pending()).catch(showInstrumentCreateError);
      }, 1200);
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

  async function createCommodityWithAlphaVantageCheck(payload, onDeferredCreated) {
    const status = await ctx.withAppLoading(
      { title: ctx.t('loading.alphaVantage.check.title'), message: ctx.t('loading.alphaVantage.check.message') },
      checkAlphaVantageStatus,
    );
    if (status.configured) {
      await ctx.withAppLoading(
        {
          title: ctx.t('loading.alphaVantage.create.title'),
          message: ctx.t('loading.alphaVantage.create.message'),
        },
        async () => {
          await ctx.api.instruments.create(payload);
        },
      );
      return true;
    }

    await openAlphaVantageAssistant(async () => {
      try {
        await ctx.withAppLoading(
          {
            title: ctx.t('loading.alphaVantage.create.title'),
            message: ctx.t('loading.alphaVantage.create.message'),
          },
          async () => {
            await ctx.api.instruments.create(payload);
          },
        );
        await onDeferredCreated?.();
      } catch (error) {
        showInstrumentCreateError(error);
      }
    }, status);
    return false;
  }

  Object.assign(ctx, {
    openAlphaVantageAssistant,
    closeAlphaVantageAssistant,
    checkAlphaVantageStatus,
    createCommodityWithAlphaVantageCheck,
  });
}
