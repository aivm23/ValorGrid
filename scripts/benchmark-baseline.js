const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const sourceDb = path.join(root, 'local', 'valorgrid', 'data', 'portfolio.loadtest.sqlite');
const samples = Number(process.env.BENCHMARK_SAMPLES || 30);
const warmups = Number(process.env.BENCHMARK_WARMUPS || 5);
const staticExtensions = new Set(['.css', '.html', '.js', '.svg', '.png', '.ico', '.webp']);

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function measureRequest(baseUrl, pathname) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = await response.arrayBuffer();
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return { elapsedMs: performance.now() - startedAt, bytes: body.byteLength };
}

async function benchmarkEndpoint(baseUrl, pathname, options = {}) {
  const sampleCount = options.samples ?? samples;
  const warmupCount = options.warmups ?? warmups;
  const cold = await measureRequest(baseUrl, pathname);
  for (let index = 0; index < warmupCount; index += 1) await measureRequest(baseUrl, pathname);
  const timings = [];
  let bytes = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const result = await measureRequest(baseUrl, pathname);
    timings.push(result.elapsedMs);
    bytes = result.bytes;
  }
  return {
    path: pathname,
    samples: sampleCount,
    coldMs: round(cold.elapsedMs),
    medianMs: round(percentile(timings, 0.5)),
    p95Ms: round(percentile(timings, 0.95)),
    responseBytes: bytes,
  };
}

function collectStaticResources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectStaticResources(entryPath);
    return staticExtensions.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : [];
  });
}

function staticResourceStats(webRoot = path.join(root, 'apps', 'web')) {
  const paths = collectStaticResources(webRoot);
  return {
    files: paths.length,
    bytes: paths.reduce((total, filePath) => total + fs.statSync(filePath).size, 0),
  };
}

async function main() {
  if (!fs.existsSync(sourceDb)) {
    throw new Error('Demo database missing. Run npm run seed:demo before the benchmark.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorgrid-benchmark-'));
  const benchmarkDb = path.join(tempDir, 'portfolio.sqlite');
  fs.copyFileSync(sourceDb, benchmarkDb);
  process.env.PORTFOLIO_DB_PATH = benchmarkDb;
  process.env.VALORGRID_BACKUP_DIR = path.join(tempDir, 'backups');
  process.env.VALORGRID_SECRETS_DIR = tempDir;
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '0';
  process.env.VALORGRID_RUNTIME_MODE = 'benchmark';

  const bootstrapStartedAt = performance.now();
  const app = require('../apps/server/server');
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  const startupMs = performance.now() - bootstrapStartedAt;
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const year = new Date().getFullYear();

  try {
    const endpoints = [
      '/api/portfolio/summary',
      '/api/transactions',
      `/api/portfolio/monthly?year=${year}`,
      '/api/portfolio/history?range=5y&granularity=auto',
    ];
    const results = [];
    for (const endpoint of endpoints) results.push(await benchmarkEndpoint(baseUrl, endpoint));
    const memory = process.memoryUsage();
    console.log(
      JSON.stringify(
        {
          dataset: 'canonical-synthetic-demo',
          warmups,
          samples,
          startupMs: round(startupMs),
          memoryMb: {
            rss: round(memory.rss / 1024 / 1024),
            heapUsed: round(memory.heapUsed / 1024 / 1024),
          },
          staticResources: staticResourceStats(),
          endpoints: results,
        },
        null,
        2,
      ),
    );
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    app.db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { benchmarkEndpoint, collectStaticResources, staticResourceStats };
