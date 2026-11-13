import { clamp, hash3 } from '../vendor/pond-math';

/** Every visible grass cell really grows and can be eaten or flattened. */
export class Pasture {
  cols = 0; rows = 0; cellW = 8; cellH = 10;
  grass = new Float32Array(0); capacity = new Float32Array(0);
  trampled = new Float32Array(0); soil = new Float32Array(0); flower = new Float32Array(0);
  cropped = new Uint8Array(0); recoverIn = new Float32Array(0);
  private growthClock = 0;
  constructor(public width: number, public height: number) { this.resize(width, height, false); }
  resize(width: number, height: number, preserve = true) {
    const old = this.grass, oldCropped = this.cropped, oldRecovery = this.recoverIn, oldTread = this.trampled, oldCols = this.cols, oldRows = this.rows;
    this.width = width; this.height = height;
    const base = width < 600 ? 6 : width > 1700 ? 9 : 8;
    this.cellW = base * 2 / 3; this.cellH = (base + 2) * 2 / 3;
    this.cols = Math.ceil(width / this.cellW); this.rows = Math.ceil(height / this.cellH);
    const n = this.cols * this.rows;
    this.grass = new Float32Array(n); this.capacity = new Float32Array(n);
    this.cropped = new Uint8Array(n); this.recoverIn = new Float32Array(n);
    this.trampled = new Float32Array(n); this.soil = new Float32Array(n); this.flower = new Float32Array(n);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c;
      // Every cell begins as equally edible grass; texture lives in the glyphs.
      this.capacity[i] = 1; this.grass[i] = 1;
      this.flower[i] = hash3(c, r, 231) > 0.996 ? hash3(c, r, 71) : -1;
      if (preserve && oldCols && oldRows) {
        const from = Math.min(oldRows - 1, Math.floor(r / this.rows * oldRows)) * oldCols + Math.min(oldCols - 1, Math.floor(c / this.cols * oldCols));
        this.grass[i] = Math.min(this.capacity[i], old[from]);
        this.cropped[i] = oldCropped[from]; this.recoverIn[i] = oldRecovery[from]; this.trampled[i] = oldTread[from];
      }
    }
  }
  index(x: number, y: number) {
    return clamp(Math.floor(y / this.cellH), 0, this.rows - 1) * this.cols + clamp(Math.floor(x / this.cellW), 0, this.cols - 1);
  }
  at(x: number, y: number) { return this.grass[this.index(x, y)]; }
  edibleAt(x: number, y: number) {
    const i = this.index(x, y); return this.cropped[i] && this.grass[i] < 0.7 ? 0 : this.grass[i];
  }
  patchQuality(x: number, y: number, radius = 24) {
    let sum = this.edibleAt(x, y) * 2;
    for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; sum += this.edibleAt(x + Math.cos(a) * radius, y + Math.sin(a) * radius); }
    return sum / 10;
  }
  bite(x: number, y: number, dt: number, radius = 18) {
    let eaten = 0;
    for (let r = Math.max(0, Math.floor((y - radius) / this.cellH)); r <= Math.min(this.rows - 1, Math.floor((y + radius) / this.cellH)); r++) {
      for (let c = Math.max(0, Math.floor((x - radius) / this.cellW)); c <= Math.min(this.cols - 1, Math.floor((x + radius) / this.cellW)); c++) {
        const d = Math.hypot((c + 0.5) * this.cellW - x, (r + 0.5) * this.cellH - y);
        if (d >= radius) continue;
        const i = r * this.cols + c;
        if (this.cropped[i] && this.grass[i] < 0.7) continue;
        const amount = Math.min(this.grass[i], dt * 0.055 * (1 - d / radius));
        this.grass[i] -= amount; eaten += amount;
        if (this.grass[i] < 0.9) {
          // A cut plant rests, then grows continuously through visible stages.
          eaten += this.grass[i]; this.grass[i] = 0; this.cropped[i] = 1;
          this.recoverIn[i] = 68 + hash3(c, r, 47) * 8;
        }
      }
    }
    return eaten;
  }
  regrow(x: number, y: number, radius = 34) {
    for (let r = Math.max(0, Math.floor((y - radius) / this.cellH)); r <= Math.min(this.rows - 1, Math.floor((y + radius) / this.cellH)); r++) {
      for (let c = Math.max(0, Math.floor((x - radius) / this.cellW)); c <= Math.min(this.cols - 1, Math.floor((x + radius) / this.cellW)); c++) {
        if (Math.hypot((c + 0.5) * this.cellW - x, (r + 0.5) * this.cellH - y) > radius) continue;
        const i = r * this.cols + c;
        this.grass[i] = this.capacity[i]; this.trampled[i] = 0; this.cropped[i] = 0; this.recoverIn[i] = 0;
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
      if (this.recoverIn[i] > 0) this.recoverIn[i] = Math.max(0, this.recoverIn[i] - elapsed);
      else this.grass[i] = Math.min(this.capacity[i], this.grass[i] + elapsed * 0.0022);
      if (this.grass[i] >= 0.985 && this.recoverIn[i] === 0) this.cropped[i] = 0;
      this.trampled[i] *= decay;
    }
  }
}
