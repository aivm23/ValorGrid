export function attach(ctx) {
  const { elements, window } = ctx;

  async function loadUpdateStatus(options = {}) {
    const el = elements;
    const load = async () => {
      const status = await ctx.api.admin.updateStatus();
      el.updateCurrentVersion.textContent = status.currentVersion || '—';
      el.updateLatestVersion.textContent = status.latestVersion || '—';
      el.updateLastCheck.textContent = status.checkedAt ? new Date(status.checkedAt).toLocaleString() : '—';

      if (status.error) {
        el.updateNotice.hidden = false;
        el.updateNotice.textContent = ctx.t('updates.error');
      } else if (status.updateAvailable) {
        el.updateNotice.hidden = false;
        el.updateNotice.textContent = ctx.t('updates.available');
      } else {
        el.updateNotice.hidden = true;
      }

      const dbStatus = await ctx.api.admin.health();
      el.updateDbStatus.textContent = dbStatus.status === 'ok' ? ctx.t('updates.dbOk') : ctx.t('updates.dbDegraded');

      if (status.runtimeMode === 'desktop') {
        el.updateDownload.hidden = !status.updateAvailable || !status.recommendedAsset;
        el.updateDockerCommands.hidden = true;
        el.updateDockerOutput.hidden = true;
      } else {
        el.updateDownload.hidden = true;
        el.updateDockerCommands.hidden = !status.updateAvailable;
        el.updateDockerOutput.hidden = !status.updateAvailable;
      }

      if (status.releaseUrl) {
        el.updateReleaseNotes.hidden = false;
        el.updateReleaseNotes.href = status.releaseUrl;
      } else {
        el.updateReleaseNotes.hidden = true;
      }

      ctx._lastUpdateStatus = status;
    };
    if (el.updateCheck) el.updateCheck.disabled = true;
    try {
      if (options.interactive === false) await load();
      else {
        await ctx.withAppLoading(
          { title: ctx.t('loading.update.check.title'), message: ctx.t('loading.update.check.message') },
          load,
        );
      }
    } catch (error) {
      el.updateNotice.hidden = false;
      el.updateNotice.textContent = ctx.normalizeErrorMessage(error);
    } finally {
      if (el.updateCheck) el.updateCheck.disabled = false;
    }
  }

  async function copyDockerCommands() {
    if (elements.updateDockerCommands) elements.updateDockerCommands.disabled = true;
    try {
      await ctx.withAppLoading(
        { title: ctx.t('loading.update.docker.title'), message: ctx.t('loading.update.docker.message') },
        async () => {
          const status = ctx._lastUpdateStatus;
          const version = status?.latestVersion || '';
          const result = await ctx.api.admin.dockerCommands(version);
          const commands = (result.commands || []).join('\n');
          await window.navigator.clipboard.writeText(commands);
          elements.updateDockerOutput.hidden = false;
          elements.updateDockerOutput.textContent = commands;
        },
      );
    } catch (error) {
      elements.updateDockerOutput.hidden = false;
      elements.updateDockerOutput.textContent = ctx.normalizeErrorMessage(error);
    } finally {
      if (elements.updateDockerCommands) elements.updateDockerCommands.disabled = false;
    }
  }

  function downloadUpdate() {
    const status = ctx._lastUpdateStatus;
    if (!status?.recommendedAsset?.downloadUrl) return;
    window.open(status.recommendedAsset.downloadUrl, '_blank', 'noopener');
    elements.updateNotice.hidden = false;
    elements.updateNotice.textContent = ctx.t('updates.downloadHint');
  }

  ctx.loadUpdateStatus = loadUpdateStatus;
  ctx.copyDockerCommands = copyDockerCommands;
  ctx.downloadUpdate = downloadUpdate;

  elements.updateCheck?.addEventListener('click', () => loadUpdateStatus());
  elements.updateDownload?.addEventListener('click', () => downloadUpdate());
  elements.updateDockerCommands?.addEventListener('click', () => copyDockerCommands());
}
