export function attach(ctx) {
  function openAutoDialog() {
    ctx.state.autoPlanDrafts = (ctx.state.autoPlans || []).map((plan) => ({ ...plan }));
    ctx.state.autoPlanRetroactiveConfirmed = false;
    ctx.renderAutoPlans();
    ctx.elements.autoFeedback.textContent = ctx.t('Si el día elegido no tiene mercado, se usará el siguiente cierre disponible.');
    ctx.elements.autoFeedback.dataset.state = '';
    ctx.elements.autoDialog.showModal();
  }

  function closeAutoDialog() {
    ctx.state.autoPlanDrafts = [];
    ctx.elements.autoDialog.close();
  }

  function openAportacionesBuy() {
    ctx.closeAutoDialog();
    ctx.openOperationDialog('add');
  }

  function openAportacionesSell() {
    ctx.closeAutoDialog();
    ctx.openOperationDialog('remove');
  }

  Object.assign(ctx, {
    openAutoDialog,
    closeAutoDialog,
    openAportacionesBuy,
    openAportacionesSell,
  });
}
