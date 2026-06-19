export function setupInstrumentForm(elements) {
  function syncForm() {
    const type = elements.newInstrumentType?.value || 'etf';
    const isCommodity = type === 'commodity';
    const yahooField = document.querySelector('.yahoo-field');
    const commodityField = document.querySelector('.commodity-field');
    if (yahooField) yahooField.hidden = isCommodity;
    if (commodityField) commodityField.hidden = !isCommodity;
    if (isCommodity) {
      elements.newInstrumentCurrency.value = 'USD';
    }
    const errEl = document.getElementById('instrument-create-error');
    if (errEl) errEl.hidden = true;
  }

  elements.newInstrumentType?.addEventListener('change', syncForm);
  elements.newInstrumentCommodity?.addEventListener('change', () => {
    const commodity = elements.newInstrumentCommodity.value;
    if (commodity) {
      if (!elements.newInstrumentSymbol.value) elements.newInstrumentSymbol.value = commodity;
      if (!elements.newInstrumentName.value) {
        const labels = {
          GOLD: 'Gold spot',
          SILVER: 'Silver spot',
          WTI: 'WTI crude oil',
          BRENT: 'Brent crude oil',
          NATURAL_GAS: 'Natural gas',
        };
        elements.newInstrumentName.value = labels[commodity] || commodity;
      }
      elements.newInstrumentCurrency.value = 'USD';
    }
    const errEl = document.getElementById('instrument-create-error');
    if (errEl) errEl.hidden = true;
  });

  syncForm();
}

export function buildInstrumentPayload(elements) {
  const symbol = elements.newInstrumentSymbol.value.trim().toUpperCase();
  const type = elements.newInstrumentType?.value || 'etf';
  const isCommodity = type === 'commodity';
  const payload = {
    symbol,
    yahooSymbol: symbol,
    name: elements.newInstrumentName.value || symbol,
    type,
    currency: isCommodity ? 'USD' : (elements.newInstrumentCurrency.value || 'EUR'),
    groupId: elements.newInstrumentGroup?.value,
  };
  if (isCommodity) {
    const commodity = elements.newInstrumentCommodity?.value;
    payload.providerSymbol = commodity;
    payload.provider = 'alpha_vantage';
  } else {
    payload.yahooSymbol = elements.newInstrumentYahoo?.value || symbol;
  }
  return payload;
}

export function resetInstrumentForm(elements) {
  elements.newInstrumentSymbol.value = '';
  elements.newInstrumentYahoo.value = '';
  elements.newInstrumentCommodity.value = '';
  elements.newInstrumentName.value = '';
  elements.newInstrumentCurrency.value = 'EUR';
  if (elements.newInstrumentGroup) elements.newInstrumentGroup.value = '';
  elements.newInstrumentType.value = 'etf';
  const yahooField = document.querySelector('.yahoo-field');
  const commodityField = document.querySelector('.commodity-field');
  if (yahooField) yahooField.hidden = false;
  if (commodityField) commodityField.hidden = true;
  const errEl = document.getElementById('instrument-create-error');
  if (errEl) errEl.hidden = true;
}