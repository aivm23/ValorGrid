const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const canonical = require('../packages/contracts/src/operation-metrics.json');
const commonJs = require('../packages/contracts/src/operation-metrics.cjs');

test('operation metric catalog stays canonical across CommonJS and browser ESM', async () => {
  const esm = await import(pathToFileURL(path.join(root, 'apps', 'web', 'src', 'operations-metric-catalog.js')));
  assert.deepEqual(commonJs, canonical);
  assert.deepEqual(esm.DEFAULT_OPERATION_METRIC_IDS, canonical.defaultMetricIds);
  assert.deepEqual([...esm.OPERATION_METRIC_IDS], canonical.metricIds);
  assert.equal(new Set(canonical.metricIds).size, canonical.metricIds.length, 'metric ids must be unique');
  assert.ok(canonical.defaultMetricIds.every((id) => canonical.metricIds.includes(id)));
});
