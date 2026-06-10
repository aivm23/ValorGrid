/**
 * ValorGrid --- almacenamiento seguro de preferencias.
 *
 * Wrapper para window.localStorage con fallback a cookies.
 * Si ambos fallan, devuelve valores por defecto sin romper la app.
 */

const COOKIE_NAME_PREFIX = 'valorgrid-pref-';
const COOKIE_DEFAULT_MAX_AGE = 31536000;

function _getCookie(name) {
  try {
    const cookies = document?.cookie?.split(';') || [];
    for (const cookie of cookies) {
      const [key, ...rest] = cookie.trim().split('=');
      if (key === name) {
        return decodeURIComponent(rest.join('='));
      }
    }
  } catch {
    // cookie parsing failed — ignore
  }
  return null;
}

function _setCookie(name, value, maxAge) {
  try {
    document.cookie =
      name +
      '=' +
      encodeURIComponent(value) +
      ';Path=/' +
      ';SameSite=Lax' +
      ';Max-Age=' +
      (maxAge || COOKIE_DEFAULT_MAX_AGE);
  } catch {
    // cookie write failed — ignore
  }
}

function _removeCookie(name) {
  try {
    document.cookie = name + '=;Path=/;Max-Age=0;SameSite=Lax';
  } catch {
    // ignore
  }
}

let _storageAvailable = null;

function _isStorageAvailable() {
  if (_storageAvailable !== null) return _storageAvailable;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      _storageAvailable = false;
      return false;
    }
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    _storageAvailable = true;
    return true;
  } catch {
    _storageAvailable = false;
    return false;
  }
}

/**
 * @param {string} key
 * @returns {string|null}
 */
function getItem(key) {
  if (_isStorageAvailable()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // localStorage became unavailable — fall through to cookies
    }
  }
  return _getCookie(COOKIE_NAME_PREFIX + key);
}

/**
 * @param {string} key
 * @param {string} value
 */
function setItem(key, value) {
  if (_isStorageAvailable()) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // localStorage became unavailable — fall through to cookies
    }
  }
  _setCookie(COOKIE_NAME_PREFIX + key, value, COOKIE_DEFAULT_MAX_AGE);
}

/**
 * @param {string} key
 */
function removeItem(key) {
  if (_isStorageAvailable()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  _removeCookie(COOKIE_NAME_PREFIX + key);
}

export default { getItem, setItem, removeItem };
