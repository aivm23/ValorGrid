const test = require('node:test');
const {
  assert,
  db,
  jsonRequest,
  seedTestInstrument,
  cachePrice,
  registerLifecycle,
  createTransaction,
} = require('./integration-helpers');

registerLifecycle(test);

function resetGroupsEnabled(value) {
  db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('instr_groups_enabled', ?)`).run(value);
}

test('groupsEnabled defaults to true when not set in app_meta', async () => {
  db.prepare('DELETE FROM app_meta WHERE key = ?').run('instr_groups_enabled');
  const { body } = await jsonRequest('/api/portfolio/summary');
  assert.equal(body.groupsEnabled, true);
});

test('disables groups via PUT /api/instrument-groups/settings', async () => {
  resetGroupsEnabled('1');
  const { body, response } = await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: false }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 200);
  assert.equal(body.groupsEnabled, false);
});

test('rejects non-boolean enabled value', async () => {
  const { body, response } = await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: 'yes' }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('creates instrument without group when groups are disabled', async () => {
  resetGroupsEnabled('0');
  const { response } = await jsonRequest('/api/instruments', {
    method: 'POST',
    body: JSON.stringify({
      symbol: 'NOGROUP',
      yahooSymbol: 'NOGROUP.X',
      name: 'No Group Test',
      type: 'stock',
      currency: 'EUR',
      color: '#ff0000',
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 201);

  const instrument = db.prepare('SELECT * FROM instruments WHERE symbol = ?').get('NOGROUP');
  assert.ok(instrument);
  assert.equal(instrument.group_id, null);
});

test('creates instrument without groupId when groups are disabled via wizard', async () => {
  resetGroupsEnabled('0');
  const { body, response } = await jsonRequest('/api/onboarding/wizard/preview', {
    method: 'POST',
    body: JSON.stringify({
      useGroup: true,
      instrument: {
        symbol: 'WIZTEST',
        yahooSymbol: 'WIZTEST.X',
        name: 'Wizard Test',
        type: 'etf',
        currency: 'EUR',
        color: '#00ff00',
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 200);
  assert.equal(body.preview.useGroup, false);
  assert.equal(body.preview.group, null);
});

test('dashboard summary without groups shows instrument-level portfolio', async () => {
  resetGroupsEnabled('0');
  db.prepare("DELETE FROM instruments WHERE symbol IN ('INSTR1', 'INSTR2')");
  seedTestInstrument({ symbol: 'INSTR1', yahooSymbol: 'INSTR1.X', name: 'Instrument 1', type: 'stock' });
  seedTestInstrument({ symbol: 'INSTR2', yahooSymbol: 'INSTR2.X', name: 'Instrument 2', type: 'stock' });
  cachePrice('INSTR1.X', '2026-06-15', 100);
  cachePrice('INSTR2.X', '2026-06-15', 50);
  createTransaction({ type: 'add', symbol: 'INSTR1', date: '2026-06-15', shares: 2 });
  createTransaction({ type: 'add', symbol: 'INSTR2', date: '2026-06-15', shares: 3 });

  const { body } = await jsonRequest('/api/portfolio/summary');
  assert.equal(body.groupsEnabled, false);
  assert.equal(body.total > 0, true);
  assert.deepEqual(body.groupedPositions, {});
  assert.deepEqual(body.stockPositions, []);
});

test('reactivates groups creates grupo-cero and assigns ungrouped instruments', async () => {
  resetGroupsEnabled('0');
  db.prepare('DELETE FROM instruments WHERE symbol = ?').run('UNGROUPED1');
  seedTestInstrument({ symbol: 'UNGROUPED1', yahooSymbol: 'UNGROUPED1.X', name: 'Ungrouped', type: 'stock' });
  db.prepare("UPDATE instruments SET group_id = NULL WHERE symbol = 'UNGROUPED1'");

  resetGroupsEnabled('1');
  const { body, response } = await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.status, 200);
  assert.equal(body.groupsEnabled, true);
  assert.equal(body.createdDefaultGroup, true);

  const grupoCero = db.prepare('SELECT * FROM instrument_groups WHERE id = ?').get('grupo-cero');
  assert.ok(grupoCero);
  assert.equal(grupoCero.name, 'grupo cero');
  assert.equal(grupoCero.color, '#64748b');
});

test('reactivating groups multiple times does not duplicate assignments', async () => {
  resetGroupsEnabled('0');
  db.prepare('DELETE FROM instruments WHERE symbol = ?').run('DUPLICATE1');
  seedTestInstrument({ symbol: 'DUPLICATE1', yahooSymbol: 'DUPLICATE1.X', name: 'Duplicate', type: 'stock' });
  db.prepare("UPDATE instruments SET group_id = NULL WHERE symbol = 'DUPLICATE1'");

  resetGroupsEnabled('1');
  await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
    headers: { 'Content-Type': 'application/json' },
  });

  const { body } = await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(body.createdDefaultGroup, false);
  assert.equal(body.assignedInstrumentCount, 0);

  const groups = db.prepare("SELECT COUNT(*) AS count FROM instrument_groups WHERE id = 'grupo-cero'").get();
  assert.equal(groups.count, 1);
});

test('fx instruments are not assigned to grupo-cero', async () => {
  resetGroupsEnabled('0');
  db.prepare("DELETE FROM instruments WHERE symbol IN ('FXEUR', 'REGINSTR')");
  seedTestInstrument({ symbol: 'FXEUR', yahooSymbol: 'EUR=X', name: 'Euro FX', type: 'fx' });
  seedTestInstrument({ symbol: 'REGINSTR', yahooSymbol: 'REG.X', name: 'Regular', type: 'stock' });
  db.prepare("UPDATE instruments SET group_id = NULL WHERE symbol IN ('FXEUR', 'REGINSTR')");

  resetGroupsEnabled('1');
  await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
    headers: { 'Content-Type': 'application/json' },
  });

  const fxInstrument = db.prepare('SELECT group_id FROM instruments WHERE symbol = ?').get('FXEUR');
  assert.equal(fxInstrument.group_id, null);

  const regInstrument = db.prepare('SELECT group_id FROM instruments WHERE symbol = ?').get('REGINSTR');
  assert.equal(regInstrument.group_id, 'grupo-cero');
});

test('instruments with existing groups are not reassigned when reactivating', async () => {
  resetGroupsEnabled('0');
  db.prepare('DELETE FROM instruments WHERE symbol = ?').run('WITHGROUP');
  db.prepare(
    `INSERT OR IGNORE INTO instrument_groups (id, name, color, active) VALUES ('existing-group', 'Existing', '#ff0000', 1)`,
  );
  db.prepare(
    `INSERT INTO instruments (symbol, yahoo_symbol, name, type, currency, color, base_shares, fallback_price, active, group_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?)`,
  ).run('WITHGROUP', 'WITHGROUP.X', 'With Group', 'stock', 'EUR', '#0d9488', 'existing-group');

  resetGroupsEnabled('1');
  await jsonRequest('/api/instrument-groups/settings', {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
    headers: { 'Content-Type': 'application/json' },
  });

  const instrument = db.prepare('SELECT group_id FROM instruments WHERE symbol = ?').get('WITHGROUP');
  assert.equal(instrument.group_id, 'existing-group');
});

test('summary includes groupsEnabled in response', async () => {
  resetGroupsEnabled('1');
  const { body } = await jsonRequest('/api/portfolio/summary');
  assert.ok(body.hasOwnProperty('groupsEnabled'));
  assert.equal(body.groupsEnabled, true);
});

test('onboarding status includes groupsEnabled', async () => {
  resetGroupsEnabled('1');
  const { body } = await jsonRequest('/api/onboarding/status');
  assert.ok(body.hasOwnProperty('groupsEnabled'));
  assert.equal(body.groupsEnabled, true);
});

test('monthly data includes instrument breakdown when groups disabled', async () => {
  resetGroupsEnabled('0');
  db.prepare("DELETE FROM instruments WHERE symbol IN ('MNSTR1', 'MNSTR2')");
  db.prepare("DELETE FROM transactions WHERE symbol IN ('MNSTR1', 'MNSTR2')");
  seedTestInstrument({ symbol: 'MNSTR1', yahooSymbol: 'MN1.X', name: 'Month Test 1', type: 'stock' });
  seedTestInstrument({ symbol: 'MNSTR2', yahooSymbol: 'MN2.X', name: 'Month Test 2', type: 'stock' });
  cachePrice('MN1.X', '2026-02-28', 100);
  cachePrice('MN2.X', '2026-02-28', 50);
  createTransaction({ type: 'add', symbol: 'MNSTR1', date: '2026-02-10', shares: 10 });
  createTransaction({ type: 'add', symbol: 'MNSTR2', date: '2026-02-12', shares: 20 });

  const { body } = await jsonRequest('/api/portfolio/monthly?year=2026');
  const feb = body.months.find((m) => m.month === 2);
  assert.ok(feb);
  assert.ok(
    feb.groups.length > 0,
    `February should have instrument groups when groups disabled, got: ${JSON.stringify(feb.groups)}`,
  );
  assert.ok(
    feb.groups.some((g) => g.id === 'MNSTR1'),
    'Should include MNSTR1',
  );
  assert.ok(
    feb.groups.some((g) => g.id === 'MNSTR2'),
    'Should include MNSTR2',
  );
});
