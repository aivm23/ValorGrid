const SERVER_TRANSLATIONS = {
  en: {
    'Feature available in Professional Edition': 'Feature available in Professional Edition',
    'Backup not found': 'Backup not found',
    'Bad request': 'Bad request',
    'Not found': 'Not found',
    Forbidden: 'Forbidden',
    'Internal server error': 'Internal server error',
  },
  es: {
    'Feature available in Professional Edition': 'Funcionalidad disponible en Professional Edition',
    'Backup not found': 'Backup no encontrado',
    'Bad request': 'Peticion no valida',
    'Not found': 'No encontrado',
    Forbidden: 'Prohibido',
    'Internal server error': 'Error interno del servidor',
  },
};

function requestLanguage(request) {
  const header = String(request?.headers?.['accept-language'] || '').toLowerCase();
  return header.startsWith('es') ? 'es' : 'en';
}

module.exports = function attach(ctx) {
  function translate(message, language = 'es') {
    const text = String(message || '');
    return SERVER_TRANSLATIONS[language]?.[text] || text;
  }

  function translateForRequest(request, message) {
    return translate(message, requestLanguage(request));
  }

  Object.assign(ctx, {
    requestLanguage,
    translate,
    translateForRequest,
  });
};
