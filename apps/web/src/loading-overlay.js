export function attach(ctx) {
  const dialog = ctx.document.getElementById('app-loading-dialog');
  if (!dialog) return;

  const titleEl = dialog.querySelector('.app-loading-title');
  const messageEl = dialog.querySelector('.app-loading-message');
  const retryBtn = dialog.querySelector('#app-loading-retry');
  const issueLink = dialog.querySelector('.app-loading-issue-link');
  const bootImg = dialog.querySelector('.app-loading-logo');
  const summaryEl = dialog.querySelector('.app-loading-summary');

  let tokenCounter = 0;
  const activeOperations = new Map();
  let openTimer = null;
  let previousFocus = null;
  let bootStatus = 'loading';
  let bootMessage = '';

  dialog.addEventListener('cancel', (event) => event.preventDefault());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.preventDefault();
  });

  function openDialog() {
    clearOpenTimer();
    if (dialog.open) return;
    previousFocus = ctx.document.activeElement;
    dialog.setAttribute('aria-busy', 'true');
    dialog.showModal();
    dialog.focus();
  }

  function closeDialog() {
    clearOpenTimer();
    dialog.classList.remove('is-error');
    if (retryBtn) retryBtn.hidden = true;
    if (issueLink) issueLink.hidden = true;
    if (bootImg) bootImg.style.animationPlayState = '';
    renderSummary(null);
    dialog.setAttribute('aria-busy', 'false');
    if (!dialog.open) return;
    dialog.close();
    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  function clearOpenTimer() {
    if (openTimer) {
      ctx.window.clearTimeout(openTimer);
      openTimer = null;
    }
  }

  function latestOperation() {
    const operations = [...activeOperations.values()];
    return operations[operations.length - 1] || null;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderSummary(summary) {
    if (!summaryEl) return;
    const rows = Array.isArray(summary?.rows) ? summary.rows.filter((row) => row?.label && row?.value != null) : [];
    if (!summary || rows.length === 0) {
      summaryEl.hidden = true;
      summaryEl.innerHTML = '';
      return;
    }
    const heading = summary.heading
      ? `<strong class="app-loading-summary-heading">${escapeHtml(summary.heading)}</strong>`
      : '';
    summaryEl.innerHTML = `${heading}<dl class="app-loading-summary-list">${rows
      .map((row) => {
        const tone = ['positive', 'negative'].includes(row.tone) ? ` is-${row.tone}` : '';
        return `<div class="app-loading-summary-row${tone}"><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`;
      })
      .join('')}</dl>`;
    summaryEl.hidden = false;
  }

  function renderOperation(operation) {
    if (!operation) return;
    titleEl.textContent = operation.title || ctx.t('loading.dashboard.title');
    messageEl.textContent = operation.message || '';
    dialog.classList.remove('is-error');
    if (retryBtn) retryBtn.hidden = true;
    if (issueLink) issueLink.hidden = true;
    if (bootImg) bootImg.style.animationPlayState = '';
    renderSummary(operation.summary);
  }

  function scheduleOperationDialog() {
    if (dialog.open) {
      renderOperation(latestOperation());
      return;
    }
    if (openTimer) return;
    openTimer = ctx.window.setTimeout(() => {
      openTimer = null;
      const operation = latestOperation();
      if (!operation) return;
      renderOperation(operation);
      openDialog();
    }, 200);
  }

  function updateBootUi(status = 'loading', message = '') {
    if (status === 'ready') {
      closeDialog();
      return;
    }
    titleEl.textContent = status === 'error' ? ctx.t('loading.boot.error') : ctx.t('loading.boot.title');
    messageEl.textContent = status === 'error' ? message : message || ctx.t('loading.boot.message');
    dialog.classList.toggle('is-error', status === 'error');
    if (retryBtn) retryBtn.hidden = status !== 'error';
    if (issueLink) issueLink.hidden = status !== 'error';
    if (bootImg) bootImg.style.animationPlayState = status === 'error' ? 'paused' : '';
    if (retryBtn) retryBtn.textContent = ctx.t('loading.boot.retry');
    if (issueLink) issueLink.textContent = ctx.t('loading.boot.issueLink');
    renderSummary(null);
    openDialog();
    dialog.setAttribute('aria-busy', status === 'error' ? 'false' : 'true');
  }

  function reconcileDialog() {
    const operation = latestOperation();
    if (operation) {
      renderOperation(operation);
      if (dialog.open) return;
      scheduleOperationDialog();
      return;
    }
    if (bootStatus !== 'ready') {
      updateBootUi(bootStatus, bootMessage);
      return;
    }
    closeDialog();
  }

  async function withAppLoading(options, operation) {
    if (typeof operation !== 'function') throw new TypeError('withAppLoading requires an operation callback');
    const { title, message } = typeof options === 'string' ? { title: options } : options || {};
    const token = ++tokenCounter;
    activeOperations.set(token, { title, message, summary: options?.summary });

    function update(phase = {}) {
      const current = activeOperations.get(token);
      if (!current) return;
      activeOperations.set(token, {
        title: phase.title ?? current.title,
        message: phase.message ?? current.message,
        summary: phase.summary ?? current.summary,
      });
      if (latestOperation() === activeOperations.get(token) && dialog.open) {
        renderOperation(activeOperations.get(token));
      }
    }

    scheduleOperationDialog();

    try {
      return await operation(update);
    } finally {
      activeOperations.delete(token);
      reconcileDialog();
    }
  }

  function setBootState(status, message) {
    clearOpenTimer();
    bootStatus = status || 'loading';
    bootMessage = message || '';
    reconcileDialog();
  }

  ctx.__loadingSetBootState = setBootState;
  Object.assign(ctx, { withAppLoading, setBootState });

  setBootState('loading');
}
