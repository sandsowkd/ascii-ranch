import { clamp, hash3, lineGlyph } from '../vendor/pond-math';
import type { Sheep, World } from '../simulation/World';

/** Pond's glyph tiles, local ink and cached font, adapted into a living pasture.
 * Math helpers and tile treatment derive from stqfdyr/ascii-pond (MIT).
 * Copyright (c) 2026 stqfdyr; public/licenses/ascii-pond-MIT.txt. */
const GLYPHS = ".,:;'`|/\\v!+*ox@O%#8-=~^<>()[]";
export const BG = '#171e19';
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private atlas = document.createElement('canvas');
  private dpr = 1; private aw = 8; private ah = 10;
  private codes = new Uint8Array(0); private levels = new Uint8Array(0); private family = new Uint8Array(0);
  private tiles = new Uint8Array(0); private tileLevel = new Uint8Array(0);
  private texture = new Float32Array(0); private atlasCols = GLYPHS.length;
  private tileColors: string[][] = [];
  constructor(public canvas: HTMLCanvasElement, public world: World) { this.ctx = canvas.getContext('2d', { alpha: false })!; this.resize(); }
  resize() {
    const w = this.world, p = w.pasture;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w.width * this.dpr); this.canvas.height = Math.round(w.height * this.dpr);
    const n = p.cols * p.rows;
    this.codes = new Uint8Array(n); this.levels = new Uint8Array(n); this.family = new Uint8Array(n);
    this.tiles = new Uint8Array(n); this.tileLevel = new Uint8Array(n); this.texture = new Float32Array(n);
    for (let i = 0; i < n; i++) this.texture[i] = hash3(i % p.cols, Math.floor(i / p.cols), 39);
    this.buildAtlas();
  }
  async ready() { await document.fonts.load('400 12px "Geist Mono"'); this.buildAtlas(); this.render(); }
  private buildAtlas() {
    const { cellW, cellH } = this.world.pasture;
    this.aw = Math.ceil(cellW * this.dpr); this.ah = Math.ceil(cellH * this.dpr);
    this.atlas.width = this.aw * this.atlasCols; this.atlas.height = this.ah * 32 * 6;
    const ctx = this.atlas.getContext('2d')!;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `400 ${Math.round(cellH * 0.82 * this.dpr)}px "Geist Mono", monospace`;
    const lows = [[35, 47, 35], [42, 45, 34], [66, 71, 57], [114, 120, 97], [65, 61, 45], [69, 69, 51]];
    const highs = [[111, 137, 79], [117, 104, 68], [139, 142, 117], [236, 234, 209], [201, 163, 108], [209, 192, 123]];
    for (let family = 0; family < 6; family++) for (let level = 0; level < 32; level++) {
      const t = level / 31, lo = lows[family], hi = highs[family];
      ctx.fillStyle = `rgb(${Math.round(lo[0] + (hi[0] - lo[0]) * t)},${Math.round(lo[1] + (hi[1] - lo[1]) * t)},${Math.round(lo[2] + (hi[2] - lo[2]) * t)})`;
      for (let g = 0; g < GLYPHS.length; g++) ctx.fillText(GLYPHS[g], g * this.aw + this.aw / 2, (family * 32 + level) * this.ah + this.ah / 2 + this.dpr * 0.35);
    }
    const tileLo = [[23, 30, 25], [92, 99, 80], [24, 29, 24], [57, 55, 40], [31, 38, 27]];
    const tileHi = [[28, 34, 27], [226, 226, 203], [57, 65, 48], [139, 113, 76], [77, 87, 54]];
    this.tileColors = tileLo.map((lo, j) => Array.from({ length: 32 }, (_, i) => `rgb(${lo.map((v, k) => Math.round(v + (tileHi[j][k] - v) * i / 31)).join(',')})`));
  }
  private put(x: number, y: number, glyph: string, level: number, family: number, tile = 0, tileLevel = 0) {
    const p = this.world.pasture, c = Math.floor(x / p.cellW), r = Math.floor(y / p.cellH);
    if (c < 0 || c >= p.cols || r < 0 || r >= p.rows) return;
    const i = r * p.cols + c;
    this.codes[i] = Math.max(0, GLYPHS.indexOf(glyph)); this.levels[i] = clamp(Math.round(level * 31), 0, 31);
    this.family[i] = family; this.tiles[i] = tile; this.tileLevel[i] = clamp(Math.round(tileLevel * 31), 0, 31);
  }
  private shadow(x: number, y: number, rx: number, ry: number) {
    const p = this.world.pasture;
    for (let r = Math.floor((y - ry) / p.cellH); r <= Math.ceil((y + ry) / p.cellH); r++) for (let c = Math.floor((x - rx) / p.cellW); c <= Math.ceil((x + rx) / p.cellW); c++) {
      const px = (c + 0.5) * p.cellW, py = (r + 0.5) * p.cellH;
      if (((px - x) / rx) ** 2 + ((py - y) / ry) ** 2 < 1) this.put(px, py, '.', 0.05, 0, 3, 0);
    }
  }
  private sheep(s: Sheep) {
    const w = this.world, p = w.pasture, scale = w.scale * s.size;
    const heading = s.heading + (s.state === 'grazing' ? Math.sin(w.time * 2 + s.phase) * 0.06 : 0);
    const dx = Math.cos(heading), dy = Math.sin(heading), sx = -dy, sy = dx;
    const rx = 25.5 * scale, ry = 17.5 * scale, stride = Math.hypot(s.vx, s.vy) > 4 ? Math.sin(w.time * 11 + s.phase) * 4 : 0;
    this.shadow(s.x + 4, s.y + 7, rx + 8, ry + 5);
    for (const front of [-1, 1]) for (const side of [-1, 1]) {
      const f = front * rx * 0.52 + stride * front * side, lateral = side * (ry + 3);
      this.put(s.x + dx * f + sx * lateral, s.y + dy * f + sy * lateral, lineGlyph(dx + sx * 0.5, dy + sy * 0.5), 0.45, 2, 3, 0.14);
    }
    const radius = rx + 4;
    for (let r = Math.floor((s.y - radius) / p.cellH); r <= Math.ceil((s.y + radius) / p.cellH); r++) for (let c = Math.floor((s.x - radius) / p.cellW); c <= Math.ceil((s.x + radius) / p.cellW); c++) {
      const x = (c + 0.5) * p.cellW, y = (r + 0.5) * p.cellH;
      const ox = x - s.x, oy = y - s.y, along = ox * dx + oy * dy, side = ox * sx + oy * sy;
      const distance = (along / rx) ** 2 + (side / ry) ** 2;
      if (distance > 1) continue;
      const texture = hash3(Math.floor(along / p.cellW), Math.floor(side / p.cellH), s.id + 99);
      const shade = clamp(0.75 + (1 - distance) * 0.16 - oy / radius * 0.1 + (texture - 0.5) * 0.1 + s.wool * 0.04, 0.55, 1);
      const glyph = texture < 0.22 ? 'o' : texture < 0.45 ? '@' : texture < 0.67 ? '8' : texture < 0.85 ? 'O' : '%';
      this.put(x, y, glyph, 0.18 + texture * 0.16, 2, 2, shade);
    }
    this.put(s.x - dx * (rx + 3), s.y - dy * (rx + 3), ',', 0.8, 3);
    const nibble = s.state === 'grazing' || s.state === 'following' && Math.hypot(s.vx, s.vy) < 3 ? Math.sin(w.time * 5 + s.phase) * 2.5 : 0;
    const hx = s.x + dx * (rx + 4 + nibble), hy = s.y + dy * (rx + 4 + nibble);
    for (const side of [-1, 1]) this.put(hx + sx * side * 11 * scale - dx * 3, hy + sy * side * 11 * scale - dy * 3, side === 1 ? '\\' : '/', 0.64, 2, 3, 0.48);
    for (const front of [-0.4, 0.5]) for (const side of [-0.45, 0.45]) {
      const px = hx + dx * front * 11 * scale + sx * side * 12 * scale, py = hy + dy * front * 11 * scale + sy * side * 12 * scale;
      this.put(px, py, front < 0 ? 'o' : '.', front < 0 ? 0.8 : 0.45, 3, 3, 0.6);
    }
  }
  private dog() {
    const w = this.world, d = w.dog;
    if (!d) return;
    const p = w.pasture, scale = w.scale, dx = Math.cos(d.heading), dy = Math.sin(d.heading), sx = -dy, sy = dx;
    const rx = 22 * scale, ry = 11.5 * scale, speed = Math.hypot(d.vx, d.vy);
    this.shadow(d.x + 4, d.y + 6, rx + 9, ry + 7);
    for (const front of [-1, 1]) for (const side of [-1, 1]) {
      const f = front * 13 * scale + Math.sin(w.time * (d.sprint > 0 ? 25 : 16) + front * side) * (speed > 3 ? 4 : 0), lateral = side * 15 * scale;
      this.put(d.x + dx * f + sx * lateral, d.y + dy * f + sy * lateral, lineGlyph(dx, dy), 0.6, 4, 4, 0.32);
    }
    for (let r = Math.floor((d.y - rx) / p.cellH); r <= Math.ceil((d.y + rx) / p.cellH); r++) for (let c = Math.floor((d.x - rx) / p.cellW); c <= Math.ceil((d.x + rx) / p.cellW); c++) {
      const x = (c + 0.5) * p.cellW, y = (r + 0.5) * p.cellH, ox = x - d.x, oy = y - d.y;
      const along = ox * dx + oy * dy, side = ox * sx + oy * sy, distance = (along / rx) ** 2 + (side / ry) ** 2;
      if (distance > 1) continue;
      const chest = along > rx * 0.35 && Math.abs(side) < ry * 0.9;
      this.put(x, y, chest ? 'o' : '#', chest ? 0.25 : 0.55, chest ? 2 : 4, chest ? 2 : 4, chest ? 0.77 : 0.56 + (1 - distance) * 0.15);
    }
    this.put(d.x - dx * (rx + 6) + sx * Math.sin(w.time * 7) * 5, d.y - dy * (rx + 6) + sy * Math.sin(w.time * 7) * 5, '~', 0.8, 4);
    const hx = d.x + dx * (rx + 2), hy = d.y + dy * (rx + 2);
    for (const side of [-1, 1]) this.put(hx + sx * side * 7 - dx * 4, hy + sy * side * 7 - dy * 4, '^', 0.55, 4, 4, 0.55);
    this.put(hx, hy, 'o', 0.85, 3, 4, 0.85);
    this.put(hx + dx * 8, hy + dy * 8, '>', 0.75, 4, 4, 0.65);
    // An unobtrusive copper selection mark makes the dog easy to pick out.
    this.put(d.x - 10, d.y - 25 * scale, '[', 0.5, 4);
    this.put(d.x + 10, d.y - 25 * scale, ']', 0.5, 4);
  }
  private ring(x: number, y: number, radius: number, strength: number, family: number) {
    const p = this.world.pasture, band = p.cellW * 1.15;
    for (let r = Math.max(0, Math.floor((y - radius - band) / p.cellH)); r <= Math.min(p.rows - 1, Math.ceil((y + radius + band) / p.cellH)); r++) {
      for (let c = Math.max(0, Math.floor((x - radius - band) / p.cellW)); c <= Math.min(p.cols - 1, Math.ceil((x + radius + band) / p.cellW)); c++) {
        const px = (c + 0.5) * p.cellW, py = (r + 0.5) * p.cellH, dx = px - x, dy = py - y;
        const off = Math.abs(Math.hypot(dx, dy) - radius);
        if (off < band) this.put(px, py, lineGlyph(-dy, dx), strength * (1 - off / band), family);
      }
    }
  }
  render() {
    const w = this.world, p = w.pasture, { cellW: cw, cellH: ch, cols, rows } = p, ctx = this.ctx;
    this.tiles.fill(0);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, grass = p.grass[i], texture = this.texture[i];
      const wind = Math.sin(c * 0.07 + r * 0.047 - w.time * 0.45) * 0.55 + Math.sin(r * 0.13 - w.time * 0.28) * 0.3;
      let glyph = grass < 0.15 ? '.' : grass < 0.32 ? texture > 0.55 ? ',' : "'" : grass < 0.59 ? texture > 0.5 ? "'" : ';' : texture < 0.25 ? "'" : texture < 0.48 ? ',' : texture < 0.72 ? '|' : wind > 0.38 ? '/' : wind < -0.38 ? '\\' : 'v';
      if (p.trampled[i] > 0.3) glyph = texture > 0.5 ? '-' : ',';
      const richness = clamp((grass - 0.3) / 0.7, 0, 1);
      let level = 0.12 + richness * 0.27 + texture * 0.15 + wind * 0.018;
      let family = p.soil[i] > 0.44 || grass < 0.2 ? 1 : 0;
      if (p.flower[i] >= 0 && grass > 0.5) { glyph = p.flower[i] > 0.5 ? '*' : '+'; family = p.flower[i] > 0.7 ? 3 : 5; level = 0.45 + texture * 0.25; }
      const edge = Math.min(c * cw, w.width - c * cw, r * ch, w.height - r * ch);
      // Dense meadow at the edges, quiet breathing room for the controls.
      const uiDim = Math.min(r * ch / 100, (w.height - r * ch) / 125, 1);
      level *= 0.48 + 0.52 * clamp(uiDim, 0, 1);
      if (edge < 21 && grass > 0.62) level += 0.06;
      this.codes[i] = GLYPHS.indexOf(glyph); this.levels[i] = clamp(Math.round(level * 31), 0, 31); this.family[i] = family;
    }
    // Feed grains are fixed to their handful, rather than flickering every frame.
    for (const f of w.feed) {
      const remaining = Math.max(3, Math.round(f.amount * 10));
      for (let j = 0; j < remaining; j++) {
        const angle = hash3(j, f.id, 19) * Math.PI * 2, radius = Math.sqrt(hash3(j, f.id, 72)) * 27 * w.scale;
        this.put(f.x + Math.cos(angle) * radius, f.y + Math.sin(angle) * radius, j % 3 === 0 ? 'o' : '.', 0.74, 5, 4, 0.3);
      }
    }
    if (w.marker) {
      const m = w.marker, radius = 6 + Math.min(m.age, 0.3) * 32;
      this.ring(m.x, m.y, radius, Math.max(0, 0.9 - m.age * 0.65), 0);
      this.put(m.x, m.y, '+', Math.max(0, 0.8 - m.age * 0.5), 0);
    }
    for (const bark of w.barks) for (let ring = 0; ring < 2; ring++) {
      const age = bark.age - ring * 0.12;
      if (age > 0) this.ring(bark.x, bark.y, age * 215 * w.scale, (1 - bark.age / 1.3) * (ring ? 0.4 : 0.8), 5);
    }
    if (w.dog?.orbit === 'r') this.ring(w.dog.anchorX, w.dog.anchorY, Math.min(130 * w.scale, w.dog.orbitRadius * 0.8), 0.26 + Math.sin(w.time * 2) * 0.06, 0);
    for (const s of w.sheep) this.sheep(s);
    this.dog();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = BG; ctx.fillRect(0, 0, w.width, w.height); ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < this.codes.length; i++) {
      const x = i % cols * cw, y = Math.floor(i / cols) * ch;
      if (this.tiles[i]) { ctx.fillStyle = this.tileColors[this.tiles[i] - 1][this.tileLevel[i]]; ctx.fillRect(x + 0.65, y + 0.65, cw - 0.9, ch - 0.9); }
      ctx.drawImage(this.atlas, this.codes[i] * this.aw, (this.family[i] * 32 + this.levels[i]) * this.ah, this.aw, this.ah, x, y, cw, ch);
    }
  }
}
