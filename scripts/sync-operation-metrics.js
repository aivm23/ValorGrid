const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');

const root = path.resolve(__dirname, '..');
const contractPath = path.join(root, 'packages', 'contracts', 'src', 'operation-metrics.json');
const adapterPath = path.join(root, 'apps', 'web', 'src', 'operations-metric-catalog.js');

function arraySource(name, values, asSet = false) {
  const body = values.map((value) => `  '${value}',`).join('\n');
  return `export const ${name} = ${asSet ? 'new Set(' : ''}[\n${body}\n]${asSet ? ')' : ''};`;
}

function expectedSource(contract) {
  return [
    '// Generated from packages/contracts/src/operation-metrics.json.',
    arraySource('DEFAULT_OPERATION_METRIC_IDS', contract.defaultMetricIds),
    arraySource('OPERATION_METRIC_IDS', contract.metricIds, true),
    '',
  ].join('\n\n');
}

async function main() {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const expected = await prettier.format(expectedSource(contract), {
    filepath: adapterPath,
    printWidth: 120,
    singleQuote: true,
  });
  if (process.argv.includes('--check')) {
    const actual = fs.readFileSync(adapterPath, 'utf8');
    if (actual !== expected) throw new Error('Frontend operation metric adapter is not synchronized with contracts');
  } else {
    fs.writeFileSync(adapterPath, expected);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
