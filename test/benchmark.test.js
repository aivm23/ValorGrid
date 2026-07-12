const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { benchmarkEndpoint, staticResourceStats } = require('../scripts/benchmark-baseline');

test('static resource benchmark includes nested styles and excludes manifests', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-static-resources-'));
  try {
    fs.mkdirSync(path.join(tempDir, 'src', 'styles'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'index.html'), '1234');
    fs.writeFileSync(path.join(tempDir, 'src', 'app.js'), '123');
    fs.writeFileSync(path.join(tempDir, 'src', 'styles', 'feature.css'), '12');
    fs.writeFileSync(path.join(tempDir, 'package.json'), 'ignored');

    assert.deepEqual(staticResourceStats(tempDir), { files: 3, bytes: 9 });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('endpoint benchmark reports cold, median and p95 measurements', async () => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    const result = await benchmarkEndpoint(`http://127.0.0.1:${address.port}`, '/health', {
      warmups: 1,
      samples: 2,
    });
    assert.equal(requests, 4);
    assert.equal(result.path, '/health');
    assert.equal(result.samples, 2);
    assert.equal(result.responseBytes, 2);
    assert.ok(result.coldMs >= 0);
    assert.ok(result.medianMs >= 0);
    assert.ok(result.p95Ms >= result.medianMs);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
