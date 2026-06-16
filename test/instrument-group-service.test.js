const test = require('node:test');
const {
  assert,
  db,
  jsonRequest,
  registerLifecycle,
} = require('./integration-helpers');

registerLifecycle(test);

test('GET /api/instrument-groups returns groups list', async () => {
  db.prepare('DELETE FROM instrument_groups WHERE id NOT IN (?)').run('general');
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups (id, name, color, active) VALUES (?, ?, ?, 1)`,
  ).run('test-group', 'Test Group', '#ff0000');

  const { body, response } = await jsonRequest('/api/instrument-groups');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.groups));
  const group = body.groups.find((g) => g.id === 'test-group');
  assert.ok(group);
  assert.equal(group.name, 'Test Group');
});

test('POST /api/instrument-groups rejects empty name', async () => {
  const { body, response } = await jsonRequest('/api/instrument-groups', {
    method: 'POST',
    body: JSON.stringify({ name: '' }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
  assert.match(body.error, /name/i);
});

test('POST /api/instrument-groups creates group successfully', async () => {
  db.prepare('DELETE FROM app_meta WHERE key = ?').run('brand_palette_enabled');

  const { body, response } = await jsonRequest('/api/instrument-groups', {
    method: 'POST',
    body: JSON.stringify({ name: 'My New Group', color: '#ff6600' }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 201);
  assert.ok(body.group);
  assert.equal(body.group.name, 'My New Group');

  const dbGroup = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get(body.group.id);
  assert.ok(dbGroup);
  assert.equal(dbGroup.name, 'My New Group');
  assert.equal(dbGroup.color, '#ff6600');
});

test('DELETE /api/instrument-groups/nonexistent returns missing status', async () => {
  const { body, response } = await jsonRequest('/api/instrument-groups/no-such-group', {
    method: 'DELETE',
  });
  assert.equal(response.status, 200);
  assert.equal(body.result.status, 'missing');
  assert.equal(body.result.id, 'no-such-group');
});

test('DELETE /api/instrument-groups returns blocked when group has active instruments', async () => {
  db.prepare('DELETE FROM instruments WHERE symbol = ?').run('BLOCKINSTR');
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups (id, name, color, active) VALUES (?, ?, ?, 1)`,
  ).run('blocked-group', 'Blocked Group', '#ff0000');
  db.prepare(
    `INSERT OR REPLACE INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?)`,
  ).run('BLOCKINSTR', 'BLOCKINSTR.X', 'Blocked Instr', 'stock', 'EUR', '#0d9488', 'blocked-group');

  const { body, response } = await jsonRequest('/api/instrument-groups/blocked-group', {
    method: 'DELETE',
  });
  assert.equal(response.status, 200);
  assert.equal(body.result.status, 'blocked');
  assert.equal(body.result.id, 'blocked-group');
  assert.ok(body.result.reason);

  const stillExists = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get('blocked-group');
  assert.ok(stillExists, 'Group should still exist after blocked delete');
});

test('DELETE /api/instrument-groups returns deleted when group has no active instruments', async () => {
  db.prepare('DELETE FROM instruments WHERE symbol = ?').run('CLEANINSTR');
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups (id, name, color, active) VALUES (?, ?, ?, 1)`,
  ).run('clean-group', 'Clean Group', '#00ff00');
  db.prepare(
    `INSERT OR REPLACE INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
  ).run('CLEANINSTR', 'CLEANINSTR.X', 'Clean Instr', 'stock', 'EUR', '#0d9488', 'clean-group');

  const { body, response } = await jsonRequest('/api/instrument-groups/clean-group', {
    method: 'DELETE',
  });
  assert.equal(response.status, 200);
  assert.equal(body.result.status, 'deleted');
  assert.equal(body.result.id, 'clean-group');

  const deleted = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get('clean-group');
  assert.equal(deleted, undefined, 'Group should be removed from database');
});

test('DELETE /api/instrument-groups bulk removes multiple groups', async () => {
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups (id, name, color, active) VALUES (?, ?, ?, 1)`,
  ).run('bulk-group-a', 'Bulk A', '#aa0000');
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups (id, name, color, active) VALUES (?, ?, ?, 1)`,
  ).run('bulk-group-b', 'Bulk B', '#00aa00');

  const { body, response } = await jsonRequest('/api/instrument-groups', {
    method: 'DELETE',
    body: JSON.stringify({ ids: ['bulk-group-a', 'bulk-group-b'] }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.results));
  assert.equal(body.results.length, 2);
  assert.equal(body.results[0].status, 'deleted');
  assert.equal(body.results[1].status, 'deleted');

  const aExists = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get('bulk-group-a');
  const bExists = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get('bulk-group-b');
  assert.equal(aExists, undefined);
  assert.equal(bExists, undefined);
});

test('areInstrumentGroupsEnabled defaults true when no app_meta value', async () => {
  db.prepare('DELETE FROM app_meta WHERE key = ?').run('instr_groups_enabled');
  const { body } = await jsonRequest('/api/portfolio/summary');
  assert.equal(body.groupsEnabled, true);
});

test('PUT /api/instrument-groups/settings disables groups correctly', async () => {
  db.prepare(
    `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('instr_groups_enabled', '1')`,
  ).run();

  const { body, response } = await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: false }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 200);
  assert.equal(body.groupsEnabled, false);
  assert.equal(body.createdDefaultGroup, false);

  const metaValue = db.prepare("SELECT value FROM app_meta WHERE key = 'instr_groups_enabled'").get();
  assert.equal(metaValue.value, '0');
});

test('PUT /api/instrument-groups/settings enables groups and creates grupo-cero', async () => {
  db.prepare('DELETE FROM app_meta WHERE key = ?').run('instr_groups_enabled');
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('instr_groups_enabled', '0')");
  db.prepare('DELETE FROM instrument_groups WHERE id = ?').run('grupo-cero');

  const { body, response } = await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 200);
  assert.equal(body.groupsEnabled, true);

  const grupoCero = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get('grupo-cero');
  assert.ok(grupoCero);
  assert.equal(grupoCero.name, 'grupo cero');
});

test('PUT /api/instrument-groups/settings validates enabled is boolean', async () => {
  const { body, response } = await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: 'true' }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('POST /api/instrument-groups rejects duplicate group name', async () => {
  db.prepare("DELETE FROM instrument_groups WHERE id IN ('dup-group')");
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups (id, name, color, active) VALUES (?, ?, ?, 1)`,
  ).run('dup-group', 'Dup Group', '#ff0000');

  const { body, response } = await jsonRequest('/api/instrument-groups', {
    method: 'POST',
    body: JSON.stringify({ name: 'Dup Group' }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('POST /api/instrument-groups rejects missing name', async () => {
  const { body, response } = await jsonRequest('/api/instrument-groups', {
    method: 'POST',
    body: JSON.stringify({ color: '#ff0000' }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
});