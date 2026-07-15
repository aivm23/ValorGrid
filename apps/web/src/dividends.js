export function attach(ctx) {
  async function refreshDividendSummary() {
    const { state } = ctx;
    try {
      state.dividendSummary = await ctx.api.dividends.summary({ timeoutMs: 10000 });
      renderDividendToolbarAlert();
    } catch {
      state.dividendSummary = null;
      renderDividendToolbarAlert();
    }
  }

  function renderDividendToolbarAlert() {
    const { elements, state } = ctx;
    const count = Number(state.dividendSummary?.pendingDraftCount || 0);
    if (!elements.dividendAlert) return;
    elements.dividendAlert.hidden = count <= 0;
    elements.dividendAlert.classList.toggle('is-scanning', Boolean(state.dividendScanInProgress));
    if (elements.dividendAlertCount) {
      elements.dividendAlertCount.textContent = count > 99 ? '99+' : String(count);
    }
  }

  async function startDividendStartupScan() {
    const { state } = ctx;
    if (state.dividendScanInProgress) return;
    if (state.dividendStartupScanRequested) return;
    state.dividendStartupScanRequested = true;
    state.dividendScanInProgress = true;
    renderDividendToolbarAlert();
    try {
      await ctx.api.dividends.scan('startup', { timeoutMs: 120000 });
    } catch {
      // Dividend scans are advisory. Startup must not be blocked by Yahoo/FX failures.
    } finally {
      state.dividendScanInProgress = false;
      await refreshDividendSummary();
      if (state.dividendDraftDialogOpen) await refreshDividendDrafts();
    }
  }

  async function refreshDividendDrafts() {
    const { state } = ctx;
    const data = await ctx.api.dividends.drafts({ timeoutMs: 10000 });
    state.dividendDrafts = data.drafts || [];
    renderDividendDraftDialog();
  }

  async function openDividendDraftDialog() {
    const { elements, state } = ctx;
    state.dividendDraftDialogOpen = true;
    await ctx.withAppLoading(
      { title: ctx.t('loading.dividends.open.title'), message: ctx.t('loading.dividends.open.message') },
      async () => {
        await refreshDividendDrafts();
      },
    );
    elements.dividendDraftDialog?.showModal();
  }

  function closeDividendDraftDialog() {
    ctx.state.dividendDraftDialogOpen = false;
    ctx.elements.dividendDraftDialog?.close();
  }

  function draftById(id) {
    return (ctx.state.dividendDrafts || []).find((draft) => String(draft.id) === String(id));
  }

  function renderDividendDraftDialog() {
    const { elements, state } = ctx;
    const drafts = state.dividendDrafts || [];
    const total = drafts.reduce((sum, draft) => sum + Number(draft.effectiveTotalEur || 0), 0);
    const latestScan = state.dividendSummary?.latestScan;
    if (elements.dividendDraftSummary) {
      elements.dividendDraftSummary.innerHTML = `
        <article><span>${ctx.t('dividends.pending')}</span><strong>${drafts.length}</strong></article>
        <article><span>${ctx.t('dividends.estimatedTotal')}</span><strong>${ctx.formatCurrency(total)}</strong></article>
        <article><span>${ctx.t('dividends.latestScan')}</span><strong>${latestScan?.completedAt ? ctx.formatDate(String(latestScan.completedAt).slice(0, 10)) : ctx.t('Pendiente')}</strong></article>
      `;
    }
    if (!elements.dividendDraftRows) return;
    if (!drafts.length) {
      elements.dividendDraftRows.innerHTML = `<div class="empty-action-state"><span class="subtle">${ctx.t('dividends.empty')}</span></div>`;
      return;
    }
    elements.dividendDraftRows.innerHTML = drafts.map(renderDraftCard).join('');
  }

  function renderDraftCard(draft) {
    const mismatch = Math.abs(
      Number(draft.effectiveAmountPerShare || 0) * Number(draft.effectiveShares || 0) * Number(draft.fxToEur || 1) -
        Number(draft.effectiveTotalEur || 0),
    );
    const mismatchWarning =
      mismatch > Math.max(0.05, Number(draft.effectiveTotalEur || 0) * 0.02)
        ? `<p class="dividend-warning">${ctx.t('dividends.mismatchWarning')}</p>`
        : '';
    const splitWarning = draft.hasSplitNotice
      ? `<p class="dividend-warning">${ctx.escapeHtml(draft.splitNotice || ctx.t('dividends.splitWarning'))}</p>`
      : '';
    return `
      <article class="dividend-draft-card" data-dividend-draft="${ctx.escapeHtml(draft.id)}">
        <div class="dividend-draft-head">
          <div>
            <strong>${ctx.escapeHtml(draft.symbol)}</strong>
            <span>${ctx.escapeHtml(draft.name || draft.yahooSymbol || draft.symbol)}</span>
          </div>
          <span class="type-badge type-dividend">${ctx.t('dividends.badge')}</span>
        </div>
        <div class="dividend-draft-meta">
          <span>${ctx.t('dividends.exDate', { date: ctx.formatDate(draft.exDate) })}</span>
          <span>${ctx.t('dividends.currency', { currency: ctx.escapeHtml(draft.currency || 'EUR') })}</span>
          <span>${ctx.t('dividends.fxEur', { value: Number(draft.fxToEur || 1).toFixed(6) })}</span>
        </div>
        ${splitWarning}
        <div class="dividend-draft-grid">
          <label class="field">
            <span>${ctx.t('dividends.amountPerShare')}</span>
            <input data-dividend-field="amountPerShare" type="number" min="0" step="0.000001" value="${Number(draft.effectiveAmountPerShare || 0)}" />
            <small>${ctx.t('dividends.detected', { value: `${Number(draft.detectedAmountPerShare || 0).toFixed(6)} ${ctx.escapeHtml(draft.currency || '')}` })}</small>
          </label>
          <label class="field">
            <span>${ctx.t('dividends.eligibleShares')}</span>
            <input data-dividend-field="shares" type="number" min="0" step="0.000001" value="${Number(draft.effectiveShares || 0)}" />
            <small>${ctx.t('dividends.detectedPlural', { value: ctx.formatShareNumber(Number(draft.detectedShares || 0)) })}</small>
          </label>
          <label class="field">
            <span>${ctx.t('dividends.totalEur')}</span>
            <input data-dividend-field="totalEur" type="number" min="0" step="0.01" value="${Number(draft.effectiveTotalEur || 0).toFixed(2)}" />
            <small>${ctx.t('dividends.detected', { value: ctx.formatCurrency(Number(draft.detectedTotalEur || 0)) })}</small>
          </label>
        </div>
        ${mismatchWarning}
        <label class="check-field dividend-auto-field">
          <input data-dividend-auto-next type="checkbox" ${draft.autoInclude ? 'checked' : ''} />
          <span>${ctx.t('dividends.autoNext')}</span>
        </label>
        <div class="modal-actions dividend-actions">
          <button class="button btn-cancel" type="button" data-dividend-ignore>${ctx.t('dividends.ignore')}</button>
          <button class="button btn-save" type="button" data-dividend-confirm>${ctx.t('dividends.confirm')}</button>
          <button class="button btn-accent dividend-save-btn" type="button" data-dividend-save hidden>&#x2713;</button>
        </div>
      </article>
    `;
  }

  function readDraftForm(card) {
    return {
      amountPerShare: Number(card.querySelector('[data-dividend-field="amountPerShare"]')?.value),
      shares: Number(card.querySelector('[data-dividend-field="shares"]')?.value),
      totalEur: Number(card.querySelector('[data-dividend-field="totalEur"]')?.value),
    };
  }

  async function saveDividendDraft(id, card) {
    await ctx.withAppLoading(
      { title: ctx.t('loading.dividends.save.title'), message: ctx.t('loading.dividends.save.message') },
      async () => {
        await ctx.api.dividends.updateDraft(id, readDraftForm(card));
        card.querySelector('[data-dividend-save]')?.setAttribute('hidden', '');
        await refreshDividendDrafts();
        await refreshDividendSummary();
      },
    );
  }

  async function confirmDividendDraft(id, card) {
    const autoIncludeNext = Boolean(card.querySelector('[data-dividend-auto-next]')?.checked);
    await ctx.withAppLoading(
      { title: ctx.t('loading.dividends.confirm.title'), message: ctx.t('loading.dividends.confirm.message') },
      async () => {
        await ctx.api.dividends.updateDraft(id, readDraftForm(card));
        card.querySelector('[data-dividend-save]')?.setAttribute('hidden', '');
        await ctx.api.dividends.confirmDraft(id, autoIncludeNext);
        await refreshDividendSummary();
        await refreshDividendDrafts();
        await ctx.refreshDashboard();
        await ctx.refreshHistory({ force: true });
      },
    );
  }

  async function ignoreDividendDraft(id) {
    await ctx.withAppLoading(
      { title: ctx.t('loading.dividends.dismiss.title'), message: ctx.t('loading.dividends.dismiss.message') },
      async () => {
        await ctx.api.dividends.ignoreDraft(id);
        await refreshDividendSummary();
        await refreshDividendDrafts();
      },
    );
  }

  async function handleDividendDraftClick(event) {
    const card = event.target.closest('[data-dividend-draft]');
    if (!card) return;
    const actionButton = event.target.closest('[data-dividend-save], [data-dividend-confirm], [data-dividend-ignore]');
    if (!actionButton || actionButton.disabled) return;
    const id = card.dataset.dividendDraft;
    const draft = draftById(id);
    if (!draft) return;
    actionButton.disabled = true;
    try {
      if (actionButton.matches('[data-dividend-save]')) await saveDividendDraft(id, card);
      if (actionButton.matches('[data-dividend-confirm]')) await confirmDividendDraft(id, card);
      if (actionButton.matches('[data-dividend-ignore]')) await ignoreDividendDraft(id);
    } finally {
      if (actionButton.isConnected) actionButton.disabled = false;
    }
  }

  async function handleDividendAutoChange(event) {
    const checkbox = event.target.closest('[data-dividend-auto-next]');
    if (!checkbox) return;
    const card = event.target.closest('[data-dividend-draft]');
    const draft = card ? draftById(card.dataset.dividendDraft) : null;
    if (!draft) return;
    const nextValue = checkbox.checked;
    checkbox.disabled = true;
    try {
      await ctx.withAppLoading(
        {
          title: ctx.t('loading.dividends.preference.title'),
          message: ctx.t('loading.dividends.preference.message'),
        },
        async () => {
          await ctx.api.dividends.updateSettings(draft.symbol, { autoInclude: nextValue });
          await refreshDividendDrafts();
          await refreshDividendSummary();
        },
      );
    } catch (error) {
      checkbox.checked = !nextValue;
      throw error;
    } finally {
      if (checkbox.isConnected) checkbox.disabled = false;
    }
  }

  ctx.elements.dividendAlert?.addEventListener('click', openDividendDraftDialog);
  ctx.elements.dividendDraftClose?.addEventListener('click', closeDividendDraftDialog);
  ctx.elements.dividendDraftRows?.addEventListener('click', (event) => {
    handleDividendDraftClick(event).catch((error) => {
      ctx.elements.dividendDraftSummary.innerHTML = `<p class="form-feedback is-error">${ctx.escapeHtml(ctx.normalizeErrorMessage(error))}</p>`;
    });
  });
  ctx.elements.dividendDraftRows?.addEventListener('change', (event) => {
    handleDividendAutoChange(event).catch(() => {
      // Keep modal usable; the next summary refresh will resync state.
    });
  });
  ctx.elements.dividendDraftRows?.addEventListener('input', (event) => {
    if (!event.target.closest('[data-dividend-field]')) return;
    const card = event.target.closest('[data-dividend-draft]');
    if (!card) return;
    card.querySelector('[data-dividend-save]')?.removeAttribute('hidden');
  });

  Object.assign(ctx, {
    refreshDividendSummary,
    startDividendStartupScan,
    openDividendDraftDialog,
    closeDividendDraftDialog,
    refreshDividendDrafts,
    renderDividendToolbarAlert,
  });
}
