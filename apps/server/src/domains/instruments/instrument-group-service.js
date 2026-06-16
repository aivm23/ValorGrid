const { brandPaletteColor } = require('../../shared/brand-palette');

function attachInstrumentGroupService(ctx, brandPalette) {
  const { repositories, ensureGroup, invalidateLedger, getToday, stockColors, groupIdFromName } = ctx;
  const instrumentRepository = repositories.instruments;

  const {
    findGroupById,
    listActiveInstrumentGroups,
    countActiveInstrumentsByGroup,
    clearGroupForInstruments,
    deleteGroupById,
    assignUngroupedActiveInstrumentsToGroup,
  } = instrumentRepository;

  function areInstrumentGroupsEnabled() {
    const value = repositories.meta?.getMetaValueByKey?.('instr_groups_enabled');
    return value === null || value === undefined || value !== '0';
  }

  function setInstrumentGroupsEnabled(enabled) {
    const meta = repositories.meta;
    if (!meta?.setMetaValueByKey) throw new Error('Meta repository not available');
    meta.setMetaValueByKey('instr_groups_enabled', enabled ? '1' : '0');
    let createdDefaultGroup = false, assignedInstrumentCount = 0, defaultGroup = null;
    if (enabled) {
      const result = ensureGrupoZeroForUngroupedInstruments();
      createdDefaultGroup = result.created;
      assignedInstrumentCount = result.assignedCount;
      defaultGroup = result.group;
    }
    return { groupsEnabled: enabled, createdDefaultGroup, assignedInstrumentCount, defaultGroup };
  }

  function ensureGrupoZeroForUngroupedInstruments() {
    const id = 'grupo-cero';
    let created = !findGroupById(id);
    if (created) ensureGroup(id, 'grupo cero', '#64748b', { displayOrder: 99 });
    const assignedCount = assignUngroupedActiveInstrumentsToGroup(id);
    const g = findGroupById(id);
    return { created, assignedCount, group: g ? { id: g.id, name: g.name, color: g.color } : null };
  }

  function createInstrumentGroup(input = {}) {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Group name is required');
    const id = String(input.id || groupIdFromName(name)).trim();
    if (findGroupById(id)) throw new Error('Group already exists');
    const paletteEnabled = brandPalette.isBrandPaletteEnabled();
    let color;
    if (paletteEnabled) {
      color = brandPaletteColor(listActiveInstrumentGroups().length);
    } else {
      color = String(input.color || stockColors[listActiveInstrumentGroups().length % stockColors.length]).trim();
    }
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Color must be a hex value');
    ensureGroup(id, name, color, {
      displayOrder: Number(input.displayOrder ?? listActiveInstrumentGroups().length + 1),
      showInDistribution: input.showInDistribution !== false,
      showInMonthly: input.showInMonthly !== false,
      isExpandable: Boolean(input.isExpandable),
    });
    invalidateLedger(getToday(), 'group-create');

    if (paletteEnabled) {
      brandPalette.applyBrandPaletteToGroups();
    }

    return listActiveInstrumentGroups().find((item) => item.id === id);
  }

  function updateInstrumentGroup(id, input = {}) {
    const existing = findGroupById(String(id));
    if (!existing) throw new Error('Instrument group not found');

    const paletteEnabled = brandPalette.isBrandPaletteEnabled();

    const next = {
      name: String(input.name ?? existing.name).trim(),
      color: paletteEnabled ? existing.color : String(input.color ?? existing.color).trim(),
      displayOrder: Number(input.displayOrder ?? input.display_order ?? existing.display_order),
      showInDistribution:
        input.showInDistribution === undefined ? Number(existing.show_in_distribution) : input.showInDistribution ? 1 : 0,
      showInMonthly: input.showInMonthly === undefined ? Number(existing.show_in_monthly) : input.showInMonthly ? 1 : 0,
      isExpandable: input.isExpandable === undefined ? Number(existing.is_expandable) : input.isExpandable ? 1 : 0,
      active: input.active === undefined ? Number(existing.active) : input.active ? 1 : 0,
    };
    if (!next.name) throw new Error('Group name is required');
    if (!/^#[0-9a-f]{6}$/i.test(next.color)) throw new Error('Color must be a hex value');
    const { updateGroupById } = instrumentRepository;
    updateGroupById(existing.id, next);
    invalidateLedger(getToday(), 'group-update');
    return listActiveInstrumentGroups().find((item) => item.id === existing.id);
  }

  function deleteInstrumentGroup(id) {
    const groupId = String(id || '').trim();
    const existing = findGroupById(groupId);
    if (!existing) return { id: groupId, status: 'missing' };
    const activeInstruments = countActiveInstrumentsByGroup(groupId);
    if (activeInstruments > 0) {
      return {
        id: groupId,
        status: 'blocked',
        reason: 'El grupo contiene instrumentos activos. Mueve o elimina esos instrumentos antes de borrar el grupo.',
      };
    }
    clearGroupForInstruments(groupId);
    deleteGroupById(groupId);
    invalidateLedger(getToday(), 'group-delete');
    return { id: groupId, status: 'deleted' };
  }

  function deleteInstrumentGroups(ids = []) {
    const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
    return unique.map((id) => deleteInstrumentGroup(id));
  }

  return {
    areInstrumentGroupsEnabled,
    setInstrumentGroupsEnabled,
    ensureGrupoZeroForUngroupedInstruments,
    createInstrumentGroup,
    updateInstrumentGroup,
    deleteInstrumentGroup,
    deleteInstrumentGroups,
  };
}

module.exports = { attachInstrumentGroupService };