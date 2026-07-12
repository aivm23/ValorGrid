const assert = require('node:assert/strict');
const test = require('node:test');
const {
  brandPaletteColor,
  brandPalettePosition,
  interpolateBrandColor,
} = require('../apps/server/src/shared/brand-palette');

test('brandPaletteColor(0) returns brand cyan', () => {
  assert.equal(brandPaletteColor(0), '#06b6d4');
});

test('brandPaletteColor(1) returns brand violet', () => {
  assert.equal(brandPaletteColor(1), '#8b5cf6');
});

test('brandPaletteColor(2) returns midpoint of cyan and violet', () => {
  const color = brandPaletteColor(2);
  assert.match(color, /^#[0-9a-f]{6}$/i);
  // Midpoint should be exactly between #06b6d4 and #8b5cf6
  // R: (0x06 + 0x8b) / 2 = 0x48 -> 72.5 -> round -> 73 -> 0x49
  // G: (0xb6 + 0x5c) / 2 = 0x89 -> 137
  // B: (0xd4 + 0xf6) / 2 = 0xe5 -> 229
  assert.equal(color, '#4989e5');
});

test('brandPalettePosition returns correct sequence', () => {
  assert.equal(brandPalettePosition(0), 0);
  assert.equal(brandPalettePosition(1), 1);
  assert.equal(brandPalettePosition(2), 0.5);
  assert.equal(brandPalettePosition(3), 0.25);
  assert.equal(brandPalettePosition(4), 0.75);
  assert.equal(brandPalettePosition(5), 0.125);
});

test('brandPaletteColor always returns valid hex for first 20 indices', () => {
  for (let i = 0; i < 20; i++) {
    const color = brandPaletteColor(i);
    assert.match(color, /^#[0-9a-f]{6}$/i, `Index ${i} returned invalid hex: ${color}`);
  }
});

test('brandPalettePositions are unique in first 20', () => {
  const positions = new Set();
  for (let i = 0; i < 20; i++) {
    const pos = brandPalettePosition(i);
    assert(!positions.has(pos), `Position ${pos} at index ${i} is duplicate`);
    positions.add(pos);
  }
});

test('interpolateBrandColor at 0 returns cyan', () => {
  assert.equal(interpolateBrandColor(0), '#06b6d4');
});

test('interpolateBrandColor at 1 returns violet', () => {
  assert.equal(interpolateBrandColor(1), '#8b5cf6');
});

test('interpolateBrandColor at 0.5 returns midpoint', () => {
  assert.equal(interpolateBrandColor(0.5), '#4989e5');
});
