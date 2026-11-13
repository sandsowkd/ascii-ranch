import { clamp, hash3 } from '../vendor/pond-math';

/** Every visible grass cell really grows and can be eaten or flattened. */
export class Pasture {
  cols = 0; rows = 0; cellW = 8; cellH = 10;
  grass = new Float32Array(0); capacity = new Float32Array(0);
  trampled = new Float32Array(0); soil = new Float32Array(0); flower = new Float32Array(0);
  private growthClock = 0;
  constructor(public width: number, public height: number) { this.resize(width, height, false); }
  resize(width: number, height: number, preserve = true) {
    const old = this.grass, oldCols = this.cols, oldRows = this.rows;
    this.width = width; this.height = height;
    this.cellW = width < 600 ? 6 : width > 1700 ? 9 : 8;
    this.cellH = this.cellW + 2;
    this.cols = Math.ceil(width / this.cellW); this.rows = Math.ceil(height / this.cellH);
    const n = this.cols * this.rows;
    this.grass = new Float32Array(n); this.capacity = new Float32Array(n);
    this.trampled = new Float32Array(n); this.soil = new Float32Array(n); this.flower = new Float32Array(n);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c;
      // Every cell begins as equally edible grass; texture lives in the glyphs.
      this.capacity[i] = 1; this.grass[i] = 1;
      this.flower[i] = hash3(c, r, 231) > 0.996 ? hash3(c, r, 71) : -1;
      if (preserve && oldCols && oldRows) {
        const from = Math.min(oldRows - 1, Math.floor(r / this.rows * oldRows)) * oldCols + Math.min(oldCols - 1, Math.floor(c / this.cols * oldCols));
        this.grass[i] = Math.min(this.capacity[i], old[from]);
      }
    }
  }
  index(x: number, y: number) {
    return clamp(Math.floor(y / this.cellH), 0, this.rows - 1) * this.cols + clamp(Math.floor(x / this.cellW), 0, this.cols - 1);
  }
  at(x: number, y: number) { return this.grass[this.index(x, y)]; }
  bite(x: number, y: number, dt: number, radius = 18) {
    let eaten = 0;
    for (let r = Math.max(0, Math.floor((y - radius) / this.cellH)); r <= Math.min(this.rows - 1, Math.floor((y + radius) / this.cellH)); r++) {
      for (let c = Math.max(0, Math.floor((x - radius) / this.cellW)); c <= Math.min(this.cols - 1, Math.floor((x + radius) / this.cellW)); c++) {
        const d = Math.hypot((c + 0.5) * this.cellW - x, (r + 0.5) * this.cellH - y);
        if (d >= radius) continue;
        const i = r * this.cols + c, amount = Math.min(this.grass[i], dt * 0.055 * (1 - d / radius));
        this.grass[i] -= amount; eaten += amount;
      }
    }
    return eaten;
  }
  regrow(x: number, y: number, radius = 34) {
    for (let r = Math.max(0, Math.floor((y - radius) / this.cellH)); r <= Math.min(this.rows - 1, Math.floor((y + radius) / this.cellH)); r++) {
      for (let c = Math.max(0, Math.floor((x - radius) / this.cellW)); c <= Math.min(this.cols - 1, Math.floor((x + radius) / this.cellW)); c++) {
        if (Math.hypot((c + 0.5) * this.cellW - x, (r + 0.5) * this.cellH - y) > radius) continue;
        const i = r * this.cols + c;
        this.grass[i] = this.capacity[i]; this.trampled[i] = 0;
      }
    }
  }
  tread(x: number, y: number, amount: number, radius = 23) {
    for (let r = Math.max(0, Math.floor((y - radius) / this.cellH)); r <= Math.min(this.rows - 1, Math.floor((y + radius) / this.cellH)); r++) {
      for (let c = Math.max(0, Math.floor((x - radius) / this.cellW)); c <= Math.min(this.cols - 1, Math.floor((x + radius) / this.cellW)); c++) {
        const d = Math.hypot((c + 0.5) * this.cellW - x, (r + 0.5) * this.cellH - y);
        if (d < radius) { const i = r * this.cols + c; this.trampled[i] = Math.min(1, this.trampled[i] + amount * (1 - d / radius)); }
      }
    }
  }
  step(dt: number) {
    this.growthClock += dt;
    if (this.growthClock < 0.15) return;
    const elapsed = this.growthClock; this.growthClock = 0;
    const decay = Math.exp(-elapsed * 0.65);
    for (let i = 0; i < this.grass.length; i++) {
      this.grass[i] = Math.min(this.capacity[i], this.grass[i] + elapsed * 0.0045 * (0.7 + this.capacity[i] * 0.3));
      this.trampled[i] *= decay;
    }
  }
}
