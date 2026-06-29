import { BASE_TEXT_TRANSLATIONS } from './i18n-catalog.js';

const SUPPORTED_LANGUAGES = new Set(['es', 'en']);
const STORAGE_KEY = 'valorgrid-language';
const textOriginals = new WeakMap();
const attrOriginals = new WeakMap();

function normalizeLanguage(value) {
  const language = String(value || '').toLowerCase().slice(0, 2);
  return SUPPORTED_LANGUAGES.has(language) ? language : 'es';
}

function preferredLanguage(ctx) {
  const stored = ctx.localStorage?.getItem(STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  return normalizeLanguage(ctx.window?.navigator?.language);
}

function interpolate(template, params) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(params || {}, key) ? String(params[key]) : `{${key}}`,
  );
}

function originalAttribute(element, attr) {
  let values = attrOriginals.get(element);
  if (!values) {
    values = {};
    attrOriginals.set(element, values);
  }
  if (!Object.prototype.hasOwnProperty.call(values, attr)) values[attr] = element.getAttribute(attr);
  return values[attr];
}

function shouldSkipNode(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest('script, style, svg, code, pre, textarea'));
}

export function attach(ctx) {
  const dictionaries = {
    es: { ...BASE_TEXT_TRANSLATIONS.es },
    en: { ...BASE_TEXT_TRANSLATIONS.en },
  };

  function language() {
    return normalizeLanguage(ctx.state?.language);
  }

  function locale() {
    return language() === 'en' ? 'en-US' : 'es-ES';
  }

  function dateInputLang() {
    return language() === 'en' ? 'en-US' : 'es';
  }

  function refreshLocaleFormatters() {
    const activeLocale = locale();
    Object.assign(ctx, {
      eurFormatter: new Intl.NumberFormat(activeLocale, { style: 'currency', currency: 'EUR' }),
      sharesFormatter: new Intl.NumberFormat(activeLocale, { maximumFractionDigits: 2 }),
      cryptoSharesFormatter: new Intl.NumberFormat(activeLocale, { maximumFractionDigits: 6 }),
    });
  }

  function registerTranslations(translations) {
    for (const [lang, entries] of Object.entries(translations || {})) {
      const normalized = normalizeLanguage(lang);
      dictionaries[normalized] = { ...(dictionaries[normalized] || {}), ...(entries || {}) };
    }
  }

  function dictionaryValue(key) {
    const text = String(key ?? '');
    const active = dictionaries[language()] || {};
    if (Object.prototype.hasOwnProperty.call(active, text)) return active[text];
    if (Object.prototype.hasOwnProperty.call(dictionaries.es, text)) return dictionaries.es[text];
    return undefined;
  }

  function translatePhrase(source, params) {
    const text = String(source ?? '');
    if (language() === 'es') return interpolate(text, params);
    return interpolate(dictionaries[language()]?.[text] || text, params);
  }

  function t(source, params) {
    const keyed = dictionaryValue(source);
    if (keyed !== undefined) return interpolate(keyed, params);
    return translatePhrase(source, params);
  }

  function tn(key, count, params = {}) {
    const suffix = Number(count) === 1 ? 'one' : 'other';
    return t(`${key}.${suffix}`, { ...params, count });
  }

  function translateTextNode(node) {
    if (shouldSkipNode(node)) return;
    const original = textOriginals.get(node) ?? node.nodeValue;
    if (!textOriginals.has(node)) textOriginals.set(node, original);
    const trimmed = String(original).trim();
    if (!trimmed) return;
    const translated = translatePhrase(trimmed);
    node.nodeValue = String(original).replace(trimmed, translated);
  }

  function translateElementAttributes(element) {
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      if (!element.hasAttribute(attr)) continue;
      const original = originalAttribute(element, attr);
      if (!original) continue;
      element.setAttribute(attr, translatePhrase(original));
    }
  }

  function translateTree(root = ctx.document.body) {
    if (!root) return;
    const DOMNode = ctx.window.Node;
    const DOMNodeFilter = ctx.window.NodeFilter;
    if (root.nodeType === DOMNode.ELEMENT_NODE) translateElementAttributes(root);
    const walker = ctx.document.createTreeWalker(root, DOMNodeFilter.SHOW_TEXT | DOMNodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === DOMNode.TEXT_NODE) translateTextNode(node);
      else if (node.nodeType === DOMNode.ELEMENT_NODE) translateElementAttributes(node);
    }
  }

  let observer;
  let translateTimer = null;
  function scheduleTranslate(root) {
    ctx.window.clearTimeout(translateTimer);
    translateTimer = ctx.window.setTimeout(() => translateTree(root || ctx.document.body), 0);
  }

  function observeTranslations() {
    if (observer) return;
    observer = new ctx.window.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === ctx.window.Node.ELEMENT_NODE || node.nodeType === ctx.window.Node.TEXT_NODE) {
            scheduleTranslate(node);
          }
        }
      }
    });
    observer.observe(ctx.document.body, { childList: true, subtree: true });
  }

  function applyLanguage(nextLanguage, options = {}) {
    const valid = normalizeLanguage(nextLanguage);
    ctx.state.language = valid;
    ctx.localStorage?.setItem(STORAGE_KEY, valid);
    ctx.document.documentElement.lang = valid;
    if (ctx.elements?.languageSelect) ctx.elements.languageSelect.value = valid;
    refreshLocaleFormatters();
    ctx.document.querySelectorAll('input[type="date"]').forEach((input) => {
      input.lang = dateInputLang();
    });
    translateTree(ctx.document.body);
    if (options.refresh !== false) {
      ctx.renderDashboard?.();
      ctx.renderHistory?.();
      ctx.renderLedger?.();
      ctx.renderInstruments?.();
      ctx.renderImportSourceOptions?.();
      ctx.renderOperationsPreferenceControls?.();
      ctx.renderHistoryPreferenceControls?.();
      ctx.renderReturnBreakdownPreferenceControls?.();
      ctx.renderDashboardLayoutPreferenceControls?.();
      ctx.renderReturnBreakdownTable?.();
    }
  }

  function initLanguage() {
    applyLanguage(ctx.state.language || preferredLanguage(ctx), { refresh: false });
    observeTranslations();
  }

  function handleLanguageChange(event) {
    applyLanguage(event.target.value || 'es');
  }

  if (ctx.state) ctx.state.language = preferredLanguage(ctx);
  refreshLocaleFormatters();

  Object.assign(ctx, {
    registerTranslations,
    translatePhrase,
    translateTree,
    t,
    tn,
    language,
    locale,
    dateInputLang,
    refreshLocaleFormatters,
    applyLanguage,
    initLanguage,
    handleLanguageChange,
  });
}
