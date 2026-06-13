export function updateImportFileDisplay(ctx, fileName) {
  const dropEl = ctx.elements.importFileZone?.querySelector('.import-file-drop');
  const selectedEl = ctx.elements.importFileZone?.querySelector('.import-file-selected');
  const nameEl = selectedEl?.querySelector('span');
  if (fileName) {
    if (dropEl) dropEl.hidden = true;
    if (selectedEl) selectedEl.hidden = false;
    if (nameEl) nameEl.textContent = fileName;
  } else {
    if (dropEl) dropEl.hidden = false;
    if (selectedEl) selectedEl.hidden = true;
  }
}

export function clearImportFile(ctx) {
  ctx.elements.importFile.value = '';
  ctx.state.importFileMeta = null;
  updateImportFileDisplay(ctx, null);
}
