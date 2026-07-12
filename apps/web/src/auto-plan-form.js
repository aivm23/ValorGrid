export function createAutoPlanForm(ctx, { visibleInstruments }) {
  function renderAutoPlans() {
    const instruments = visibleInstruments();
    if (!instruments.length) {
      ctx.elements.autoPlanList.innerHTML = `
        <div class="empty-config-state">
          ${ctx.escapeHtml(ctx.t('Sin instrumentos todavía. Crea tu primer instrumento para configurar aportaciones recurrentes.'))}
          <button class="button button-compact btn-save" type="button" data-open-onboarding>${ctx.escapeHtml(ctx.t('Crear instrumento'))}</button>
        </div>`;
      return;
    }

    const rows = (ctx.state.autoPlanDrafts || [])
      .map((plan, index) => renderAutoPlanRow(plan, index, instruments))
      .join('');
    ctx.elements.autoPlanList.innerHTML = `
      <div class="auto-plan-toolbar">
        <button class="button btn-save" type="button" data-add-auto-plan>${ctx.escapeHtml(ctx.t('Añadir plan'))}</button>
      </div>
      ${rows || `<p class="subtle">${ctx.escapeHtml(ctx.t('Sin planes de aportación. Añade un plan cuando lo necesites.'))}</p>`}
    `;
  }

  function renderAutoPlanRow(plan, index, instruments) {
    const options = instruments
      .map(
        (instrument) =>
          `<option value="${ctx.escapeHtml(instrument.symbol)}" ${instrument.symbol === plan.symbol ? 'selected' : ''}>${ctx.escapeHtml(instrument.symbol)} - ${ctx.escapeHtml(instrument.name)}</option>`,
      )
      .join('');
    const frequency = plan.frequency || '';
    const isMonthly = frequency === 'monthly';
    const isWeekly = frequency === 'weekly' || frequency === 'biweekly';
    return `
      <div class="auto-plan-row" data-auto-plan-row="${index}">
        <label class="check-field"><input type="checkbox" data-auto-field="enabled" ${plan.enabled ? 'checked' : ''} /><span>${ctx.escapeHtml(ctx.t('Activo'))}</span></label>
        <label class="field"><span>${ctx.escapeHtml(ctx.t('Instrumento'))}</span><select data-auto-field="symbol"><option value="">${ctx.escapeHtml(ctx.t('Selecciona instrumento'))}</option>${options}</select></label>
        <label class="field"><span>${ctx.escapeHtml(ctx.t('Euros'))}</span><input data-auto-field="amountEur" type="number" min="0.01" step="0.01" placeholder="${ctx.escapeHtml(ctx.t('Importe'))}" value="${ctx.escapeHtml(plan.amountEur ?? '')}" /></label>
        <label class="field"><span>${ctx.escapeHtml(ctx.t('Frecuencia'))}</span><select data-auto-field="frequency">
          <option value="">${ctx.escapeHtml(ctx.t('Frecuencia'))}</option>
          <option value="daily" ${frequency === 'daily' ? 'selected' : ''}>${ctx.escapeHtml(ctx.t('Diaria'))}</option>
          <option value="weekly" ${frequency === 'weekly' ? 'selected' : ''}>${ctx.escapeHtml(ctx.t('Semanal'))}</option>
          <option value="biweekly" ${frequency === 'biweekly' ? 'selected' : ''}>${ctx.escapeHtml(ctx.t('Bisemanal'))}</option>
          <option value="monthly" ${frequency === 'monthly' ? 'selected' : ''}>${ctx.escapeHtml(ctx.t('Mensual'))}</option>
        </select></label>
        <label class="field" ${isMonthly ? '' : 'hidden'}><span>${ctx.escapeHtml(ctx.t('Día mes'))}</span><input data-auto-field="day" type="number" min="1" max="28" step="1" placeholder="1-28" value="${ctx.escapeHtml(plan.day ?? '')}" /></label>
        <label class="field" ${isWeekly ? '' : 'hidden'}><span>${ctx.escapeHtml(ctx.t('Día semana'))}</span><select data-auto-field="weekday">
          <option value="">${ctx.escapeHtml(ctx.t('Día'))}</option>
          ${ctx.weekdayOptions(plan.weekday)}
        </select></label>
        <label class="field"><span>${ctx.escapeHtml(ctx.t('Inicio'))}</span><input data-auto-field="startDate" type="date" lang="${ctx.escapeHtml(ctx.dateInputLang?.() || 'es')}" value="${ctx.escapeHtml(plan.startDate || '')}" /></label>
        <button class="button button-compact btn-cancel" type="button" data-remove-auto-plan="${index}">${ctx.escapeHtml(ctx.t('Quitar'))}</button>
      </div>`;
  }

  function openAutoDialog() {
    ctx.state.autoPlanDrafts = (ctx.state.autoPlans || []).map((plan) => ({ ...plan }));
    ctx.state.autoPlanRetroactiveConfirmed = false;
    renderAutoPlans();
    ctx.elements.autoFeedback.textContent = ctx.t(
      'Si el día elegido no tiene mercado, se usará el siguiente cierre disponible.',
    );
    ctx.elements.autoFeedback.dataset.state = '';
    ctx.elements.autoDialog.showModal();
  }

  function closeAutoDialog() {
    ctx.state.autoPlanDrafts = [];
    ctx.elements.autoDialog.close();
  }

  function addAutoPlanDraft() {
    const instruments = visibleInstruments();
    if (!instruments.length) {
      ctx.openWizardDialog();
      return;
    }
    ctx.state.autoPlanDrafts = [
      ...(ctx.state.autoPlanDrafts || []),
      { symbol: '', amountEur: '', frequency: '', day: '', weekday: '', enabled: true, startDate: '' },
    ];
    ctx.state.autoPlanRetroactiveConfirmed = false;
    renderAutoPlans();
  }

  function removeAutoPlanDraft(index) {
    ctx.state.autoPlanDrafts = (ctx.state.autoPlanDrafts || []).filter((_, itemIndex) => itemIndex !== index);
    ctx.state.autoPlanRetroactiveConfirmed = false;
    renderAutoPlans();
  }

  function updateAutoPlanDraftFromField(field) {
    const row = field.closest('[data-auto-plan-row]');
    if (!row) return;
    const index = Number(row.dataset.autoPlanRow);
    const draft = { ...(ctx.state.autoPlanDrafts[index] || {}) };
    const key = field.dataset.autoField;
    draft[key] = field.type === 'checkbox' ? field.checked : field.value;
    ctx.state.autoPlanDrafts[index] = draft;
    ctx.state.autoPlanRetroactiveConfirmed = false;
    if (key === 'frequency') renderAutoPlans();
  }

  function collectAutoPlansFromForm() {
    return Array.from(ctx.elements.autoPlanList.querySelectorAll('[data-auto-plan-row]')).map((row) => {
      const frequency = row.querySelector('[data-auto-field="frequency"]')?.value || '';
      return {
        symbol: row.querySelector('[data-auto-field="symbol"]').value.trim().toUpperCase(),
        amountEur: Number(row.querySelector('[data-auto-field="amountEur"]').value),
        frequency,
        day: frequency === 'monthly' ? Number(row.querySelector('[data-auto-field="day"]')?.value) : undefined,
        weekday: ['weekly', 'biweekly'].includes(frequency)
          ? Number(row.querySelector('[data-auto-field="weekday"]')?.value)
          : undefined,
        startDate: row.querySelector('[data-auto-field="startDate"]').value,
        enabled: row.querySelector('[data-auto-field="enabled"]').checked,
      };
    });
  }

  async function saveAutoPlansFromForm() {
    const autoPlans = collectAutoPlansFromForm();
    try {
      const previewData = await ctx.sendJson('/api/auto-plans/preview', 'POST', { autoPlans });
      const warnings = previewData.preview.warnings || [];
      if ((warnings.length || previewData.preview.pendingCount > 1) && !ctx.state.autoPlanRetroactiveConfirmed) {
        ctx.state.autoPlanRetroactiveConfirmed = true;
        const parts = [];
        if (warnings.length) parts.push(warnings.map((warning) => warning.message).join(' '));
        if (previewData.preview.pendingCount > 1) {
          const estimated = Number(previewData.preview.estimatedTotalEur || 0);
          const totalCopy =
            estimated > 0 ? ctx.t(' por {amount} en total', { amount: ctx.formatCurrency(estimated) }) : '';
          parts.push(
            ctx.t('{count} aportaciones pendientes{total}. Pulsa Guardar de nuevo para confirmar.', {
              count: previewData.preview.pendingCount,
              total: totalCopy,
            }),
          );
        }
        ctx.elements.autoFeedback.textContent = parts.join(' ');
        ctx.elements.autoFeedback.dataset.state = 'error';
        return;
      }
      const data = await ctx.sendJson('/api/auto-plans', 'PUT', { autoPlans });
      ctx.state.autoPlans = data.autoPlans;
      ctx.state.autoPlanDrafts = data.autoPlans.map((plan) => ({ ...plan }));
      ctx.state.autoPlanRetroactiveConfirmed = false;
      ctx.state.historyCache = {};
      let feedbackMsg = data.warnings?.length
        ? data.warnings.map((warning) => warning.message).join(' ')
        : ctx.t('Planes de aportación guardados.');
      if (data.backup) {
        feedbackMsg += ` ${ctx.t('Backup automático creado: {file}', { file: data.backup.file })}`;
      }
      ctx.elements.autoFeedback.textContent = feedbackMsg;
      ctx.elements.autoFeedback.dataset.state = 'ok';
      await ctx.refreshDashboard();
      await ctx.refreshHistory({ force: true });
      window.setTimeout(closeAutoDialog, 700);
    } catch (error) {
      ctx.elements.autoFeedback.textContent = ctx.normalizeErrorMessage(error);
      ctx.elements.autoFeedback.dataset.state = 'error';
    }
  }

  return {
    renderAutoPlans,
    renderAutoPlanRow,
    openAutoDialog,
    closeAutoDialog,
    addAutoPlanDraft,
    removeAutoPlanDraft,
    updateAutoPlanDraftFromField,
    saveAutoPlansFromForm,
  };
}
