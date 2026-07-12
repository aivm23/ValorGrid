function firstFocusable(dialog) {
  return dialog.querySelector(
    '[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
  );
}

export function attach(ctx) {
  for (const dialog of ctx.document.querySelectorAll('dialog.modal')) {
    let returnFocus = null;
    const showModal = dialog.showModal.bind(dialog);
    dialog.showModal = () => {
      returnFocus = ctx.document.activeElement;
      showModal();
      ctx.window.requestAnimationFrame(() => {
        if (!dialog.contains(ctx.document.activeElement)) firstFocusable(dialog)?.focus();
      });
    };
    dialog.addEventListener('close', () => {
      if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
      returnFocus = null;
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dialog.close();
    });
  }
}
