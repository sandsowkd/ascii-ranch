import { clamp, hash3, lineGlyph } from '../vendor/pond-math';
import { DENSITY_GLYPHS, grassAppearance } from './grass';
import type { Bird } from '../simulation/Birds';
import type { Mouse } from '../simulation/Mice';
import { hawkPose, hawkWingAt } from './raptor';
import { gateLeaf } from '../simulation/fence';
import { BARK_TRAVEL_TIME, BARK_FADE_TIME, BARK_LIFETIME, barkRadius, type Bark } from '../simulation/bark';
import type { Sheep, World } from '../simulation/World';

/** Pond's density ramp, local ink and cached font, adapted into a living pasture.
 * Math helpers and density ramp derive from stqfdyr/ascii-pond (MIT).
 * Copyright (c) 2026 stqfdyr; public/licenses/ascii-pond-MIT.txt. */

const GLYPHS = " tSX" + ".,:;'`|/\\v!+*ox@O%#8-=~^<>()[]zZY_WFH";
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
    this.atlas.width = this.aw * this.atlasCols; this.atlas.height = this.ah * 32 * 14;
    const ctx = this.atlas.getContext('2d')!;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `400 ${this.ah * 0.82}px "Geist Mono", monospace`;
    const lows = [[48, 72, 35], [28, 24, 16], [126, 128, 105], [114, 120, 97], [99, 73, 43], [69, 69, 51], [32, 51, 29], [86, 47, 26], [28, 28, 27], [40, 111, 126], [138, 66, 74], [144, 113, 42], [190, 103, 138], [67, 72, 76]];
    const highs = [[149, 182, 100], [75, 59, 34], [248, 243, 219], [255, 255, 245], [230, 182, 115], [229, 208, 136], [84, 123, 54], [207, 139, 79], [88, 84, 76], [116, 222, 218], [245, 153, 135], [246, 209, 107], [255, 192, 207], [193, 197, 201]];
    for (let family = 0; family < lows.length; family++) for (let level = 0; level < 32; level++) {
      const t = level / 31, lo = lows[family], hi = highs[family];
      ctx.fillStyle = `rgb(${Math.round(lo[0] + (hi[0] - lo[0]) * t)},${Math.round(lo[1] + (hi[1] - lo[1]) * t)},${Math.round(lo[2] + (hi[2] - lo[2]) * t)})`;
      for (let g = 0; g < GLYPHS.length; g++) {
        const eye = family === 3 && GLYPHS[g] === 'O', outline = family === 3 && '/\\|-()'.includes(GLYPHS[g]);
        const timber = family === 7 && '-=|/\\'.includes(GLYPHS[g]);
        const pinkTail = family === 12;
        ctx.font = `${timber ? 700 : eye ? 500 : outline || pinkTail ? 600 : 400} ${this.ah * (eye ? 0.98 : outline || pinkTail ? 0.92 : timber ? 0.94 : 0.82)}px "Geist Mono", monospace`;
        // Tiny vertical stems can have very little ink at 1× resolution. A
        // fractional stroke keeps the wood brown and legible in a single cell.
        if (timber || pinkTail) {
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = this.dpr * (pinkTail ? 0.25 : 0.8);
          ctx.strokeText(GLYPHS[g], g * this.aw + this.aw / 2, (family * 32 + level) * this.ah + this.ah / 2 + this.dpr * 0.35);
        }
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
    const headScale = scale * 0.8;
    const hx = s.x + dx * (rx + 11 * headScale + nibble), hy = s.y + dy * (rx + 11 * headScale + nibble);
    // One closed silhouette joins the face and floppy ears. A full cell of white
    // around the dark interior stays continuous even on the smaller character grid.
    const shape = (x: number, y: number) => {
      const ox = x - hx, oy = y - hy, along = (ox * dx + oy * dy) / headScale, side = Math.abs((ox * sx + oy * sy) / headScale);
      const face = (along / 16) ** 2 + (side / 14) ** 2 - 1;
      const ear = ((along + 8 + (side - 14) * 0.35) / 6) ** 2 + ((side - 20) / 8) ** 2 - 1;
      return Math.min(face, ear);
    };
    const headR = 33 * headScale;
    for (let r = Math.floor((hy - headR) / p.cellH); r <= Math.ceil((hy + headR) / p.cellH); r++) for (let c = Math.floor((hx - headR) / p.cellW); c <= Math.ceil((hx + headR) / p.cellW); c++) {
      const x = (c + 0.5) * p.cellW, y = (r + 0.5) * p.cellH;
      if (shape(x, y) > 0) continue;
      const rim = shape(x - p.cellW, y) > 0 || shape(x + p.cellW, y) > 0 || shape(x, y - p.cellH) > 0 || shape(x, y + p.cellH) > 0;
      const nx = shape(x + p.cellW * 0.3, y) - shape(x - p.cellW * 0.3, y);
      const ny = shape(x, y + p.cellH * 0.3) - shape(x, y - p.cellH * 0.3);
      this.put(x, y, rim ? lineGlyph(-ny, nx) : ':', rim ? 1 : 0.32, rim ? 3 : 8, rim ? 3 : 2);
    }
    for (const side of [-1, 1]) {
      this.put(hx - dx * 12.5 * headScale + sx * side * 26.5 * headScale, hy - dy * 12.5 * headScale + sy * side * 26.5 * headScale, side < 0 ? '(' : ')', 1, 3, 3);
      this.put(hx - dx * 3 * headScale + sx * side * 7.5 * headScale, hy - dy * 3 * headScale + sy * side * 7.5 * headScale, 'O', 1, 3, 4);
    }
    // Woolly forelock, two nostrils and a split lip distinguish the long sheep muzzle.
    this.put(hx - dx * 12 * headScale, hy - dy * 12 * headScale, '@', 0.95, 2, 3);
    for (const side of [-1, 1]) this.put(hx + dx * 9 * headScale + sx * side * 3 * headScale, hy + dy * 9 * headScale + sy * side * 3 * headScale, '.', 0.35, 8, 3);
    this.put(hx + dx * 14 * headScale, hy + dy * 14 * headScale, 'Y', 0.88, 2, 3);

  }
  private stroke(x1: number, y1: number, x2: number, y2: number, level: number, family: number, priority = 0) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (this.world.pasture.cellW * 0.7)));
    const glyph = lineGlyph(x2 - x1, y2 - y1);
    for (let i = 0; i <= steps; i++) this.put(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps, glyph, level, family, priority);
  }
  private dog() {
    const w = this.world, d = w.dog;
    if (!d) return;
    const p = w.pasture, scale = w.scale, dx = Math.cos(d.heading), dy = Math.sin(d.heading), sx = -dy, sy = dx;
    const rx = 22 * scale, ry = 11.5 * scale, speed = Math.hypot(d.vx, d.vy);
    // The near paws drop vertically below the rotated coat. The far pair is hidden.
    // Keeping each stroke at one x coordinate prevents sideways legs at every heading.
    const extentX = Math.hypot(rx * dx, ry * sx);
    const bodyA = dx * dx / (rx * rx) + sx * sx / (ry * ry);
    const bodyB = dx * dy / (rx * rx) + sx * sy / (ry * ry);
    const bodyC = dy * dy / (rx * rx) + sy * sy / (ry * ry);
    for (const side of [-1, 1]) {
      const offsetX = side * extentX * 0.52;
      const edgeY = d.y + (-bodyB * offsetX + Math.sqrt(Math.max(0, bodyC - (bodyA * bodyC - bodyB * bodyB) * offsetX * offsetX))) / bodyC;
      const stride = Math.sin(w.time * (d.sprint > 0 || d.launching ? 25 : 18) + (side < 0 ? Math.PI : 0));
      const lift = speed > 3 ? Math.max(0, stride) * 2 * scale : 0;
      const pawX = d.x + offsetX, pawY = edgeY + 5.5 * scale - lift;
      this.stroke(pawX, edgeY - 3 * scale, pawX, pawY, 0.6, 4);
      this.put(pawX, pawY, '.', 0.55, 3);
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
    const hx = d.x + dx * (rx + 4 * scale), hy = d.y + dy * (rx + 4 * scale);
    const face = (x: number, y: number) => {
      const along = ((x - hx) * dx + (y - hy) * dy) / scale, side = ((x - hx) * sx + (y - hy) * sy) / scale;
      return (along / 14) ** 2 + (side / (11 - Math.max(0, along) * 0.18)) ** 2;
    };
    for (let r = Math.floor((hy - 18 * scale) / p.cellH); r <= Math.ceil((hy + 18 * scale) / p.cellH); r++) for (let c = Math.floor((hx - 18 * scale) / p.cellW); c <= Math.ceil((hx + 18 * scale) / p.cellW); c++) {
      const x = (c + 0.5) * p.cellW, y = (r + 0.5) * p.cellH;
      if (face(x, y) > 1) continue;
      const along = ((x - hx) * dx + (y - hy) * dy) / scale, side = ((x - hx) * sx + (y - hy) * sy) / scale;
      const rim = face(x - p.cellW, y) > 1 || face(x + p.cellW, y) > 1 || face(x, y - p.cellH) > 1 || face(x, y + p.cellH) > 1;
      const nx = face(x + p.cellW * 0.3, y) - face(x - p.cellW * 0.3, y), ny = face(x, y + p.cellH * 0.3) - face(x, y - p.cellH * 0.3);
      const blaze = Math.abs(side) < 3.5 || along > 7;
      this.put(x, y, rim ? lineGlyph(-ny, nx) : blaze ? ':' : '%', rim ? 1 : blaze ? 0.95 : 0.8, rim ? 3 : blaze ? 2 : 4, 3);
    }
    for (const side of [-1, 1]) {
      this.put(hx - dx * 9 * scale + sx * side * 13 * scale, hy - dy * 9 * scale + sy * side * 13 * scale, side < 0 ? '(' : ')', 0.9, 4, 3);
      this.put(hx - dx * 2 * scale + sx * side * 6.5 * scale, hy - dy * 2 * scale + sy * side * 6.5 * scale, 'O', 1, 3, 4);
      this.put(hx + dx * 10 * scale + sx * side * 3.5 * scale, hy + dy * 10 * scale + sy * side * 3.5 * scale, 'o', 0.9, 2, 3);
    }
    this.put(hx + dx * 13 * scale, hy + dy * 13 * scale, '@', 0.85, 8, 4);
    const barking = (d.barkAge ?? 99) < 0.36;
    this.put(hx + dx * 17 * scale, hy + dy * 17 * scale, barking ? 'O' : lineGlyph(sx, sy), barking ? 1 : 0.7, 3, 4);
    if (barking) this.put(hx + dx * 20 * scale, hy + dy * 20 * scale, 'v', 0.95, 2, 3);
  }
  private bird(b: Bird) {
    if (b.kind === 'hawk') { this.hawk(b); return; }
    const w = this.world, p = w.pasture, scale = w.scale, flying = b.state !== 'landed';
    const x = b.x, y = b.y - b.altitude * 28 * scale, family = 9 + b.color;
    if (!flying) {
      // A fixed side profile on the ground: head, beak, folded wing, tail and feet.
      const facing = Math.cos(b.heading) < 0 ? -1 : 1;
      const mirror: Record<string, string> = { '/': '\\', '\\': '/', '<': '>', '>': '<', '(': ')', ')': '(' };
      const sprite = ['    __ ', '   /o_>', '  /%%) ', '<(%##) ', '  | |  '];
      const perch = b.perchId === undefined ? undefined : w.fencePosts[b.perchId];
      const anchorX = (Math.floor((perch?.x ?? x) / p.cellW) + 0.5) * p.cellW;
      const anchorRow = perch ? Math.floor(perch.y / p.cellH) - 2 : Math.floor(b.y / p.cellH);
      const anchorY = (anchorRow + 0.5) * p.cellH;
      for (let row = 0; row < sprite.length; row++) for (let col = 0; col < sprite[row].length; col++) {
        let glyph = sprite[row][col]; if (glyph === ' ') continue;
        const eye = row === 1 && col === 4, beak = row === 1 && col === 6, feet = row === 4;
        if (facing < 0) glyph = mirror[glyph] ?? glyph;
        // The body's center and the midpoint of its two bright legs share the
        // anchor, including after mirroring. Landed birds stay above other ink.
        this.put(anchorX + (col - 3) * p.cellW * facing, anchorY + (row - 4) * p.cellH, glyph, eye || feet ? 1 : 0.92, eye || feet ? 3 : beak ? 11 : family, 8);
      }
      return;
    }
    const dx = Math.cos(b.heading), dy = Math.sin(b.heading), sx = -dy, sy = dx;
    const flap = Math.sin(w.time * 19 + b.phase), span = (12 + Math.abs(flap) * 15) * scale;
    const radius = 33 * scale;
    // Filled tapering wings retain a broad shoulder instead of a single skinny line.
    for (let row = Math.floor((y - radius) / p.cellH); row <= Math.ceil((y + radius) / p.cellH); row++) for (let col = Math.floor((x - radius) / p.cellW); col <= Math.ceil((x + radius) / p.cellW); col++) {
      const px = (col + 0.5) * p.cellW, py = (row + 0.5) * p.cellH, ox = px - x, oy = py - y;
      const along = ox * dx + oy * dy, side = Math.abs(ox * sx + oy * sy), t = side / span;
      const center = (-2 - t * 7 - flap * t * 2) * scale, halfWidth = (8 * (1 - t) + 2) * scale;
      if (side < 3 * scale || t > 1 || Math.abs(along - center) > halfWidth) continue;
      this.put(px, py, t < 0.6 ? '%' : lineGlyph(sx, sy), 0.95 - t * 0.2, family, 5);
    }
    const dot = (along: number, side: number, glyph: string, level = 0.9, ink = family) => this.put(x + (dx * along + sx * side) * scale, y + (dy * along + sy * side) * scale, glyph, level, ink, 5);
    dot(-5, 0, '%'); dot(0, 0, '#'); dot(1, -4, ':', 0.7); dot(1, 4, ':', 0.7);
    dot(8, 0, 'o', 0.96, 3); dot(13, 0, dx < 0 ? '<' : '>', 0.9, 11);
    dot(-12, 0, '~', 0.7); dot(-17, 0, '-', 0.5);
  }
  private mouse(m: Mouse) {
    const w = this.world, p = w.pasture, scale = w.scale * 0.7, dx = Math.cos(m.heading), dy = Math.sin(m.heading), sx = -dy, sy = dx;
    const dot = (along: number, side: number, glyph: string, family: number, level: number) => this.put(m.x + (dx * along + sx * side) * scale, m.y + (dy * along + sy * side) * scale, glyph, level, family);
    const wiggle = Math.sin(w.time * 13 + m.phase) * (m.state === 'darting' ? 1.8 : 0.4);
    // A short pink tail joins a rounded body; the face has its own closed rim.
    dot(-21, wiggle + 1, '~', 12, 0.85); dot(-14, 0, '~', 12, 0.85);
    for (let row = Math.floor((m.y - 22 * scale) / p.cellH); row <= Math.ceil((m.y + 22 * scale) / p.cellH); row++) for (let col = Math.floor((m.x - 22 * scale) / p.cellW); col <= Math.ceil((m.x + 22 * scale) / p.cellW); col++) {
      const x = (col + 0.5) * p.cellW, y = (row + 0.5) * p.cellH, ox = (x - m.x) / scale, oy = (y - m.y) / scale;
      const along = ox * dx + oy * dy, side = ox * sx + oy * sy;
      const body = ((along + 5) / 10) ** 2 + (side / 7.5) ** 2;
      const head = ((along - 7) / 9) ** 2 + (side / 6.5) ** 2;
      if (body <= 1) this.put(x, y, body > 0.65 ? ':' : '#', 0.88, 13);
      if (head <= 1) this.put(x, y, head > 0.55 ? lineGlyph(-side, along - 7) : '%', head > 0.55 ? 1 : 0.82, 13);
    }
    for (const side of [-1, 1]) {
      dot(14, side * 7, side < 0 ? '/' : '\\', 13, 0.8);
      dot(-7, side * 7, '.', 13, 0.7);
    }
    for (const side of [-1, 1]) { dot(1, side * 10, 'o', 13, 1); dot(10, side * 4, '.', 3, 0.9); }
    dot(17, 0, '.', 12, 1);
  }
  private hawk(b: Bird) {
    const w = this.world, p = w.pasture, scale = w.scale, x = b.x, y = b.y - b.altitude * 28 * scale;
    const dx = Math.cos(b.heading), dy = Math.sin(b.heading), sx = -dy, sy = dx, pose = hawkPose(w.time, b);
    const bank = b.state === 'circling' ? (b.hunt?.direction ?? 1) * 0.7 : 0, radius = 57 * scale;
    for (let row = Math.floor((y - radius) / p.cellH); row <= Math.ceil((y + radius) / p.cellH); row++) for (let col = Math.floor((x - radius) / p.cellW); col <= Math.ceil((x + radius) / p.cellW); col++) {
      const px = (col + 0.5) * p.cellW, py = (row + 0.5) * p.cellH, ox = (px - x) / scale, oy = (py - y) / scale;
      const along = ox * dx + oy * dy, side = ox * sx + oy * sy, wing = hawkWingAt(along, side, pose, bank);
      if (!wing) continue;
      this.put(px, py, wing.feather ? lineGlyph(dx - sx * Math.sign(side) * 0.3, dy - sy * Math.sign(side) * 0.3) : wing.covert ? '%' : '=', wing.feather ? 0.96 : 0.85, wing.covert ? 4 : 7, 5);
    }
    const dot = (along: number, side: number, glyph: string, ink = 4, level = 0.95) => this.put(x + (dx * along + sx * side) * scale, y + (dy * along + sy * side) * scale, glyph, level, ink, 5);
    // A compact body and fanned russet tail anchor the articulated wings.
    for (let along = -13; along <= 10; along += 4) for (const side of [-3, 0, 3]) dot(along, side, '%', 7, 0.96);
    for (const side of [-1, 0, 1]) for (const along of [-17, -22]) dot(along, side * (along === -22 ? 7 : 4), side < 0 ? '/' : side > 0 ? '\\' : '|', 7);
    dot(12, 0, '@', 2); dot(14, -4, 'o', 3); dot(14, 4, 'o', 3); dot(21, 0, dx < 0 ? '<' : '>', 11);
    const feetOut = b.state === 'striking' || b.state === 'swooping' && b.altitude < 0.55 || b.caughtMouse;
    if (feetOut) {
      for (const side of [-1, 1]) { dot(7, side * 6, '/', 11); dot(13, side * 7, 'v', 11); }
    }
    if (b.caughtMouse) { dot(10, 8, 'o', 2, 0.75); dot(4, 10, '~', 12); }
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
    for (const rail of [...w.fieldFences.rails, ...w.fence.rails]) this.woodRail(rail.a, rail.b, 0.9, 2);
    const door = gateLeaf(b, w.gateOpen), dx = door.b.x - door.a.x, dy = door.b.y - door.a.y;
    const length = Math.hypot(dx, dy), nx = dy / length, ny = -dx / length;
    this.woodRail(door.a, door.b, 0.9, 2);
    for (const t of [0.25, 0.5, 0.75]) {
      const x = door.a.x + dx * t, y = door.a.y + dy * t;
      this.stroke(x - nx * p.cellW, y - ny * p.cellW, x + nx * p.cellW, y + ny * p.cellW, 0.85, 7, 2);
    }
    this.put(door.b.x - dx * 0.12, door.b.y - dy * 0.12, 'o', 0.95, 5, 3);
    for (const post of w.fencePosts) {
      const c = Math.floor(post.x / p.cellW), r = Math.floor(post.y / p.cellH);
      for (const dy of [-1, 0]) for (const dx of [-1, 0, 1]) this.put((c + dx + 0.5) * p.cellW, (r + dy + 0.5) * p.cellH, dx === 0 ? '#' : dx < 0 ? '[' : ']', dx === 0 ? 0.95 : 0.75, 5, 3);
    }
  }
  private woodRail(a: { x: number; y: number }, b: { x: number; y: number }, level: number, priority: number, family = 7, wide = false) {
    const p = this.world.pasture, dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const glyph = Math.abs(dx) > Math.abs(dy) * 2 ? '=' : lineGlyph(dx, dy);
    const steps = Math.max(1, Math.ceil(length / (Math.min(p.cellW, p.cellH) * 0.45)));
    // Dense sampling covers every row of a vertical rail. The draft has a
    // two-cell brush, rather than gaps that disappear between grass glyphs.
    for (let j = 0; j <= steps; j++) for (const offset of wide ? [-0.55, 0, 0.55] : [0]) {
      const x = a.x + dx * j / steps - dy / length * offset * p.cellW, y = a.y + dy * j / steps + dx / length * offset * p.cellH;
      this.put(x, y, glyph, level, family, priority);
    }
  }
  private fencePreview() {
    const draft = this.world.fencePreview; if (!draft) return;
    const { a, b } = draft, family = draft.valid ? 7 : 10;
    this.woodRail(a, b, 1, 9, family, true);
    for (const p of [a, b]) this.put(p.x, p.y, '+', 1, family, 9);
  }
  private barkComic() {
    const w = this.world, d = w.dog, age = d?.barkAge ?? 99;
    if (!d || age > 0.72) return;
    const scale = w.scale, p = w.pasture, dx = Math.cos(d.heading), dy = Math.sin(d.heading);
    const pop = 0.85 + Math.min(1, age / 0.07) * 0.15, fade = Math.min(1, (0.72 - age) / 0.2);
    const x = clamp(d.x + dx * 83 * scale, 40 * scale, w.width - 40 * scale), y = clamp(d.y + dy * 76 * scale - age * 13 * scale, 105, w.height - 155);
    for (let j = 0; j < 16; j++) {
      const a = j * Math.PI / 8, long = j % 2 === 0;
      this.put(x + Math.cos(a) * (long ? 35 : 29) * scale * pop, y + Math.sin(a) * (long ? 23 : 16) * scale * pop, lineGlyph(Math.cos(a), Math.sin(a)), 0.9 * fade, 5, 6);
    }
    const cx = (Math.floor(x / p.cellW) + 0.5) * p.cellW, cy = (Math.floor(y / p.cellH) + 0.5) * p.cellH;
    for (let i = 0; i < 5; i++) this.put(cx + (i - 2) * p.cellW, cy, 'WOOF!'[i], fade, 3, 7);
    this.put(d.x + dx * 54 * scale, d.y + dy * 54 * scale, '!', 0.85 * fade, 5, 6);
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
    for (const mouse of w.mice) this.mouse(mouse);
    this.pen();
    const animals = w.animals;
    for (const s of animals) this.sheep(s);
    this.dog();
    // Faces and ears always survive another animal's wool.
    for (const s of animals) this.sheep(s, true);
    this.sleep();
    this.barkComic();
    for (const b of w.birds) if (b.state !== 'landed') this.bird(b);
    // Both legs survive grass, animals and effects; perched visitors draw last.
    for (const b of w.birds) if (b.state === 'landed' && b.perchId === undefined) this.bird(b);
    for (const b of w.birds) if (b.state === 'landed' && b.perchId !== undefined) this.bird(b);
    this.fencePreview();
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
