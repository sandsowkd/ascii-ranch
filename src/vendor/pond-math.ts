/** Adapted from stqfdyr/ascii-pond src/util.js (MIT).
 * Copyright (c) 2026 stqfdyr. License: public/licenses/ascii-pond-MIT.txt.
 * Changes: TypeScript types; only the helpers used by the flock are retained. */
export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = smoothstep(0, 1, x - xi), v = smoothstep(0, 1, y - yi);
  const a = hash3(xi, yi, seed), b = hash3(xi + 1, yi, seed);
  const c = hash3(xi, yi + 1, seed), d = hash3(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function lineGlyph(dx: number, dy: number) {
  const d = Math.hypot(dx, dy) || 1;
  if (Math.abs(dy) < 0.38 * d) return '-';
  if (Math.abs(dx) < 0.38 * d) return '|';
  return dx * dy > 0 ? '\\' : '/';
}
