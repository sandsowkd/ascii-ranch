import { hash3 } from '../vendor/pond-math';
import type { Pasture } from './Pasture';
import { barkTouches, type Bark } from './bark';

export interface Bird {
  id: number; x: number; y: number; heading: number; phase: number;
  state: 'arriving' | 'landed' | 'departing'; age: number; altitude: number;
  landingX: number; landingY: number; exitX: number; exitY: number; restFor: number; color: number;
}
interface Position { x: number; y: number; size?: number; heading?: number; vx?: number; vy?: number }

/** Visitors reserve clear grass, then leave if an animal actually enters their space. */
export class BirdLife {
  birds: Bird[] = [];
  private nextId = 0;
  private searchId = 0;
  private untilVisit = 5;
  reset() { this.birds.length = 0; this.nextId = 0; this.searchId = 0; this.untilVisit = 5; }
  get groundSpots() {
    return this.birds.filter(b => b.state !== 'departing').map(b => ({ id: b.id,
      x: b.state === 'arriving' ? b.landingX : b.x, y: b.state === 'arriving' ? b.landingY : b.y }));
  }
  resize(sx: number, sy: number) {
    for (const b of this.birds) { b.x *= sx; b.y *= sy; b.landingX *= sx; b.landingY *= sy; b.exitX *= sx; b.exitY *= sy; }
  }
  private clearLanding(x: number, y: number, scale: number, pasture: Pasture, animals: Position[], dog: Position | null, except?: Bird) {
    if (pasture.patchQuality(x, y, 18 * scale) < 0.62 || dog && Math.hypot(dog.x - x, dog.y - y) < 175 * scale) return false;
    for (const a of animals) {
      const clearance = (48 * (a.size ?? 1) + 24) * scale;
      if (Math.hypot(a.x - x, a.y - y) < clearance || Math.hypot(a.x + (a.vx ?? 0) * 0.65 - x, a.y + (a.vy ?? 0) * 0.65 - y) < clearance) return false;
    }
    return !this.birds.some(b => b !== except && b.state !== 'departing' &&
      Math.hypot((b.state === 'arriving' ? b.landingX : b.x) - x, (b.state === 'arriving' ? b.landingY : b.y) - y) < 85 * scale);
  }
  private pickLanding(width: number, height: number, pasture: Pasture, animals: Position[], dog: Position | null, except?: Bird) {
    const seed = this.searchId++, scale = width < 600 ? 0.79 : 1;
    const minY = 120, maxY = Math.max(minY + 20, height - (width < 680 ? 195 : width < 1000 ? 145 : 90));
    let best: { x: number; y: number } | null = null, bestScore = -Infinity;
    for (let i = 0; i < 96; i++) {
      const x = width * (0.1 + hash3(seed, i * 2, 781) * 0.8), y = minY + hash3(seed, i * 2 + 1, 781) * (maxY - minY);
      if (!this.clearLanding(x, y, scale, pasture, animals, dog, except)) continue;
      const score = pasture.patchQuality(x, y, 18 * scale) + hash3(seed, i, 918) * 0.15 - (except ? Math.hypot(x - except.x, y - except.y) * 0.0005 : 0);
      if (score > bestScore) { best = { x, y }; bestScore = score; }
    }
    return best;
  }
  private animalTouches(b: Bird, a: Position, scale: number) {
    const size = a.size ?? 1;
    if (Math.hypot(a.x - b.x, a.y - b.y) < (25 * size + 16) * scale) return true;
    if (a.heading === undefined) return false;
    const headX = a.x + Math.cos(a.heading) * 34.3 * size * scale, headY = a.y + Math.sin(a.heading) * 34.3 * size * scale;
    return Math.hypot(headX - b.x, headY - b.y) < (11.2 * size + 16) * scale;
  }
  step(dt: number, width: number, height: number, pasture: Pasture, animals: Position[], dog: Position | null, barks: Bark[]) {
    const scale = width < 600 ? 0.79 : 1;
    this.untilVisit -= dt;
    if (this.untilVisit <= 0 && this.birds.length < 3) {
      const landing = this.pickLanding(width, height, pasture, animals, dog);
      if (landing) {
        const id = this.nextId++, h = (n: number) => hash3(id, n, 781), left = h(1) < 0.5;
        this.birds.push({ id, x: left ? -35 : width + 35, y: height * (0.16 + h(2) * 0.35),
          heading: left ? 0 : Math.PI, phase: h(3) * Math.PI * 2, state: 'arriving', age: 0, altitude: 1,
          landingX: landing.x, landingY: landing.y, exitX: left ? width + 70 : -70, exitY: height * (0.12 + h(4) * 0.42), restFor: 9 + h(5) * 7, color: id % 3 });
        this.untilVisit = 17 + h(6) * 13;
      } else this.untilVisit = 2.5;
    }
    for (const b of this.birds) {
      b.age += dt;
      if (b.state === 'arriving') {
        if (!this.clearLanding(b.landingX, b.landingY, scale, pasture, animals, dog, b)) {
          const landing = this.pickLanding(width, height, pasture, animals, dog, b);
          if (landing) { b.landingX = landing.x; b.landingY = landing.y; }
          else { b.state = 'departing'; b.age = 0; }
        }
        if (b.age > 22) { b.state = 'departing'; b.age = 0; }
      }
      if (b.state === 'landed') {
        const scared = dog && Math.hypot(dog.x - b.x, dog.y - b.y) < 145 * scale ||
          animals.some(a => this.animalTouches(b, a, scale)) || barks.some(q => barkTouches(q, b.x, b.y, 10 * scale, dt));
        if (b.age > b.restFor || scared) { b.state = 'departing'; b.age = 0; }
        else continue;
      }
      const arriving = b.state === 'arriving', tx = arriving ? b.landingX : b.exitX, ty = arriving ? b.landingY : b.exitY;
      const dx = tx - b.x, dy = ty - b.y, distance = Math.hypot(dx, dy);
      const speed = arriving ? Math.min(105, 22 + distance * 0.8) : 115;
      b.heading = Math.atan2(dy, dx);
      const travel = Math.min(distance, speed * dt);
      b.x += dx / (distance || 1) * travel; b.y += dy / (distance || 1) * travel;
      b.altitude = arriving ? Math.min(1, distance / 140) : Math.min(1, b.age * 0.65);
      if (arriving && distance < 3) { b.x = tx; b.y = ty; b.altitude = 0; b.state = 'landed'; b.age = 0; b.heading = b.exitX > b.x ? 0 : Math.PI; }
    }
    this.birds = this.birds.filter(b => b.state !== 'departing' || Math.hypot(b.x - b.exitX, b.y - b.exitY) > 3);
  }
}
