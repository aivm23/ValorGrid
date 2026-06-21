const path = require('node:path');

function normalizeExtension(candidate, logger) {
  if (!candidate || typeof candidate !== 'object') return null;

  const id = String(candidate.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    logger.warn('[extensions] Ignoring extension with invalid id');
    return null;
  }

  const edition = candidate.edition === 'professional' ? 'professional' : 'community';
  const features = Array.isArray(candidate.features)
    ? candidate.features.filter((feature) => typeof feature === 'string' && feature.trim()).map((feature) => feature.trim())
    : [];
  const web = candidate.web && typeof candidate.web === 'object' ? candidate.web : {};
  const webRoot = web.root ? path.resolve(web.root) : null;

  return {
    id,
    edition,
    features,
    registerServer: typeof candidate.registerServer === 'function' ? candidate.registerServer : null,
    webRoot,
    webModules: Array.isArray(web.modules) ? web.modules.filter((item) => typeof item === 'string') : [],
    webStyles: Array.isArray(web.styles) ? web.styles.filter((item) => typeof item === 'string') : [],
  };
}

function createExtensionHost({ config, logger }) {
  const extensionPath = config.extensionPath;
  const routes = [];
  const loaded = [];

  if (extensionPath) {
    try {
      const resolvedPath = path.resolve(extensionPath);
      const extension = normalizeExtension(require(resolvedPath), logger);
      if (extension) loaded.push(extension);
    } catch (error) {
      logger.warn(`[extensions] Optional extension could not be loaded: ${error.message}`);
    }
  }

  function assetUrl(extension, item) {
    const clean = item.replace(/^\/+/, '');
    return `/extensions/${extension.id}/${clean}`;
  }

  function manifest() {
    return {
      edition: config.appInfo.edition,
      extensions: loaded.map((extension) => ({
        id: extension.id,
        edition: extension.edition,
        features: [...extension.features],
      })),
      web: {
        modules: loaded.flatMap((extension) => extension.webModules.map((item) => assetUrl(extension, item))),
        styles: loaded.flatMap((extension) => extension.webStyles.map((item) => assetUrl(extension, item))),
      },
    };
  }

  function registerServer(ctx) {
    for (const extension of loaded) {
      if (extension.edition === 'professional') {
        ctx.appInfo.edition = 'professional';
        ctx.config.appInfo.edition = 'professional';
      }
      if (extension.registerServer) {
        extension.registerServer(ctx);
      }
    }
  }

  function resolveAsset(urlPath) {
    const match = urlPath.match(/^\/extensions\/([^/]+)\/(.+)$/);
    if (!match) return null;
    const extension = loaded.find((item) => item.id === match[1]);
    if (!extension?.webRoot) return null;
    const resolvedPath = path.resolve(extension.webRoot, match[2]);
    return resolvedPath.startsWith(extension.webRoot + path.sep) || resolvedPath === extension.webRoot ? resolvedPath : null;
  }

  async function handleApiRoute(ctx, request, response, url) {
    if (url.pathname === '/api/extensions' && request.method === 'GET') {
      ctx.sendJson(response, 200, manifest());
      return true;
    }

    for (const route of routes) {
      if (await route(ctx, request, response, url)) return true;
    }
    return false;
  }

  return {
    loaded,
    routes,
    manifest,
    registerServer,
    resolveAsset,
    handleApiRoute,
  };
}

module.exports = {
  createExtensionHost,
};
