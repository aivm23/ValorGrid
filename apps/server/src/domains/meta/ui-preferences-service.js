module.exports = function attach(ctx) {
  function parseUiPreferences() {
    return {};
  }

  function getUiPreferences() {
    const preferences = parseUiPreferences();
    return {
      preferences,
      editable: false,
    };
  }

  function saveUiPreferences(_body, request) {
    const message =
      typeof ctx.translateForRequest === 'function'
        ? ctx.translateForRequest(request, 'Feature available in Professional Edition')
        : 'Feature available in Professional Edition';
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }

  Object.assign(ctx, {
    getUiPreferences,
    saveUiPreferences,
    parseUiPreferences,
  });
};
