import { hash3 } from '../vendor/pond-math';
import type { Pasture } from './Pasture';
import { barkTouches, type Bark } from './bark';

export interface Bird {
  id: number; x: number; y: number; heading: number; phase: number;
  state: 'arriving' | 'landed' | 'departing'; age: number; altitude: number;
  landingX: number; landingY: number; exitX: number; exitY: number; restFor: number; color: number;
}
interface Position { x: number; y: number }

/** Small, occasional visitors. Landing sites favor fresh, unoccupied grass. */
export class BirdLife {
  birds: Bird[] = [];
  private nextId = 0;
  private untilVisit = 5;
  reset() { this.birds.length = 0; this.nextId = 0; this.untilVisit = 5; }
  resize(sx: number, sy: number) {
    for (const b of this.birds) { b.x *= sx; b.y *= sy; b.landingX *= sx; b.landingY *= sy; b.exitX *= sx; b.exitY *= sy; }
  }
  step(dt: number, width: number, height: number, pasture: Pasture, animals: Position[], dog: Position | null, barks: Bark[]) {
    this.untilVisit -= dt;
    if (this.untilVisit <= 0 && this.birds.length < 3) {
      const id = this.nextId++, h = (n: number) => hash3(id, n, 781);
      let landingX = width * 0.5, landingY = height * 0.45, best = -Infinity;
      for (let i = 0; i < 18; i++) {
        const x = width * (0.16 + h(i * 2 + 10) * 0.68), y = 115 + h(i * 2 + 11) * Math.max(20, height - 330);
        let score = pasture.patchQuality(x, y) + h(i + 90) * 0.15;
        for (const a of animals) score -= Math.max(0, 85 - Math.hypot(a.x - x, a.y - y)) * 0.025;
        if (dog) score -= Math.max(0, 180 - Math.hypot(dog.x - x, dog.y - y)) * 0.02;
        if (score > best) { best = score; landingX = x; landingY = y; }
      }
      const left = h(1) < 0.5;
      this.birds.push({ id, x: left ? -35 : width + 35, y: height * (0.16 + h(2) * 0.35),
        heading: left ? 0 : Math.PI, phase: h(3) * Math.PI * 2, state: 'arriving', age: 0, altitude: 1,
        landingX, landingY, exitX: left ? width + 70 : -70, exitY: height * (0.12 + h(4) * 0.42), restFor: 9 + h(5) * 7, color: id % 3 });
      this.untilVisit = 17 + h(6) * 13;
    }
    for (const b of this.birds) {
      b.age += dt;
      if (b.state === 'landed') {
        const scared = dog && Math.hypot(dog.x - b.x, dog.y - b.y) < 145 ||
          barks.some(q => barkTouches(q, b.x, b.y, 10, dt));
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
      if (arriving && distance < 3) { b.x = tx; b.y = ty; b.altitude = 0; b.state = 'landed'; b.age = 0; }
    }
    this.birds = this.birds.filter(b => b.state !== 'departing' || Math.hypot(b.x - b.exitX, b.y - b.exitY) > 3);
  }
}
