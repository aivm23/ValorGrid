const { resolveRouteHandlers } = require('../../route-service-bindings');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handlePortfolioRoutes(ctx, request, response, url) {
  const {
    sendJson,
    readJsonBody,
    buildOnboardingStatus,
    previewOnboardingWizard,
    commitOnboardingWizard,
    buildSummary,
    buildPortfolioPerformance,
    buildMonthly,
    buildPortfolioHistory,
  } = resolveRouteHandlers(ctx);

  const { currentYear } = ctx;

  if (url.pathname === '/api/onboarding/status' && request.method === 'GET') {
    sendJson(response, 200, buildOnboardingStatus());
    return true;
  }

  if (url.pathname === '/api/onboarding/wizard/preview' && request.method === 'POST') {
    try {
      sendJson(response, 200, { preview: await previewOnboardingWizard(await readJsonBody(request)) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/onboarding/wizard/commit' && request.method === 'POST') {
    try {
      sendJson(response, 201, await commitOnboardingWizard(await readJsonBody(request)));
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/portfolio/summary' && request.method === 'GET') {
    sendJson(response, 200, await buildSummary());
    return true;
  }

  if (url.pathname === '/api/portfolio/performance' && request.method === 'GET') {
    sendJson(response, 200, await buildPortfolioPerformance());
    return true;
  }

  if (url.pathname === '/api/portfolio/returns' && request.method === 'GET') {
    const message =
      typeof ctx.translateForRequest === 'function'
        ? ctx.translateForRequest(request, 'Feature available in Professional Edition')
        : 'Feature available in Professional Edition';
    sendJson(response, 403, { error: message });
    return true;
  }

  if (url.pathname === '/api/portfolio/monthly' && request.method === 'GET') {
    sendJson(response, 200, await buildMonthly(Number(url.searchParams.get('year')) || currentYear));
    return true;
  }

  if (url.pathname === '/api/portfolio/history' && request.method === 'GET') {
    sendJson(
      response,
      200,
      await buildPortfolioHistory(url.searchParams.get('range') || 'all', url.searchParams.get('granularity') || 'auto'),
    );
    return true;
  }

  return false;
};
