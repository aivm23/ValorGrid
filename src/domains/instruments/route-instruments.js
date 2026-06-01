const { resolveRouteHandlers } = require('../../route-service-bindings');

function sendError(response, sendJson, error) {
  const statusCode = error.statusCode || 400;
  sendJson(response, statusCode, { error: error.message });
}

module.exports = async function handleInstrumentRoutes(ctx, request, response, url) {
  const {
    sendJson,
    readJsonBody,
    listInstruments,
    listInstrumentIdentifiers,
    upsertInstrumentIdentifier,
    deleteInstrumentIdentifier,
    createInstrument,
    previewInstrumentDelete,
    deleteInstruments,
    updateInstrument,
    deleteInstrument,
    listInstrumentGroups,
    createInstrumentGroup,
    deleteInstrumentGroups,
    updateInstrumentGroup,
    deleteInstrumentGroup,
  } = resolveRouteHandlers(ctx);

  if (url.pathname === '/api/instruments' && request.method === 'GET') {
    sendJson(response, 200, { instruments: listInstruments() });
    return true;
  }

  if (url.pathname === '/api/instrument-identifiers' && request.method === 'GET') {
    sendJson(response, 200, {
      identifiers: listInstrumentIdentifiers({
        symbol: url.searchParams.get('symbol'),
        provider: url.searchParams.get('provider'),
        type: url.searchParams.get('type'),
      }),
    });
    return true;
  }

  if (url.pathname === '/api/instrument-identifiers' && request.method === 'POST') {
    try {
      sendJson(response, 201, { identifier: upsertInstrumentIdentifier(await readJsonBody(request)) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const identifierMatch = url.pathname.match(/^\/api\/instrument-identifiers\/([^/]+)$/);
  if (identifierMatch && request.method === 'DELETE') {
    const ok = deleteInstrumentIdentifier(decodeURIComponent(identifierMatch[1]));
    sendJson(response, ok ? 200 : 404, ok ? { ok: true } : { error: 'Identifier not found' });
    return true;
  }

  if (url.pathname === '/api/instruments' && request.method === 'POST') {
    try {
      sendJson(response, 201, { instrument: createInstrument(await readJsonBody(request)) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/instruments/preview-delete' && request.method === 'POST') {
    sendJson(response, 200, { results: previewInstrumentDelete((await readJsonBody(request)).symbols || []) });
    return true;
  }

  if (url.pathname === '/api/instruments' && request.method === 'DELETE') {
    try {
      sendJson(response, 200, { results: deleteInstruments((await readJsonBody(request)).symbols || []) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const instrumentMatch = url.pathname.match(/^\/api\/instruments\/([^/]+)$/);
  if (instrumentMatch && request.method === 'PUT') {
    sendJson(response, 200, { instrument: updateInstrument(decodeURIComponent(instrumentMatch[1]), await readJsonBody(request)) });
    return true;
  }

  if (instrumentMatch && request.method === 'DELETE') {
    try {
      sendJson(response, 200, { result: deleteInstrument(decodeURIComponent(instrumentMatch[1])) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/instrument-groups' && request.method === 'GET') {
    sendJson(response, 200, { groups: listInstrumentGroups() });
    return true;
  }

  if (url.pathname === '/api/instrument-groups' && request.method === 'POST') {
    try {
      sendJson(response, 201, { group: createInstrumentGroup(await readJsonBody(request)) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (url.pathname === '/api/instrument-groups' && request.method === 'DELETE') {
    try {
      sendJson(response, 200, { results: deleteInstrumentGroups((await readJsonBody(request)).ids || []) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  const groupMatch = url.pathname.match(/^\/api\/instrument-groups\/([^/]+)$/);
  if (groupMatch && request.method === 'PUT') {
    try {
      sendJson(response, 200, { group: updateInstrumentGroup(decodeURIComponent(groupMatch[1]), await readJsonBody(request)) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  if (groupMatch && request.method === 'DELETE') {
    try {
      sendJson(response, 200, { result: deleteInstrumentGroup(decodeURIComponent(groupMatch[1])) });
    } catch (error) {
      sendError(response, sendJson, error);
    }
    return true;
  }

  return false;
};
