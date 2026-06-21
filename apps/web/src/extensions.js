export function attach(ctx) {
  async function loadExtensions() {
    let manifest;
    try {
      manifest = await ctx.fetchJson('/api/extensions');
    } catch {
      return;
    }

    ctx.state.extensionManifest = manifest;

    for (const href of manifest.web?.styles || []) {
      if (ctx.document.querySelector(`link[data-valorgrid-extension][href="${href}"]`)) continue;
      const link = ctx.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.valorgridExtension = 'true';
      ctx.document.head.appendChild(link);
    }

    for (const moduleUrl of manifest.web?.modules || []) {
      const extensionModule = await import(moduleUrl);
      if (typeof extensionModule.attach === 'function') {
        extensionModule.attach(ctx);
      }
    }
  }

  Object.assign(ctx, { loadExtensions });
}
