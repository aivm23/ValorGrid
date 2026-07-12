const BRAND_CYAN = '#06b6d4';
const BRAND_VIOLET = '#8b5cf6';

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function interpolateBrandColor(t) {
  const a = hexToRgb(BRAND_CYAN);
  const b = hexToRgb(BRAND_VIOLET);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function buildBrandPalettePositions(count) {
  const emitted = [0, 1];
  const sorted = [0, 1];

  while (emitted.length < count) {
    let bestGap = null;

    for (let i = 0; i < sorted.length - 1; i += 1) {
      const left = sorted[i];
      const right = sorted[i + 1];
      const size = right - left;
      if (!bestGap || size > bestGap.size || (size === bestGap.size && left < bestGap.left)) {
        bestGap = { left, right, size };
      }
    }

    const midpoint = (bestGap.left + bestGap.right) / 2;
    emitted.push(midpoint);
    sorted.push(midpoint);
    sorted.sort((a, b) => a - b);
  }

  return emitted;
}

function brandPalettePosition(index) {
  const positions = buildBrandPalettePositions(index + 1);
  return positions[index];
}

function brandPaletteColor(index) {
  const positions = buildBrandPalettePositions(index + 1);
  return interpolateBrandColor(positions[index]);
}

module.exports = {
  BRAND_CYAN,
  BRAND_VIOLET,
  hexToRgb,
  rgbToHex,
  interpolateBrandColor,
  buildBrandPalettePositions,
  brandPalettePosition,
  brandPaletteColor,
};
