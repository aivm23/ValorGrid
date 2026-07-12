export function attach(ctx) {
  const { elements, window } = ctx;

  async function loadUpdateStatus() {
    const el = elements;
    try {
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
    } catch (error) {
      el.updateNotice.hidden = false;
      el.updateNotice.textContent = ctx.normalizeErrorMessage(error);
    }
  }

  async function copyDockerCommands() {
    try {
      const status = ctx._lastUpdateStatus;
      const version = status?.latestVersion || '';
      const result = await ctx.api.admin.dockerCommands(version);
      const commands = (result.commands || []).join('\n');
      await window.navigator.clipboard.writeText(commands);
      elements.updateDockerOutput.hidden = false;
      elements.updateDockerOutput.textContent = commands;
    } catch (error) {
      elements.updateDockerOutput.hidden = false;
      elements.updateDockerOutput.textContent = ctx.normalizeErrorMessage(error);
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
