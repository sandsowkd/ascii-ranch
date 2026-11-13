import { clamp, hash3, TAU } from '../vendor/pond-math';
import type { Pasture } from './Pasture';

export interface Mouse {
  id: number; x: number; y: number; vx: number; vy: number; heading: number;
  goalX: number; goalY: number; timer: number; age: number; life: number; phase: number;
  state: 'darting' | 'resting';
}
export interface MouseCover { x: number; y: number; size?: number; heading?: number }
/** Wool conceals a mouse from both the renderer and a hunting bird. */
export function mouseExposed(mouse: Mouse, animals: MouseCover[], scale: number) {
  return !animals.some(a => {
    const dx = mouse.x - a.x, dy = mouse.y - a.y, heading = a.heading ?? 0, size = (a.size ?? 1) * scale;
    const along = dx * Math.cos(heading) + dy * Math.sin(heading), side = -dx * Math.sin(heading) + dy * Math.cos(heading);
    return (along / (27 * size + 3 * scale)) ** 2 + (side / (19 * size + 3 * scale)) ** 2 < 1;
  });
}

export class MouseLife {
  mice: Mouse[] = [];
  private nextId = 0;
  private untilVisit = 3;
  reset() { this.mice.length = 0; this.nextId = 0; this.untilVisit = 3; }
  resize(sx: number, sy: number) { for (const m of this.mice) { m.x *= sx; m.y *= sy; m.goalX *= sx; m.goalY *= sy; } }
  private destination(m: Mouse, width: number, height: number, pasture: Pasture, away?: { x: number; y: number }) {
    const scale = width < 600 ? 0.79 : 1, seed = Math.floor(m.age * 20), angle = away ? Math.atan2(m.y - away.y, m.x - away.x) : hash3(m.id, seed, 417) * TAU;
    let best = -Infinity;
    for (let j = 0; j < 9; j++) {
      const a = angle + (j / 8 - 0.5) * 1.4, distance = (60 + hash3(m.id, seed + j, 712) * 95) * scale;
      const x = clamp(m.x + Math.cos(a) * distance, 18, width - 18), y = clamp(m.y + Math.sin(a) * distance, 110, height - 110);
      const score = pasture.at(x, y) + Math.hypot(x - m.x, y - m.y) * 0.003 - j * 0.002;
      if (score > best) { best = score; m.goalX = x; m.goalY = y; }
    }
    m.state = 'darting'; m.timer = 2.5;
  }
  flee(m: Mouse, from: { x: number; y: number }, width: number, height: number, pasture: Pasture) { this.destination(m, width, height, pasture, from); }
  catch(id: number) { const i = this.mice.findIndex(m => m.id === id); if (i < 0) return false; this.mice.splice(i, 1); return true; }
  step(dt: number, width: number, height: number, pasture: Pasture, dog: { x: number; y: number } | null) {
    const scale = width < 600 ? 0.79 : 1;
    this.untilVisit -= dt;
    if (this.untilVisit <= 0 && this.mice.length < 2) {
      const id = this.nextId++, h = (n: number) => hash3(id, n, 962);
      const x = width * (0.12 + h(0) * 0.76), y = 125 + h(1) * Math.max(20, height - 280);
      const mouse: Mouse = { id, x, y, vx: 0, vy: 0, heading: h(2) * TAU, phase: h(3) * TAU,
        goalX: x, goalY: y, timer: 0, age: 0, life: 34 + h(4) * 12, state: 'resting' };
      this.mice.push(mouse); this.destination(mouse, width, height, pasture); this.untilVisit = 26 + h(5) * 14;
    }
    for (const m of this.mice) {
      m.age += dt; m.timer -= dt;
      if (dog && Math.hypot(m.x - dog.x, m.y - dog.y) < 80 * scale && m.state === 'resting') this.destination(m, width, height, pasture, dog);
      if (m.timer <= 0) {
        if (m.state === 'resting') this.destination(m, width, height, pasture);
        else { m.state = 'resting'; m.timer = 1.8 + hash3(m.id, Math.floor(m.age), 315) * 3.5; }
      }
      if (m.state === 'resting') { m.vx = 0; m.vy = 0; continue; }
      const dx = m.goalX - m.x, dy = m.goalY - m.y, d = Math.hypot(dx, dy), speed = 84 * scale;
      if (d < 4 * scale) { m.state = 'resting'; m.timer = 2 + hash3(m.id, Math.floor(m.age), 315) * 3; m.vx = 0; m.vy = 0; continue; }
      m.heading = Math.atan2(dy, dx); const travel = Math.min(d, speed * dt);
      m.vx = dx / d * travel / dt; m.vy = dy / d * travel / dt; m.x += m.vx * dt; m.y += m.vy * dt;
    }
    this.mice = this.mice.filter(m => m.age < m.life);
  }
}
