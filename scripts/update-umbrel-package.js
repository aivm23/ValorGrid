#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_ID = 'valorgrid';
const COMMUNITY_STORE_ID = 'valorgrid-store';
const COMMUNITY_PACKAGE_ID = `${COMMUNITY_STORE_ID}-valorgrid`;
const COMMUNITY_ICON_URL =
  'https://raw.githubusercontent.com/aivm23/valorgrid-umbrel-app-store/main/valorgrid-store-valorgrid/icon.svg';
const PORT = 1325;
const ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const digestOverride = readArg('--digest') || process.env.UMBREL_IMAGE_DIGEST || '';
const digestArg = digestOverride || (checkOnly ? readExistingDigest() : ZERO_DIGEST);

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return '';
  return args[index + 1] || '';
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function assertDigest(digest) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    fail(`Invalid Umbrel image digest: ${digest}`);
  }
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (!pkg.version) fail('package.json does not contain a version');
  return pkg.version;
}

function readExistingDigest() {
  const composePath = path.join(ROOT, 'deploy', 'umbrel', 'official', PACKAGE_ID, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return ZERO_DIGEST;
  const compose = fs.readFileSync(composePath, 'utf8');
  const match = compose.match(/@(?<digest>sha256:[a-f0-9]{64})/i);
  return match?.groups?.digest || ZERO_DIGEST;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(file, content) {
  const normalized = `${content.trimEnd()}\n`;
  if (checkOnly) {
    if (!fs.existsSync(file)) fail(`Missing generated Umbrel file: ${path.relative(ROOT, file)}`);
    const basename = path.basename(file);
    if (basename === '.gitkeep' || basename.endsWith('.svg')) return;
    const current = fs.readFileSync(file, 'utf8');
    if (current !== normalized) fail(`Umbrel file is stale: ${path.relative(ROOT, file)}`);
    return;
  }
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, normalized);
}

function manifest({ icon, id, version }) {
  const iconField = icon ? `icon: ${icon}\n` : '';
  return `manifestVersion: 1
id: ${id}
category: finance
name: ValorGrid
version: "${version}"
${iconField}tagline: Private and auditable investment portfolio tracking
description: >-
  ValorGrid is a local-first portfolio tracker for recording, importing and
  analysing investment movements with SQLite persistence, local backups and a
  browser UI. Portfolio data stays on your Umbrel server; market price lookups
  are sent only to the configured market data provider for the requested symbol.
releaseNotes: ""

developer: aivm23
website: https://valorgrid.app
dependencies: []
repo: https://github.com/aivm23/ValorGrid
support: https://github.com/aivm23/ValorGrid/issues

port: ${PORT}
gallery: []
path: ""

defaultUsername: ""
defaultPassword: ""

submitter: aivm23
submission: ""`;
}

function compose({ id, version, digest }) {
  return `services:
  app_proxy:
    environment:
      APP_HOST: ${id}_app_1
      APP_PORT: ${PORT}

  app:
    image: ghcr.io/aivm23/valorgrid:v${version}@${digest}
    restart: on-failure
    environment:
      HOST: 0.0.0.0
      PORT: ${PORT}
      VALORGRID_RUNTIME_MODE: docker
      PORTFOLIO_DB_PATH: /data/portfolio.sqlite
      VALORGRID_BACKUP_DIR: /data/backups
      VALORGRID_AUTH_USER: valorgrid
      VALORGRID_AUTH_PASSWORD: ""
      VALORGRID_ALPHA_VANTAGE_API_KEY: ""
    volumes:
      - \${APP_DATA_DIR}/data:/data`;
}

function storeManifest() {
  return `id: ${COMMUNITY_STORE_ID}
name: ValorGrid Community App Store`;
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="ValorGrid">
  <defs>
    <linearGradient id="vg" x1="80" x2="432" y1="96" y2="416" gradientUnits="userSpaceOnUse">
      <stop stop-color="#20c7ff"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="108" fill="#07111f"/>
  <rect x="96" y="96" width="320" height="320" rx="56" fill="#0b1729" stroke="#1f3a5f" stroke-width="12"/>
  <path d="M150 322l66-78 54 48 92-128" fill="none" stroke="url(#vg)" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/>
  <path d="M144 144h224M144 224h224M144 304h224M144 384h224M144 144v240M224 144v240M304 144v240M384 144v240" stroke="#243b5e" stroke-width="8" opacity=".55"/>
  <circle cx="150" cy="322" r="14" fill="#20c7ff"/>
  <circle cx="216" cy="244" r="14" fill="#38bdf8"/>
  <circle cx="270" cy="292" r="14" fill="#6366f1"/>
  <circle cx="362" cy="164" r="14" fill="#8b5cf6"/>
</svg>`;
}

function writePackage(baseDir, id, version, digest, options = {}) {
  writeFile(path.join(baseDir, id, 'umbrel-app.yml'), manifest({ icon: options.icon, id, version }));
  writeFile(path.join(baseDir, id, 'docker-compose.yml'), compose({ id, version, digest }));
  writeFile(path.join(baseDir, id, 'data', '.gitkeep'), '');
  if (options.iconFile) writeFile(path.join(baseDir, id, 'icon.svg'), iconSvg());
}

function run() {
  assertDigest(digestArg);
  const version = readVersion();
  const officialRoot = path.join(ROOT, 'deploy', 'umbrel', 'official');
  const communityRoot = path.join(ROOT, 'deploy', 'umbrel', 'community-store');

  writePackage(officialRoot, PACKAGE_ID, version, digestArg);
  writeFile(path.join(communityRoot, 'umbrel-app-store.yml'), storeManifest());
  writePackage(communityRoot, COMMUNITY_PACKAGE_ID, version, digestArg, {
    icon: COMMUNITY_ICON_URL,
    iconFile: true,
  });

  const mode = checkOnly ? 'checked' : 'updated';
  const digestLabel = digestArg === ZERO_DIGEST ? 'placeholder digest' : digestArg;
  process.stdout.write(`Umbrel package ${mode} for v${version} using ${digestLabel}.\n`);
}

run();
