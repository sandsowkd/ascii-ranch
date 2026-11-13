export const DENSITY_GLYPHS = 't%SX8@#';
/** Continuous brightness within five growth stages, from bare ground to lush grass. */
export function grassAppearance(amount: number, texture: number, wind = 0) {
  if (amount < 0.025) return { glyph: ' ', family: 6, level: 0, stage: 0 };
  if (amount < 0.2) return { glyph: '.', family: 6, level: 0.12 + (amount - 0.025) / 0.175 * 0.43, stage: 1 };
  if (amount < 0.42) return { glyph: texture < 0.6 ? ',' : "'", family: 6, level: 0.55 + (amount - 0.2) / 0.22 * 0.4, stage: 2 };
  if (amount < 0.68) return { glyph: texture < 0.45 ? "'" : '|', family: 0, level: 0.07 + (amount - 0.42) / 0.26 * 0.25, stage: 3 };
  if (amount < 0.9) return { glyph: texture < 0.35 ? "'" : texture < 0.7 ? '|' : wind > 0 ? '/' : 'v', family: 0, level: 0.32 + (amount - 0.68) / 0.22 * 0.26, stage: 4 };
  return { glyph: texture < 0.27 ? "'" : texture < 0.5 ? ',' : texture < 0.72 ? '|' : texture < 0.85 ? 'v' : texture < 0.93 ? (wind > 0 ? '/' : '\\') : DENSITY_GLYPHS[Math.min(6, Math.floor(texture * 7))], family: 0, level: 0.58 + (amount - 0.9) * 0.7 + wind * 0.025, stage: 5 };
}
