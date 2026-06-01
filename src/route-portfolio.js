const { resolveRouteHandlers } = require('./route-service-bindings');

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
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/onboarding/wizard/commit' && request.method === 'POST') {
    try {
      sendJson(response, 201, await commitOnboardingWizard(await readJsonBody(request)));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
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
