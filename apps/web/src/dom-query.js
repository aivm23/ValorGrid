export function requiredElement(document, selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing required DOM element: ${selector}`);
  return element;
}

export function optionalElement(document, selector) {
  return document.querySelector(selector);
}

export function elementList(document, selector) {
  return document.querySelectorAll(selector);
}
