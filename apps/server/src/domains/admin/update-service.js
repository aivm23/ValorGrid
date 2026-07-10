const { assertCtxDeps } = require('../../platform/ctx-utils');

const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/aivm23/ValorGrid/releases/latest';
const GITHUB_REPO_URL = 'https://github.com/aivm23/ValorGrid';
const GHCR_IMAGE = 'ghcr.io/aivm23/valorgrid';
const CACHE_TTL_MS = 60 * 60 * 1000;

function parseSemver(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9.]+))?$/i.exec(String(tag || ''));
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] || '' };
}

function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) return 0;
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;
  if (va.pre && !vb.pre) return -1;
  if (!va.pre && vb.pre) return 1;
  if (va.pre && vb.pre) return va.pre < vb.pre ? -1 : va.pre > vb.pre ? 1 : 0;
  return 0;
}

function normalizeVersionTag(tag) {
  return String(tag || '').replace(/^v/, '');
}

function detectRuntimeMode(config) {
  const mode = String(config?.runtime?.mode || process.env.VALORGRID_RUNTIME_MODE || 'server').toLowerCase();
  if (mode === 'desktop') return 'desktop';
  if (mode === 'docker') return 'docker';
  if (process.env.VALORGRID_CONTAINER === '1' || process.env.VALORGRID_DOCKER === '1') return 'docker';
  return 'server';
}

function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  return { platform, arch };
}

function selectDesktopAsset(assets, platform, arch, version) {
  if (!Array.isArray(assets)) return null;
  const ver = normalizeVersionTag(version);
  if (platform === 'win32') {
    return (
      assets.find((a) => /\.exe$/i.test(a.name) && a.name.includes('-x64') && a.name.includes(ver)) || null
    );
  }
  if (platform === 'linux') {
    return (
      assets.find((a) => /\.AppImage$/i.test(a.name) && a.name.includes(ver)) ||
      assets.find((a) => /\.deb$/i.test(a.name) && a.name.includes(ver)) ||
      null
    );
  }
  if (platform === 'darwin') {
    const archSuffix = arch === 'arm64' ? 'arm64' : 'x64';
    return (
      assets.find((a) => /\.dmg$/i.test(a.name) && a.name.includes(archSuffix) && a.name.includes(ver)) ||
      assets.find((a) => /\.dmg$/i.test(a.name) && a.name.includes(ver)) ||
      null
    );
  }
  return null;
}

function buildDockerImage(version) {
  const ver = normalizeVersionTag(version);
  return `${GHCR_IMAGE}:v${ver}`;
}

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['config', 'logger', 'services'], 'update-service');

  const { config, logger } = ctx;
  let cache = null;
  let cacheTimestamp = 0;

  async function fetchLatestRelease() {
    const now = Date.now();
    if (cache && now - cacheTimestamp < CACHE_TTL_MS) return cache;

    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `ValorGrid/${config.appInfo?.version || '0.0.0'}`,
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API responded ${response.status}`);
    }
    const data = await response.json();
    const tagName = data.tag_name;
    if (!tagName) {
      throw new Error('GitHub release response missing tag_name');
    }
    const latestVersion = normalizeVersionTag(tagName);
    const releaseUrl = data.html_url || `${GITHUB_REPO_URL}/releases/tag/${tagName}`;
    const assets = (data.assets || []).map((a) => ({ name: a.name, downloadUrl: a.browser_download_url }));
    cache = { tagName, latestVersion, releaseUrl, assets };
    cacheTimestamp = now;
    return cache;
  }

  function getUpdateStatusBase() {
    const currentVersion = config.appInfo?.version || '0.0.0';
    const runtimeMode = detectRuntimeMode(config);
    const { platform, arch } = detectPlatform();
    return { currentVersion, runtimeMode, platform, arch };
  }

  async function getUpdateStatus() {
    const base = getUpdateStatusBase();
    try {
      const release = await fetchLatestRelease();
      const updateAvailable = compareSemver(release.latestVersion, base.currentVersion) > 0;
      const result = {
        currentVersion: base.currentVersion,
        latestVersion: release.latestVersion,
        updateAvailable,
        runtimeMode: base.runtimeMode,
        releaseUrl: release.releaseUrl,
        dockerImage: buildDockerImage(release.latestVersion),
        checkedAt: new Date().toISOString(),
      };
      if (base.runtimeMode === 'desktop') {
        const asset = selectDesktopAsset(release.assets, base.platform, base.arch, release.latestVersion);
        result.recommendedAsset = asset
          ? { name: asset.name, downloadUrl: asset.downloadUrl }
          : null;
      } else {
        result.recommendedAsset = null;
      }
      return result;
    } catch (error) {
      logger?.warn?.(`update-service: no se pudo consultar la ultima version: ${error.message}`);
      return {
        currentVersion: base.currentVersion,
        latestVersion: base.currentVersion,
        updateAvailable: false,
        runtimeMode: base.runtimeMode,
        error: 'No se pudo consultar la ultima version',
        checkedAt: new Date().toISOString(),
      };
    }
  }

  function getDockerCommands(version) {
    const tag = version ? `v${normalizeVersionTag(version)}` : 'vX.Y.Z';
    return [
      `docker pull ${GHCR_IMAGE}:${tag}`,
      'docker compose pull',
      'docker compose up -d',
    ];
  }

  ctx.services.admin = {
    ...(ctx.services.admin || {}),
    getUpdateStatus,
    getDockerCommands,
  };

  Object.assign(ctx, {
    getUpdateStatus,
    getDockerCommands,
    detectRuntimeMode,
    compareSemver,
    selectDesktopAsset,
  });
};

module.exports.parseSemver = parseSemver;
module.exports.compareSemver = compareSemver;
module.exports.detectRuntimeMode = detectRuntimeMode;
module.exports.selectDesktopAsset = selectDesktopAsset;
module.exports.normalizeVersionTag = normalizeVersionTag;
module.exports.buildDockerImage = buildDockerImage;
