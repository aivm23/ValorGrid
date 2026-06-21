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

  function saveUiPreferences() {
    const error = new Error('Feature available in Professional Edition');
    error.statusCode = 403;
    throw error;
  }

  Object.assign(ctx, {
    getUiPreferences,
    saveUiPreferences,
    parseUiPreferences,
  });
};
