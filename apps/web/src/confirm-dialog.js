export function attach(ctx) {
  let pendingResolve = null;

  function complete(result) {
    const dialog = ctx.elements.confirmActionDialog;
    const resolve = pendingResolve;
    pendingResolve = null;
    if (dialog?.open) dialog.close();
    if (resolve) resolve(Boolean(result));
  }

  function setConfirmTone(tone) {
    const button = ctx.elements.confirmActionConfirm;
    if (!button) return;
    button.className = `button ${tone === 'danger' ? 'btn-danger' : 'btn-save'}`;
  }

  async function confirmAction(options = {}) {
    const dialog = ctx.elements.confirmActionDialog;
    if (!dialog) return false;
    if (pendingResolve) complete(false);

    const config = typeof options === 'string' ? { message: options } : options;
    if (ctx.elements.confirmActionTitle) {
      ctx.elements.confirmActionTitle.textContent = config.title || ctx.t('confirmDialog.title');
    }
    if (ctx.elements.confirmActionMessage) {
      ctx.elements.confirmActionMessage.textContent = config.message || '';
    }
    if (ctx.elements.confirmActionCancel) {
      ctx.elements.confirmActionCancel.textContent = config.cancelLabel || ctx.t('confirmDialog.cancel');
    }
    if (ctx.elements.confirmActionConfirm) {
      ctx.elements.confirmActionConfirm.textContent = config.confirmLabel || ctx.t('confirmDialog.confirm');
    }
    setConfirmTone(config.tone || 'danger');
    dialog.showModal();
    ctx.elements.confirmActionCancel?.focus();

    return new Promise((resolve) => {
      pendingResolve = resolve;
    });
  }

  ctx.elements.confirmActionClose?.addEventListener('click', () => complete(false));
  ctx.elements.confirmActionCancel?.addEventListener('click', () => complete(false));
  ctx.elements.confirmActionConfirm?.addEventListener('click', () => complete(true));
  ctx.elements.confirmActionDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    complete(false);
  });
  ctx.elements.confirmActionDialog?.addEventListener('click', (event) => {
    if (event.target === ctx.elements.confirmActionDialog) complete(false);
  });

  Object.assign(ctx, { confirmAction });
}
