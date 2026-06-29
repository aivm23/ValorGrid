const SUPPORTED_LANGUAGES = new Set(['es', 'en']);
const STORAGE_KEY = 'valorgrid-language';
const textOriginals = new WeakMap();
const attrOriginals = new WeakMap();

const BASE_TEXT_TRANSLATIONS = {
  en: {
    'Cargando ValorGrid...': 'Loading ValorGrid...',
    'Preparando datos y cartera local.': 'Preparing local data and portfolio.',
    'Abrir incidencia en GitHub Issues': 'Open issue in GitHub Issues',
    Reintentar: 'Retry',
    'Dashboard privado de gestión y seguimiento de cartera.': 'Private portfolio management and tracking dashboard.',
    Empezar: 'Start',
    Aportaciones: 'Contributions',
    Valores: 'Instruments',
    Importar: 'Import',
    Exportar: 'Export',
    Dividendos: 'Dividends',
    Operativa: 'Operations',
    'Resumen financiero del ledger y evolución acumulada.': 'Financial ledger summary and accumulated evolution.',
    'Distribución actual': 'Current allocation',
    'Peso de cada posición sobre el total.': 'Weight of each position over the total.',
    'Total visible estimado': 'Estimated visible total',
    Total: 'Total',
    Histórico: 'History',
    'Evolución de valor, aportaciones y movimientos.': 'Value, contributions and movement history.',
    Movimientos: 'Movements',
    'Compras, ventas y dividendos registrados.': 'Registered buys, sells and dividends.',
    Administración: 'Administration',
    'Backups, importaciones y preferencias de visualización.': 'Backups, imports and display preferences.',
    Preferencias: 'Preferences',
    General: 'General',
    Idioma: 'Language',
    Español: 'Spanish',
    Inglés: 'English',
    'Mostrar negativos en rojo': 'Show negative values in red',
    'Límite movimientos': 'Movement limit',
    'Formato de fecha': 'Date format',
    'Inicio del calendario': 'Calendar start',
    Lunes: 'Monday',
    Domingo: 'Sunday',
    Avanzado: 'Advanced',
    'Personalización disponible en': 'Customization available in',
    Backups: 'Backups',
    Importaciones: 'Imports',
    Cerrar: 'Close',
    Cancelar: 'Cancel',
    Guardar: 'Save',
    Descargar: 'Download',
    Eliminar: 'Delete',
    'Crear valor': 'Create instrument',
    'Sin valores para este filtro.': 'No instruments for this filter.',
    'Sin grupos. Crea uno para clasificar valores.': 'No groups. Create one to classify instruments.',
    'Opciones de visualización': 'Display options',
    'Mostrar en dashboard': 'Show on dashboard',
    'Mostrar en revisión YTD': 'Show in YTD review',
    'Permitir desglose': 'Allow breakdown',
    'Sin backups todavía.': 'No backups yet.',
    'Backups recientes': 'Recent backups',
    'Rentabilidad avanzada': 'Advanced returns',
    Instrumentos: 'Instruments',
    Grupos: 'Groups',
    Instrumento: 'Instrument',
    Grupo: 'Group',
    Tipo: 'Type',
    Composición: 'Composition',
    Peso: 'Weight',
    Impacto: 'Impact',
    'Cuota P&L': 'P&L share',
    'MWR anual': 'Annual MWR',
    'Ret. abierta': 'Open return',
    'Arrastre coste': 'Cost drag',
    Días: 'Days',
    Dias: 'Days',
    Estado: 'State',
    Abierta: 'Open',
    Parcial: 'Partial',
    Cerrada: 'Closed',
    Compras: 'Buys',
    Ventas: 'Sells',
    Todos: 'All',
    Ocultos: 'Hidden',
    Personalizados: 'Custom',
    Operación: 'Operation',
    'Marcadores de movimientos': 'Movement markers',
    'Ordenar por': 'Sort by',
    'Impacto cartera': 'Portfolio impact',
    'Peso cartera': 'Portfolio weight',
    'Retorno abierto': 'Open return',
    'Eficiencia ventas': 'Sales efficiency',
    'Días en cartera': 'Days held',
    'Incluir posiciones cerradas': 'Include closed positions',
    'Bloques del dashboard': 'Dashboard blocks',
    'Rentabilidad': 'Return',
    'Pendiente': 'Pending',
    'Valor mercado': 'Market value',
    'Aportado neto': 'Net contributed',
    'Resultado total': 'Total result',
    'Plusvalía latente': 'Unrealized gain',
    'Plusvalía realizada': 'Realized gain',
    Comisiones: 'Fees',
    'Rentabilidad simple': 'Simple return',
    'Nº movimientos': 'Movement count',
    'Comisión media': 'Average fee',
    'Inversión abierta': 'Open investment',
    'Cash-flow neto': 'Net cash flow',
    'Compras brutas': 'Gross buys',
    'Ventas brutas': 'Gross sells',
    'a precios actuales': 'at current prices',
    'desde primer movimiento': 'since first movement',
    'retirada neta total': 'total net withdrawal',
    'valor + retirado neto': 'value + net withdrawn',
    'sin aportación neta': 'no net contribution',
    'sobre aportado': 'over contributed capital',
    'sin inversión abierta': 'no open investment',
    'resultado ventas FIFO': 'FIFO sale result',
    'sin comisiones': 'no fees',
    'retorno sobre aportado': 'return over contributed capital',
    'requiere neto aportado > 0': 'requires net contributed > 0',
    'compras y ventas totales': 'total buys and sells',
    'por movimiento': 'per movement',
    'capital actualmente invertido': 'capital currently invested',
    'flujo neto acumulado': 'accumulated net flow',
    'total comprado sin comisiones': 'total bought excluding fees',
    'total vendido sin comisiones': 'total sold excluding fees',
    'Cargando precios online...': 'Loading online prices...',
    'Actualizar precios': 'Refresh prices',
    'Ocultar saldos': 'Hide balances',
    'Mostrar saldos': 'Show balances',
    'Cambiar tema': 'Change theme',
    'Activar modo claro': 'Enable light mode',
    'Activar modo oscuro': 'Enable dark mode',
    'Alta guiada': 'Guided setup',
    'Planes de aportación': 'Contribution plans',
    'Configurar valores': 'Configure instruments',
    'Importar movimientos': 'Import movements',
    'Exportar datos': 'Export data',
    'Revisar dividendos pendientes': 'Review pending dividends',
    'Dividendos pendientes': 'Pending dividends',
    'Información sobre la métrica': 'Metric information',
    'Calculando rentabilidad avanzada...': 'Calculating advanced returns...',
    'Sin movimientos para analizar.': 'No movements to analyze.',
    'No se pudo calcular la rentabilidad avanzada.': 'Advanced returns could not be calculated.',
    'Sin impacto medible': 'No measurable impact',
    'Toda la muestra visible': 'Entire visible sample',
    'filas con impacto': 'rows with impact',
    'Top contribuidor': 'Top contributor',
    'Mayor detractor': 'Largest detractor',
    'Concentracion top 3': 'Top 3 concentration',
    'Concentración top 3': 'Top 3 concentration',
    'Peor arrastre coste': 'Largest cost drag',
    Contribuidores: 'Contributors',
    Detractores: 'Detractors',
    'Lotes FIFO abiertos': 'Open FIFO lots',
    'Ventas FIFO': 'FIFO sales',
    'Sin lotes abiertos.': 'No open lots.',
    'Sin ventas realizadas.': 'No realized sales.',
    'Sin datos.': 'No data.',
    'sin fecha': 'no date',
    'sin datos': 'no data',
    'del mes': 'of the month',
    'Mostrar más': 'Show more',
    'Mostrar menos': 'Show less',
    'Vista de rentabilidad avanzada': 'Advanced returns view',
  },
};

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
    es: {},
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

  function translatePhrase(source, params) {
    const text = String(source ?? '');
    if (language() === 'es') return interpolate(text, params);
    return interpolate(dictionaries[language()]?.[text] || text, params);
  }

  function t(source, params) {
    return translatePhrase(source, params);
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
    language,
    locale,
    dateInputLang,
    refreshLocaleFormatters,
    applyLanguage,
    initLanguage,
    handleLanguageChange,
  });
}
