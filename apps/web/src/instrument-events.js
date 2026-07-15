import { buildInstrumentPayload, resetInstrumentForm } from './instrument-create-market-data.js';

export function toggleExpandableGroup(ctx, event) {
  const trigger = event.target.closest('[data-action="toggle-stock-detail"]');
  if (!trigger) return;
  const groupId = trigger.dataset.groupId;
  if (!groupId) return;
  ctx.state.expandedGroupId = ctx.state.expandedGroupId === groupId ? null : groupId;
  ctx.renderSummary();
}

export async function handleInstrumentGroupsToggle(ctx) {
  const enabled = ctx.elements.instrumentGroupsEnabled.checked;
  ctx.elements.instrumentGroupsEnabled.disabled = true;
  try {
    await ctx.withAppLoading(
      { title: ctx.t('loading.groups.toggle.title'), message: ctx.t('loading.groups.toggle.message') },
      async () => {
        const result = await ctx.api.instruments.groups.setEnabled(enabled);
        ctx.state.groupsEnabled = result.groupsEnabled !== false;
        ctx.state.historyCache = {};
        if (result.createdDefaultGroup && result.assignedInstrumentCount > 0) {
          const msg = `Se ha creado grupo cero y se han asignado ${result.assignedInstrumentCount} instrumento${result.assignedInstrumentCount === 1 ? '' : 's'} sin grupo.`;
          ctx.elements.priceStatus.textContent = msg;
        } else if (!enabled) {
          ctx.elements.priceStatus.textContent =
            'Grupos desactivados. Los instrumentos se mostrarán directamente en el dashboard.';
        }
        await Promise.all([ctx.refreshDashboard(), ctx.refreshHistory({ force: true })]);
      },
    );
  } catch (error) {
    ctx.elements.instrumentGroupsEnabled.checked = !enabled;
    const el = ctx.elements.priceStatus;
    if (el) el.textContent = ctx.normalizeErrorMessage(error);
  } finally {
    ctx.elements.instrumentGroupsEnabled.disabled = false;
  }
}

export async function saveInstrument(ctx, event) {
  const button = event.target.closest('[data-save-instrument]');
  if (!button) return;
  const row = button.closest('[data-instrument]');
  const payload = {};
  row.querySelectorAll('[data-field]').forEach((input) => {
    if (input.dataset.field === 'color' && ctx.state.brandPaletteEnabled) return;
    payload[input.dataset.field] = input.value;
  });
  button.disabled = true;
  try {
    await ctx.withAppLoading(
      { title: ctx.t('loading.instrument.save.title'), message: ctx.t('loading.instrument.save.message') },
      async () => {
        await ctx.api.instruments.update(row.dataset.instrument, payload);
        ctx.state.historyCache = {};
        await ctx.refreshDashboard();
        await ctx.refreshHistory({ force: true });
      },
    );
  } catch (error) {
    ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
  } finally {
    button.disabled = false;
  }
}

export async function saveGroup(ctx, event) {
  const button = event.target.closest('[data-save-group]');
  if (!button) return;
  const row = button.closest('[data-group]');
  const payload = {};
  row.querySelectorAll('[data-group-field]').forEach((input) => {
    if (input.dataset.groupField === 'color' && ctx.state.brandPaletteEnabled) return;
    payload[input.dataset.groupField] = input.type === 'checkbox' ? input.checked : input.value;
  });
  button.disabled = true;
  try {
    await ctx.withAppLoading(
      { title: ctx.t('loading.groups.save.title'), message: ctx.t('loading.groups.save.message') },
      async () => {
        await ctx.api.instruments.groups.update(row.dataset.group, payload);
        ctx.state.historyCache = {};
        await ctx.refreshDashboard();
        await ctx.refreshHistory({ force: true });
      },
    );
  } catch (error) {
    ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
  } finally {
    button.disabled = false;
  }
}

export async function createGroup(ctx) {
  const button = ctx.elements.createGroup;
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await ctx.withAppLoading(
      { title: ctx.t('loading.groups.create.title'), message: ctx.t('loading.groups.create.message') },
      async () => {
        const payload = {
          name: ctx.elements.newGroupName.value,
          showInDistribution: true,
          showInMonthly: true,
          isExpandable: false,
        };
        if (!ctx.state.brandPaletteEnabled) payload.color = ctx.elements.newGroupColor.value;
        await ctx.api.instruments.groups.create(payload);
        ctx.elements.newGroupName.value = '';
        await ctx.refreshDashboard();
      },
    );
  } catch (error) {
    ctx.elements.backupList.textContent = ctx.normalizeErrorMessage(error);
  } finally {
    if (button) button.disabled = false;
  }
}

export async function createInstrument(ctx) {
  const elements = ctx.elements;
  const button = elements.createInstrument;
  if (button?.disabled) return;
  if (button) button.disabled = true;

  async function finalizeInstrumentCreation(payload) {
    resetInstrumentForm(elements);
    await ctx.refreshDashboard();
    const symbol = payload.symbol;
    if (ctx.state.returnToOperationDialogAfterInstrumentCreate) {
      ctx.state.returnToOperationDialogAfterInstrumentCreate = false;
      ctx.elements.instrumentDialog.close();
      ctx.openOperationDialog('add');
      ctx.populateAddTickerOptions(symbol);
      ctx.elements.addTicker.value = symbol;
      ctx.syncAmountInputs({ target: ctx.elements.addTicker });
    }
  }

  try {
    const payload = buildInstrumentPayload(elements);
    if (!payload.symbol) throw new Error('El símbolo es obligatorio');
    if (!ctx.state.brandPaletteEnabled) payload.color = elements.newInstrumentColor.value;
    if (payload.type === 'commodity' && payload.provider === 'alpha_vantage') {
      const created = await ctx.createCommodityWithAlphaVantageCheck(payload, async () => {
        await finalizeInstrumentCreation(payload);
      });
      if (!created) return;
    } else {
      await ctx.withAppLoading(
        { title: ctx.t('loading.instrument.create.title'), message: ctx.t('loading.instrument.create.message') },
        async () => {
          await ctx.api.instruments.create(payload);
        },
      );
    }
    await finalizeInstrumentCreation(payload);
  } catch (error) {
    const errEl = document.getElementById('instrument-create-error');
    if (errEl) {
      errEl.textContent = ctx.normalizeErrorMessage(error);
      errEl.hidden = false;
    }
  } finally {
    if (button) button.disabled = false;
  }
}
