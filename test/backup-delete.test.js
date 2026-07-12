const test = require('node:test');
const { assert, jsonRequest, registerLifecycle } = require('./integration-helpers');

registerLifecycle(test);

test('DELETE /api/backups/:filename deletes an existing backup', async () => {
  // Arrange: create a backup first
  const create = await jsonRequest('/api/backups', { method: 'POST' });
  assert.equal(create.response.status, 201);
  const filename = create.body.backup.file;
  assert.match(filename, /^portfolio-.+\.sqlite$/);

  // Act: delete the backup
  const del = await jsonRequest(`/api/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });

  // Assert: returns 200 with deleted filename
  assert.equal(del.response.status, 200);
  assert.equal(del.body.deleted, filename);

  // No extra cleanup needed — API DELETE already removed the file
});

test('deleted backup no longer appears in GET /api/backups', async () => {
  // Arrange: create a backup
  const create = await jsonRequest('/api/backups', { method: 'POST' });
  assert.equal(create.response.status, 201);
  const filename = create.body.backup.file;

  // Act: delete it
  await jsonRequest(`/api/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });

  // Assert: list no longer includes the file
  const list = await jsonRequest('/api/backups');
  assert.equal(list.response.status, 200);
  assert.equal(
    list.body.backups.some((backup) => backup.file === filename),
    false,
  );

  // No extra cleanup needed — API DELETE already removed the file
});

test('DELETE /api/backups/:filename returns 404 for non-existent backup', async () => {
  const { response, body } = await jsonRequest('/api/backups/nonexistent-backup-12345.sqlite', { method: 'DELETE' });

  assert.equal(response.status, 404);
  assert.equal(body.error, 'Backup file not found');
});

test('DELETE /api/backups/:filename returns 400 for invalid filename (not .sqlite)', async () => {
  const { response, body } = await jsonRequest('/api/backups/not-a-backup.txt', { method: 'DELETE' });

  assert.equal(response.status, 400);
  assert.equal(body.error, 'Invalid backup file name');
});

test('DELETE /api/backups/:filename returns 400 for path traversal attempt (URL-encoded)', async () => {
  const { response, body } = await jsonRequest('/api/backups/..%2F..%2F.ev.il', { method: 'DELETE' });

  assert.equal(response.status, 400);
  assert.equal(body.error, 'Invalid backup file name');
});
