export function attachSource(ctx, source, names) {
  const returned = names.map((name) => `${JSON.stringify(name)}: ${name}`).join(', ');
  const api = new Function('ctx', `with (ctx) { ${source}\n return { ${returned} }; }`)(ctx);
  Object.assign(ctx, api);
}

export function decodeSource(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
