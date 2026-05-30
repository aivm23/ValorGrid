export function attach(ctx) {
  const { document, localStorage, elements, window } = ctx;

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('portfolio-theme', theme);
    elements.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro');
    elements.themeToggle.setAttribute('title', theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro');
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('portfolio-theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
  }

  Object.assign(ctx, {
    applyTheme,
    initTheme,
  });
}
