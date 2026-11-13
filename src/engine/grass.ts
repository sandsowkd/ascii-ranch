export const DENSITY_GLYPHS = 't%SX8@#';
/** Continuous brightness within five growth stages, from bare ground to lush grass. */
export function grassAppearance(amount: number, texture: number, wind = 0) {
  if (amount < 0.025) return { glyph: ' ', family: 6, level: 0, stage: 0 };
  if (amount < 0.16) return { glyph: '.', family: 6, level: 0.18 + (amount - 0.025) / 0.135 * 0.24, stage: 1 };
  if (amount < 0.36) return { glyph: ':', family: 6, level: 0.52 + (amount - 0.16) / 0.2 * 0.34, stage: 2 };
  if (amount < 0.62) return { glyph: texture < 0.45 ? ';' : '!', family: 0, level: 0.22 + (amount - 0.36) / 0.26 * 0.13, stage: 3 };
  if (amount < 0.9) return { glyph: texture < 0.55 ? 'v' : wind > 0 ? '/' : '\\', family: 0, level: 0.4 + (amount - 0.62) / 0.28 * 0.18, stage: 4 };
  return { glyph: texture < 0.27 ? "'" : texture < 0.5 ? ',' : texture < 0.72 ? '|' : texture < 0.85 ? 'v' : texture < 0.93 ? (wind > 0 ? '/' : '\\') : DENSITY_GLYPHS[Math.min(6, Math.floor(texture * 7))], family: 0, level: 0.58 + (amount - 0.9) * 0.7 + wind * 0.025, stage: 5 };
}
