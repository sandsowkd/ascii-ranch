import { clamp, hash3, lineGlyph } from '../vendor/pond-math';
import { DENSITY_GLYPHS, grassAppearance } from './grass';
import type { Bird } from '../simulation/Birds';
import { BARK_TRAVEL_TIME, BARK_FADE_TIME, BARK_LIFETIME, barkRadius, type Bark } from '../simulation/bark';
import type { Sheep, World } from '../simulation/World';

/** Pond's density ramp, local ink and cached font, adapted into a living pasture.
 * Math helpers and density ramp derive from stqfdyr/ascii-pond (MIT).
 * Copyright (c) 2026 stqfdyr; public/licenses/ascii-pond-MIT.txt. */

const GLYPHS = " tSX" + ".,:;'`|/\\v!+*ox@O%#8-=~^<>()[]zZY";
export const BG = '#1a1917';
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private atlas = document.createElement('canvas');
  private dpr = 1; private aw = 8; private ah = 10;
  private codes = new Uint8Array(0); private levels = new Uint8Array(0); private family = new Uint8Array(0);
  private priority = new Uint8Array(0);
  private previousCodes = new Uint8Array(0); private previousLevels = new Uint8Array(0); private previousFamily = new Uint8Array(0);
  private repaintAll = true;
  private texture = new Float32Array(0); private atlasCols = GLYPHS.length;
  constructor(public canvas: HTMLCanvasElement, public world: World) { this.ctx = canvas.getContext('2d', { alpha: false })!; this.resize(); }
  resize() {
    const w = this.world, p = w.pasture;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w.width * this.dpr); this.canvas.height = Math.round(w.height * this.dpr);
    const n = p.cols * p.rows;
    this.codes = new Uint8Array(n); this.levels = new Uint8Array(n); this.family = new Uint8Array(n);
    this.texture = new Float32Array(n);
    this.priority = new Uint8Array(n);
    this.previousCodes = new Uint8Array(n); this.previousLevels = new Uint8Array(n); this.previousFamily = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.texture[i] = hash3(i % p.cols, Math.floor(i / p.cols), 39);
    this.buildAtlas();
  }
  async ready() { await document.fonts.load('400 12px "Geist Mono"'); this.buildAtlas(); this.render(); }
  private buildAtlas() {
    this.repaintAll = true;
    const { cellW, cellH } = this.world.pasture;
    this.aw = Math.ceil(cellW * this.dpr); this.ah = Math.ceil(cellH * this.dpr);
    this.atlas.width = this.aw * this.atlasCols; this.atlas.height = this.ah * 32 * 12;
    const ctx = this.atlas.getContext('2d')!;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `400 ${this.ah * 0.82}px "Geist Mono", monospace`;
    const lows = [[48, 72, 35], [28, 24, 16], [126, 128, 105], [114, 120, 97], [99, 73, 43], [69, 69, 51], [32, 51, 29], [65, 70, 50], [28, 28, 27], [40, 111, 126], [138, 66, 74], [144, 113, 42]];
    const highs = [[149, 182, 100], [75, 59, 34], [248, 243, 219], [255, 255, 245], [230, 182, 115], [229, 208, 136], [84, 123, 54], [169, 178, 138], [88, 84, 76], [116, 222, 218], [245, 153, 135], [246, 209, 107]];
    for (let family = 0; family < lows.length; family++) for (let level = 0; level < 32; level++) {
      const t = level / 31, lo = lows[family], hi = highs[family];
      ctx.fillStyle = `rgb(${Math.round(lo[0] + (hi[0] - lo[0]) * t)},${Math.round(lo[1] + (hi[1] - lo[1]) * t)},${Math.round(lo[2] + (hi[2] - lo[2]) * t)})`;
      for (let g = 0; g < GLYPHS.length; g++) {
        const eye = family === 3 && GLYPHS[g] === 'O', outline = family === 3 && '/\\|-()'.includes(GLYPHS[g]);
        ctx.font = `${eye ? 500 : outline ? 600 : 400} ${this.ah * (eye ? 0.98 : outline ? 0.92 : 0.82)}px "Geist Mono", monospace`;
        ctx.fillText(GLYPHS[g], g * this.aw + this.aw / 2, (family * 32 + level) * this.ah + this.ah / 2 + this.dpr * 0.35);
      }
    }

  }
  private put(x: number, y: number, glyph: string, level: number, family: number, priority = 0) {
    const p = this.world.pasture, c = Math.floor(x / p.cellW), r = Math.floor(y / p.cellH);
    if (c < 0 || c >= p.cols || r < 0 || r >= p.rows) return;
    const i = r * p.cols + c;
    if (priority < this.priority[i]) return;
    this.priority[i] = priority;
    this.codes[i] = Math.max(0, GLYPHS.indexOf(glyph)); this.levels[i] = clamp(Math.round(level * 31), 0, 31);
    this.family[i] = family;
  }
  cellAt(x: number, y: number) {
    const i = this.world.pasture.index(x, y);
    return { glyph: GLYPHS[this.codes[i]], priority: this.priority[i], tile: 0, family: this.family[i], level: this.levels[i] };
  }
  private sheep(s: Sheep, headsOnly = false) {
    const w = this.world, p = w.pasture, scale = w.scale * s.size;
    const heading = s.heading + (s.state === 'grazing' ? Math.sin(w.time * 2 + s.phase) * 0.06 : 0);
    const dx = Math.cos(heading), dy = Math.sin(heading), sx = -dy, sy = dx;
    const rx = 25.5 * scale, ry = 17.5 * scale, stride = Math.hypot(s.vx, s.vy) > 4 ? Math.sin(w.time * 11 + s.phase) * 2.1 * scale : 0;
    if (!headsOnly) {
    for (const front of [-1, 1]) for (const side of [-1, 1]) {
      const f = front * rx * (0.47 + Math.abs(dy) * 0.1), kick = stride * front * side;
      const hipX = s.x + dx * f + sx * side * ry * 0.45, hipY = s.y + dy * f + sy * side * ry * 0.45;
      const footX = s.x + dx * (f + kick) + sx * side * ry * 0.65;
      const footY = s.y + dy * (f + kick) + sy * side * ry * 0.65 + 5 * scale;
      this.stroke(hipX, hipY, footX, footY, 0.48, 2);
      this.put(footX, footY, '.', 0.65, 3);
    }
    const radius = rx + 4;
    for (let r = Math.floor((s.y - radius) / p.cellH); r <= Math.ceil((s.y + radius) / p.cellH); r++) for (let c = Math.floor((s.x - radius) / p.cellW); c <= Math.ceil((s.x + radius) / p.cellW); c++) {
      const x = (c + 0.5) * p.cellW, y = (r + 0.5) * p.cellH;
      const ox = x - s.x, oy = y - s.y, along = ox * dx + oy * dy, side = ox * sx + oy * sy;
      const distance = (along / rx) ** 2 + (side / ry) ** 2;
      if (distance > 1) continue;
      const texture = hash3(Math.floor(along / p.cellW), Math.floor(side / p.cellH), s.id + 99);
      const shade = clamp(0.75 + (1 - distance) * 0.16 - oy / radius * 0.1 + (texture - 0.5) * 0.1 + s.wool * 0.04, 0.55, 1);
      const glyph = DENSITY_GLYPHS[clamp(Math.round(shade * 6), 0, 6)];
      this.put(x, y, glyph, shade, 2);
    }
    this.put(s.x - dx * (rx + 3), s.y - dy * (rx + 3), ',', 0.8, 3);
    return;
    }
    const nibble = s.state === 'grazing' || s.state === 'following' && Math.hypot(s.vx, s.vy) < 3 ? Math.sin(w.time * 5 + s.phase) * 2.5 : 0;
    const hx = s.x + dx * (rx + 11 * scale + nibble), hy = s.y + dy * (rx + 11 * scale + nibble);
    // One closed silhouette joins the face and floppy ears. A full cell of white
    // around the dark interior stays continuous even on the smaller character grid.
    const shape = (x: number, y: number) => {
      const ox = x - hx, oy = y - hy, along = (ox * dx + oy * dy) / scale, side = Math.abs((ox * sx + oy * sy) / scale);
      const face = (along / 16) ** 2 + (side / 14) ** 2 - 1;
      const ear = ((along + 8 + (side - 14) * 0.35) / 6) ** 2 + ((side - 20) / 8) ** 2 - 1;
      return Math.min(face, ear);
    };
    const headR = 33 * scale;
    for (let r = Math.floor((hy - headR) / p.cellH); r <= Math.ceil((hy + headR) / p.cellH); r++) for (let c = Math.floor((hx - headR) / p.cellW); c <= Math.ceil((hx + headR) / p.cellW); c++) {
      const x = (c + 0.5) * p.cellW, y = (r + 0.5) * p.cellH;
      if (shape(x, y) > 0) continue;
      const rim = shape(x - p.cellW, y) > 0 || shape(x + p.cellW, y) > 0 || shape(x, y - p.cellH) > 0 || shape(x, y + p.cellH) > 0;
      const nx = shape(x + p.cellW * 0.3, y) - shape(x - p.cellW * 0.3, y);
      const ny = shape(x, y + p.cellH * 0.3) - shape(x, y - p.cellH * 0.3);
      this.put(x, y, rim ? lineGlyph(-ny, nx) : ':', rim ? 1 : 0.32, rim ? 3 : 8, rim ? 3 : 2);
    }
    for (const side of [-1, 1]) {
      this.put(hx - dx * 12.5 * scale + sx * side * 26.5 * scale, hy - dy * 12.5 * scale + sy * side * 26.5 * scale, side < 0 ? '(' : ')', 1, 3, 3);
      this.put(hx - dx * 3 * scale + sx * side * 7.5 * scale, hy - dy * 3 * scale + sy * side * 7.5 * scale, 'O', 1, 3, 4);
    }
    // Woolly forelock, two nostrils and a split lip distinguish the long sheep muzzle.
    this.put(hx - dx * 12 * scale, hy - dy * 12 * scale, '@', 0.95, 2, 3);
    for (const side of [-1, 1]) this.put(hx + dx * 9 * scale + sx * side * 3 * scale, hy + dy * 9 * scale + sy * side * 3 * scale, '.', 0.35, 8, 3);
    this.put(hx + dx * 14 * scale, hy + dy * 14 * scale, 'Y', 0.88, 2, 3);

  }
  private stroke(x1: number, y1: number, x2: number, y2: number, level: number, family: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (this.world.pasture.cellW * 0.7)));
    const glyph = lineGlyph(x2 - x1, y2 - y1);
    for (let i = 0; i <= steps; i++) this.put(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps, glyph, level, family);
  }
  private dog() {
    const w = this.world, d = w.dog;
    if (!d) return;
    const p = w.pasture, scale = w.scale, dx = Math.cos(d.heading), dy = Math.sin(d.heading), sx = -dy, sy = dx;
    const rx = 22 * scale, ry = 11.5 * scale, speed = Math.hypot(d.vx, d.vy);
    // Draw short legs first, so the coat covers their roots and only paws peek below.
    for (const front of [-1, 1]) for (const side of [-1, 1]) {
      const stride = Math.sin(w.time * (d.sprint > 0 || d.launching ? 25 : 18) + (front === side ? 0 : Math.PI));
      const f = front * (12 + Math.abs(dy) * 4) * scale, kick = speed > 3 ? stride * 2.6 * scale : 0;
      const hipX = d.x + dx * f + sx * side * 6 * scale, hipY = d.y + dy * f + sy * side * 6 * scale;
      const kneeX = d.x + dx * (f + kick * 0.45) + sx * side * 7 * scale, kneeY = d.y + dy * (f + kick * 0.45) + sy * side * 7 * scale + 2.5 * scale;
      const footX = d.x + dx * (f + kick) + sx * side * 8.5 * scale, footY = d.y + dy * (f + kick) + sy * side * 8.5 * scale + 5 * scale;
      this.stroke(hipX, hipY, kneeX, kneeY, 0.65, 4); this.stroke(kneeX, kneeY, footX, footY, 0.6, 4);
      this.put(footX, footY, '.', 0.55, 3);
    }
    for (let r = Math.floor((d.y - rx) / p.cellH); r <= Math.ceil((d.y + rx) / p.cellH); r++) for (let c = Math.floor((d.x - rx) / p.cellW); c <= Math.ceil((d.x + rx) / p.cellW); c++) {
      const x = (c + 0.5) * p.cellW, y = (r + 0.5) * p.cellH, ox = x - d.x, oy = y - d.y;
      const along = ox * dx + oy * dy, side = ox * sx + oy * sy, distance = (along / rx) ** 2 + (side / ry) ** 2;
      if (distance > 1) continue;
      const chest = along > rx * 0.35 && Math.abs(side) < ry * 0.9;
      this.put(x, y, chest ? 'o' : '#', chest ? 0.85 : 0.8, chest ? 2 : 4);
    }
    const wag = d.sleeping ? 0 : Math.sin(w.time * (speed > 3 ? 15 : 5)) * (speed > 3 ? 15 : 7) * scale;
    let tailX = d.x - dx * rx, tailY = d.y - dy * rx;
    for (let j = 1; j <= 5; j++) {
      const t = j / 5, x = d.x - dx * (rx + t * 21 * scale) + sx * wag * t * t;
      const y = d.y - dy * (rx + t * 21 * scale) + sy * wag * t * t;
      this.stroke(tailX, tailY, x, y, 0.95, j === 5 ? 3 : 4); tailX = x; tailY = y;
    }
    const hx = d.x + dx * (rx + 2), hy = d.y + dy * (rx + 2);
    // A compact collie face: copper cheeks, a pale blaze and a short muzzle.
    for (let r = Math.floor((hy - 11 * scale) / p.cellH); r <= Math.ceil((hy + 11 * scale) / p.cellH); r++) for (let c = Math.floor((hx - 11 * scale) / p.cellW); c <= Math.ceil((hx + 11 * scale) / p.cellW); c++) {
      const x = (c + 0.5) * p.cellW, y = (r + 0.5) * p.cellH, ox = x - hx, oy = y - hy;
      const along = ox * dx + oy * dy, side = ox * sx + oy * sy;
      if ((along / (9 * scale)) ** 2 + (side / (7 * scale)) ** 2 > 1) continue;
      const blaze = Math.abs(side) < 2.7 * scale;
      this.put(x, y, blaze ? ':' : '%', blaze ? 0.75 : 0.85, blaze ? 2 : 4);
    }
    for (const side of [-1, 1]) {
      this.stroke(hx - dx * 5 * scale + sx * side * 5 * scale, hy - dy * 5 * scale + sy * side * 5 * scale,
        hx - dx * 9 * scale + sx * side * 9 * scale, hy - dy * 9 * scale + sy * side * 9 * scale, 0.65, 4);
      this.put(hx - dx * scale + sx * side * 4 * scale, hy - dy * scale + sy * side * 4 * scale, 'o', 0.9, 3);
    }
    this.put(hx + dx * 8 * scale, hy + dy * 8 * scale, 'x', 0.3, 7);
    // An unobtrusive copper selection mark makes the dog easy to pick out.
    this.put(d.x - 10, d.y - 25 * scale, '[', 0.5, 4);
    this.put(d.x + 10, d.y - 25 * scale, ']', 0.5, 4);
  }
  private bird(b: Bird) {
    const w = this.world, scale = w.scale, flying = b.state !== 'landed';
    const x = b.x, y = b.y - b.altitude * 28 * scale;
    const dx = Math.cos(b.heading), dy = Math.sin(b.heading), sx = -dy, sy = dx;
    const family = 9 + b.color, priority = flying ? 5 : 1;
    const dot = (along: number, side: number, glyph: string, level = 0.9, ink = family) => this.put(x + (dx * along + sx * side) * scale, y + (dy * along + sy * side) * scale, glyph, level, ink, priority);
    if (!flying) {
      dot(-2, -6, '.', 0.8, 5); dot(-2, 6, '.', 0.8, 5);
    }
    dot(-5, 0, '%'); dot(0, 0, '#'); dot(1, -4, ':', 0.7); dot(1, 4, ':', 0.7);
    const peck = flying ? 0 : Math.max(0, Math.sin(w.time * 3 + b.phase)) * 3;
    dot(8 + peck, 0, 'o', 0.96); dot(13 + peck, 0, dx < 0 ? '<' : '>', 0.9, 11);
    dot(-12, 0, '~', 0.7); dot(-17, 0, '-', 0.5);
    if (flying) {
      const flap = Math.sin(w.time * 19 + b.phase), span = 7 + Math.abs(flap) * 13;
      for (const side of [-1, 1]) for (let j = 1; j <= 3; j++) {
        dot(-j * 2, side * span * j / 3, lineGlyph(sx * side * span - dx * 6, sy * side * span - dy * 6), 1 - j * 0.09);
      }
    }
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
  private barkRipple(bark: Bark) {
    const { x, y, age } = bark;
    if (age >= BARK_LIFETIME) return;
    const p = this.world.pasture, t = Math.min(1, age / BARK_TRAVEL_TIME), radius = barkRadius(bark), band = p.cellW * 0.65;
    const fade = age <= BARK_TRAVEL_TIME ? 1 : Math.max(0, 1 - (age - BARK_TRAVEL_TIME) / BARK_FADE_TIME);
    for (let r = Math.max(0, Math.floor((y - radius - band) / p.cellH)); r <= Math.min(p.rows - 1, Math.ceil((y + radius + band) / p.cellH)); r++) {
      for (let c = Math.max(0, Math.floor((x - radius - band) / p.cellW)); c <= Math.min(p.cols - 1, Math.ceil((x + radius + band) / p.cellW)); c++) {
        const px = (c + 0.5) * p.cellW, py = (r + 0.5) * p.cellH, dx = px - x, dy = py - y;
        const off = Math.abs(Math.hypot(dx, dy) - radius);
        // Thin, broken and softly colored, but visible from the very first frame.
        if (off < band && this.texture[r * p.cols + c] > 0.42) this.put(px, py, lineGlyph(-dy, dx), (0.3 - t * 0.09) * fade * (1 - off / band), 5);
      }
    }
  }
  private pen() {
    const w = this.world, p = w.pasture, b = w.pen;
    const left = Math.floor(b.left / p.cellW) * p.cellW + p.cellW / 2;
    const right = Math.floor(b.right / p.cellW) * p.cellW + p.cellW / 2;
    const top = Math.floor(b.top / p.cellH) * p.cellH + p.cellH / 2;
    const bottom = Math.floor(b.bottom / p.cellH) * p.cellH + p.cellH / 2;
    for (let x = left; x <= right; x += p.cellW) {
      const post = Math.round((x - left) / p.cellW) % 4 === 0 || x === right;
      this.put(x, top, post ? '+' : '-', 0.85, 7);
      this.put(x, bottom, post ? '+' : '-', 0.85, 7);
    }
    for (let y = top + p.cellH; y < bottom; y += p.cellH) {
      this.put(right, y, '|', 0.85, 7);
      // A small open gate faces into the pasture.
      if (Math.abs(y - w.home.y) > p.cellH * 1.2) this.put(left, y, '|', 0.85, 7);
    }
  }
  private sleep() {
    const w = this.world, d = w.dog; if (!d?.sleeping) return;
    const x = d.x + 16 * w.scale;
    const y = d.y - 25 * w.scale;
    for (let j = 0; j < 3; j++) {
      const phase = (w.time * 0.32 + j / 3) % 1;
      this.put(x + phase * 18, y - phase * 32 * w.scale, j === 2 ? 'Z' : 'z', (1 - phase) * 0.7, 3);
    }
  }
  render() {
    const w = this.world, p = w.pasture, { cellW: cw, cellH: ch, cols, rows } = p, ctx = this.ctx;
    this.priority.fill(0);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, grass = p.grass[i], texture = this.texture[i];
      const wind = Math.sin(c * 0.07 + r * 0.047 - w.time * 0.45) * 0.55 + Math.sin(r * 0.13 - w.time * 0.28) * 0.3;
      const remaining = clamp(grass / Math.max(0.1, p.capacity[i]), 0, 1);
      const ink = grassAppearance(remaining, texture, wind);
      let { glyph, family, level } = ink;
      if (p.flower[i] >= 0 && remaining > 0.95) { glyph = p.flower[i] > 0.5 ? '*' : '+'; family = p.flower[i] > 0.7 ? 3 : 5; level = 0.45 + texture * 0.25; }
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
        this.put(f.x + Math.cos(angle) * radius, f.y + Math.sin(angle) * radius, j % 3 === 0 ? 'o' : '.', 0.74, 5);
      }
    }
    if (w.marker) {
      const m = w.marker, radius = 6 + Math.min(m.age, 0.3) * 32;
      this.ring(m.x, m.y, radius, Math.max(0, 0.9 - m.age * 0.65), 0);
      this.put(m.x, m.y, '+', Math.max(0, 0.8 - m.age * 0.5), 0);
    }
    for (const bark of w.barks) this.barkRipple(bark);
    this.pen();
    for (const b of w.birds) if (b.state === 'landed') this.bird(b);
    const animals = w.animals;
    for (const s of animals) this.sheep(s);
    this.dog();
    // Faces and ears always survive another animal's wool.
    for (const s of animals) this.sheep(s, true);
    this.sleep();
    for (const b of w.birds) if (b.state !== 'landed') this.bird(b);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = BG; if (this.repaintAll) ctx.fillRect(0, 0, w.width, w.height); ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < this.codes.length; i++) {
      // Retain unchanged grass pixels. Snap cell edges to device pixels so erasing
      // moving creatures leaves exactly the same surface as a complete redraw.
      if (!this.repaintAll && this.codes[i] === this.previousCodes[i] && this.levels[i] === this.previousLevels[i] && this.family[i] === this.previousFamily[i]) continue;
      const col = i % cols, row = Math.floor(i / cols), d = this.dpr;
      const x = Math.round(col * cw * d) / d, y = Math.round(row * ch * d) / d;
      const width = Math.round((col + 1) * cw * d) / d - x, height = Math.round((row + 1) * ch * d) / d - y;
      if (!this.repaintAll) ctx.fillRect(x, y, width, height);
      ctx.drawImage(this.atlas, this.codes[i] * this.aw, (this.family[i] * 32 + this.levels[i]) * this.ah, this.aw, this.ah, x, y, width, height);
    }
    this.previousCodes.set(this.codes); this.previousLevels.set(this.levels); this.previousFamily.set(this.family); this.repaintAll = false;
  }
}
