import { clamp, hash3, TAU } from '../vendor/pond-math';
import { Pasture } from './Pasture';

export type SheepState = 'grazing' | 'walking' | 'following' | 'startled';
export interface Sheep {
  id: number; x: number; y: number; vx: number; vy: number; heading: number;
  goalX: number; goalY: number; timer: number; hunger: number; state: SheepState;
  phase: number; size: number; speed: number; courage: number; wool: number; ate: number;
}
export type Ability = 'q' | 'w' | 'e' | 'r';
export const ABILITIES: Record<Ability, { name: string; duration: number }> = {
  q: { name: 'Bark', duration: 2.4 }, w: { name: 'Come By', duration: 0 },
  e: { name: 'Sprint', duration: 1.25 }, r: { name: 'Recall / Release', duration: 0 },
};
export const SPEEDS = { sheepWalk: 13, sheepFood: 20, sheepChased: 26, sheepPanic: 64, dogWalk: 62, dogOrbit: 94, dogSprint: 185, dogRelease: 205 };
export interface Dog {
  x: number; y: number; vx: number; vy: number; heading: number; targetX: number; targetY: number;
  arrived: boolean; sprint: number; orbit: 'w' | null; orbitSide: number; orbitLeg: number; orbitEntering: boolean; orbitEntry: number;
  anchorX: number; anchorY: number; recallReady: boolean; recalling: boolean; atHome: boolean; launching: boolean;
  idleTime: number; sleeping: boolean;
}
export interface Feed { id: number; x: number; y: number; amount: number; age: number; seed: number }
export interface Bark { x: number; y: number; age: number }
export interface Rect { left: number; right: number; top: number; bottom: number }
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s += 0x6d2b79f5; let t = Math.imul(s ^ s >>> 15, s | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function angleDelta(from: number, to: number) { return ((to - from + Math.PI * 3) % TAU) - Math.PI; }

export class World {
  pasture: Pasture; sheep: Sheep[] = []; dog: Dog | null = null; feed: Feed[] = []; barks: Bark[] = [];
  marker: { x: number; y: number; age: number } | null = null;
  time = 0; paused = false; eaten = 0; nextId = 0; nextFeed = 0;
  panicLeft = 0; panicX = 0; panicY = 0;
  private random = seeded(74821);
  constructor(public width: number, public height: number, count = 18) { this.pasture = new Pasture(width, height); this.reset(count); }
  get scale() { return this.width < 600 ? 0.79 : 1; }
  get dogBounds(): Rect {
    return { left: 18 * this.scale, right: this.width - 18 * this.scale, top: 83,
      bottom: Math.max(180, this.height - (this.width < 680 ? 180 : this.width < 1000 ? 130 : 65)) };
  }
  get bounds(): Rect {
    const b = this.dogBounds, pad = 63 * this.scale;
    return { left: b.left + pad, right: b.right - pad, top: b.top + pad,
      bottom: Math.max(b.top + pad + 30, b.bottom - pad) };
  }
  get pen(): Rect {
    const right = this.width - 32 * this.scale, bottom = this.dogBounds.bottom - 5 * this.scale;
    return { left: right - 108 * this.scale, right, top: bottom - 70 * this.scale, bottom };
  }
  get home() {
    const b = this.pen, x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
    return { x, y, doorX: x, doorY: y };
  }
  dogAvoidanceRadius() {
    const d = this.dog;
    if (!d || d.atHome) return 0;
    return (d.sleeping ? 56 : d.sprint > 0 || d.launching ? 145 : !d.arrived || d.orbit ? 112 : 76) * this.scale;
  }
  private clampTo(x: number, y: number, b: Rect) {
    return { x: clamp(x, b.left, Math.max(b.left, b.right)), y: clamp(y, b.top, Math.max(b.top, b.bottom)) };
  }
  clampPoint(x: number, y: number) { return this.clampTo(x, y, this.bounds); }
  dogPoint(x: number, y: number) { return this.clampTo(x, y, this.dogBounds); }
  reset(count = this.sheep.length) {
    this.random = seeded(74821); this.sheep.length = 0; this.dog = null; this.feed.length = 0;
    this.time = 0; this.eaten = 0; this.nextId = 0; this.nextFeed = 0; this.barks.length = 0; this.marker = null; this.panicLeft = 0;
    this.pasture.resize(this.width, this.height, false);
    for (let i = 0; i < count; i++) this.addSheep(true);
  }
  addSheep(initial = false) {
    if (this.sheep.length >= 80) return false;
    const rand = this.random, id = this.nextId++, a = rand() * TAU, group = id % 3;
    const point = initial ? this.clampPoint(this.width * [0.36, 0.68, 0.48][group] + Math.cos(a) * this.width * 0.19 * rand(), this.height * [0.38, 0.47, 0.67][group] + Math.sin(a) * this.height * 0.16 * rand()) :
      this.clampPoint(this.width * (0.18 + rand() * 0.64), this.height * (0.28 + rand() * 0.43));
    for (let attempt = 0; attempt < 70; attempt++) {
      if (!this.sheep.some(s => Math.hypot(s.x - point.x, s.y - point.y) < 62 * this.scale) && Math.hypot(point.x - this.home.x, point.y - this.home.y) > 75 * this.scale) break;
      Object.assign(point, this.clampPoint(this.width * (0.1 + rand() * 0.8), this.height * (0.2 + rand() * 0.57)));
    }
    this.sheep.push({ id, ...point, vx: 0, vy: 0, heading: rand() * TAU, goalX: point.x, goalY: point.y,
      timer: 8 + rand() * 12, hunger: 0.3 + rand() * 0.5, state: 'grazing', phase: rand() * TAU,
      size: 0.87 + rand() * 0.25, speed: 8 + rand() * 5, courage: 0.8 + rand() * 0.4, wool: rand(), ate: 0 });
    return true;
  }
  removeSheep() { return this.sheep.pop() !== undefined; }
  toggleDog() {
    if (this.dog) { this.dog = null; return false; }
    const p = this.dogPoint(this.pen.left - 42 * this.scale, this.home.y);
    this.dog = { ...p, vx: 0, vy: 0, heading: -2.8, targetX: p.x, targetY: p.y, arrived: true,
      sprint: 0, orbit: null, orbitSide: 0, orbitLeg: 0, orbitEntering: false, orbitEntry: 0.5,
      anchorX: p.x, anchorY: p.y, recallReady: false, recalling: false, atHome: false, launching: false, idleTime: 0, sleeping: false };
    return true;
  }
  sendDog(x: number, y: number) {
    if (!this.dog) this.toggleDog();
    const p = this.dogPoint(x, y), d = this.dog!;
    Object.assign(d, { targetX: p.x, targetY: p.y, arrived: false, orbit: null, recallReady: false, recalling: false, atHome: false, launching: false, idleTime: 0, sleeping: false });
    this.marker = { ...p, age: 0 };
  }
  /** A padded envelope of EVERY sheep, rather than a mean radius. */
  orbitOutline(): Rect {
    const lane = this.dogBounds, pad = 58 * this.scale;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const s of this.sheep) { left = Math.min(left, s.x); right = Math.max(right, s.x); top = Math.min(top, s.y); bottom = Math.max(bottom, s.y); }
    if (!this.sheep.length) { left = this.width * 0.5 - 45; right = this.width * 0.5 + 45; top = this.height * 0.45 - 40; bottom = this.height * 0.45 + 40; }
    return { left: Math.max(lane.left, left - pad), right: Math.min(lane.right, right + pad), top: Math.max(lane.top, top - pad), bottom: Math.min(lane.bottom, bottom + pad) };
  }
  flockCenter() {
    const b = this.orbitOutline(), x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
    let radius = 0; for (const s of this.sheep) radius = Math.max(radius, Math.hypot(s.x - x, s.y - y));
    return { x, y, radius: radius + 58 * this.scale };
  }
  private edgePoint(side: number, along: number, b: Rect) {
    return side === 0 ? { x: b.left + (b.right - b.left) * along, y: b.top } : side === 1 ? { x: b.right, y: b.top + (b.bottom - b.top) * along } :
      side === 2 ? { x: b.right - (b.right - b.left) * along, y: b.bottom } : { x: b.left, y: b.bottom - (b.bottom - b.top) * along };
  }
  cast(key: Ability, aim?: { x: number; y: number }) {
    if (this.paused) return false;
    if (!this.dog) this.toggleDog();
    const d = this.dog!; d.idleTime = 0; d.sleeping = false;
    if (key === 'q') {
      if (this.barks.length >= 10) this.barks.shift();
      this.barks.push({ x: d.x, y: d.y, age: 0 }); this.panicX = d.x; this.panicY = d.y; this.panicLeft = 6;
    }
    if (key === 'e') { if (d.arrived && aim) this.sendDog(aim.x, aim.y); d.sprint = ABILITIES.e.duration; }
    if (key === 'w') {
      d.recalling = false; d.recallReady = false; d.atHome = false; d.launching = false;
      const b = this.orbitOutline();
      const candidates = [clamp((d.x - b.left) / (b.right - b.left || 1), 0, 1), clamp((d.y - b.top) / (b.bottom - b.top || 1), 0, 1),
        clamp((b.right - d.x) / (b.right - b.left || 1), 0, 1), clamp((b.bottom - d.y) / (b.bottom - b.top || 1), 0, 1)];
      let nearest = Infinity;
      for (let side = 0; side < 4; side++) { const p = this.edgePoint(side, candidates[side], b), dist = Math.hypot(p.x - d.x, p.y - d.y); if (dist < nearest) { nearest = dist; d.orbitSide = side; d.orbitEntry = candidates[side]; } }
      d.orbit = 'w'; d.orbitEntering = true; d.orbitLeg = 0;
    }
    if (key === 'r') {
      if (d.recallReady) {
        const p = aim ?? { x: this.width * 0.5, y: this.height * 0.5 };
        this.sendDog(p.x, p.y); d.launching = true; d.sprint = 0;
      } else {
        d.orbit = null; d.sprint = 0; d.launching = false; d.recalling = true; d.recallReady = true; d.atHome = false;
        d.targetX = this.home.doorX; d.targetY = this.home.doorY; d.arrived = false;
      }
    }
    return true;
  }
  addFeed(x: number, y: number) {
    if (this.feed.length >= 10) this.feed.shift();
    const p = this.clampPoint(x, y); this.feed.push({ id: this.nextFeed++, ...p, amount: 2.2, age: 0, seed: this.random() * 10000 });
  }
  resize(width: number, height: number) {
    const sx = width / this.width, sy = height / this.height; this.width = width; this.height = height; this.pasture.resize(width, height);
    for (const s of this.sheep) { const p = this.clampPoint(s.x * sx, s.y * sy), goal = this.clampPoint(s.goalX * sx, s.goalY * sy); Object.assign(s, p, { goalX: goal.x, goalY: goal.y }); }
    if (this.dog) {
      const p = this.dogPoint(this.dog.x * sx, this.dog.y * sy), goal = this.dogPoint(this.dog.targetX * sx, this.dog.targetY * sy);
      Object.assign(this.dog, p, { targetX: goal.x, targetY: goal.y });
      if (this.dog.recalling || this.dog.atHome) { this.dog.targetX = this.home.doorX; this.dog.targetY = this.home.doorY; this.dog.recalling = true; this.dog.atHome = false; }
    }
    for (const f of this.feed) Object.assign(f, this.clampPoint(f.x * sx, f.y * sy));
    this.barks.length = 0; this.marker = null;
  }
  private freshGrass(s: Sheep) {
    let score = -Infinity, bestX = s.x, bestY = s.y;
    for (let j = 0; j < 18; j++) {
      const a = this.random() * TAU, radius = 30 + this.random() * 85;
      const p = this.clampPoint(s.x + Math.cos(a) * radius * this.scale, s.y + Math.sin(a) * radius * this.scale);
      let quality = this.pasture.at(p.x, p.y) - Math.hypot(p.x - s.x, p.y - s.y) * 0.001;
      for (const other of this.sheep) if (other !== s && Math.hypot(other.x - p.x, other.y - p.y) < 60 * this.scale) quality -= 0.35;
      if (this.dog) quality -= Math.max(0, this.dogAvoidanceRadius() - Math.hypot(p.x - this.dog.x, p.y - this.dog.y)) * 0.015;
      if (Math.hypot(p.x - this.home.x, p.y - this.home.y) < 72 * this.scale) quality -= 2;
      if (quality > score) { score = quality; bestX = p.x; bestY = p.y; }
    }
    s.goalX = bestX; s.goalY = bestY; s.timer = 10 + this.random() * 8; s.state = 'walking';
  }
  private stepDog(dt: number) {
    const d = this.dog; if (!d) return;
    d.sprint = Math.max(0, d.sprint - dt);
    if (d.orbit) {
      const b = this.orbitOutline(); d.anchorX = (b.left + b.right) / 2; d.anchorY = (b.top + b.bottom) / 2;
      const entry = this.edgePoint(d.orbitSide, d.orbitEntry, b);
      let p = d.orbitEntering || d.orbitLeg >= 4 ? entry : this.edgePoint((d.orbitSide + d.orbitLeg) % 4, 1, b);
      if (Math.hypot(p.x - d.x, p.y - d.y) < 5 * this.scale) {
        if (d.orbitEntering) d.orbitEntering = false;
        else d.orbitLeg++;
        if (d.orbitLeg > 4) { d.orbit = null; p = { x: d.x, y: d.y }; }
        else p = d.orbitLeg >= 4 ? entry : this.edgePoint((d.orbitSide + d.orbitLeg) % 4, 1, b);
      }
      d.targetX = p.x; d.targetY = p.y;
    }
    const dx = d.targetX - d.x, dy = d.targetY - d.y, distance = Math.hypot(dx, dy);
    const max = (d.launching ? SPEEDS.dogRelease : d.sprint > 0 ? SPEEDS.dogSprint : d.orbit ? SPEEDS.dogOrbit : SPEEDS.dogWalk) * this.scale;
    const speed = Math.min(max, distance * 4);
    d.vx = distance > 0.6 ? dx / distance * speed : 0; d.vy = distance > 0.6 ? dy / distance * speed : 0;
    d.x += d.vx * dt; d.y += d.vy * dt; d.arrived = distance < 2;
    if (speed > 2) d.heading += clamp(angleDelta(d.heading, Math.atan2(d.vy, d.vx)), -dt * 5, dt * 5);
    if (d.arrived) {
      if (d.recalling) { d.recalling = false; d.atHome = true; d.x = this.home.doorX; d.y = this.home.doorY; }
      d.launching = false;
    }
    d.idleTime = d.arrived && !d.orbit && d.sprint <= 0 ? d.idleTime + dt : 0;
    d.sleeping = d.idleTime >= 7;
    if (speed > 1) this.pasture.tread(d.x, d.y, dt * 0.8, 25 * this.scale);
  }
  step(dt: number) {
    if (this.paused) return;
    dt = Math.min(dt, 1 / 30); this.time += dt; this.pasture.step(dt);
    this.panicLeft = Math.max(0, this.panicLeft - dt);
    for (const bark of this.barks) bark.age += dt;
    this.barks = this.barks.filter(b => b.age < ABILITIES.q.duration);
    if (this.marker) { this.marker.age += dt; if (this.marker.age > 1.5) this.marker = null; }
    this.stepDog(dt);
    const dog = this.dog, scale = this.scale;
    for (const s of this.sheep) {
      s.timer -= dt; s.hunger = Math.min(1, s.hunger + dt * 0.004);
      let desiredX = 0, desiredY = 0, speed = s.speed * scale;
      const dogDist = dog && !dog.atHome ? Math.hypot(s.x - dog.x, s.y - dog.y) : Infinity;
      const avoidRadius = this.dogAvoidanceRadius();
      const alertRadius = dog?.sleeping ? 0 : avoidRadius * s.courage;
      let food: Feed | undefined, nearest = 380 * scale;
      if (this.panicLeft <= 0 && dogDist > alertRadius * 0.85) for (const f of this.feed) {
        const d = Math.hypot(f.x - s.x, f.y - s.y); if (d < nearest && f.amount > 0.015) { food = f; nearest = d; }
      }
      if (this.panicLeft > 0 || dog && dogDist < alertRadius) {
        s.state = 'startled'; s.timer = 3;
        const panic = this.panicLeft > 0, ox = panic ? this.panicX : dog!.x, oy = panic ? this.panicY : dog!.y;
        const dx = s.x - ox, dy = s.y - oy, d = Math.hypot(dx, dy) || 1;
        desiredX = dx / d; desiredY = dy / d;
        // Run along boundaries rather than piling every frightened sheep into a corner.
        const b = this.bounds, edge = 22 * scale;
        if ((s.x < b.left + edge && desiredX < 0) || (s.x > b.right - edge && desiredX > 0)) { desiredY += (s.y < (b.top + b.bottom) / 2 ? 1 : -1) * 0.8; desiredX *= 0.12; }
        if ((s.y < b.top + edge && desiredY < 0) || (s.y > b.bottom - edge && desiredY > 0)) { desiredX += (s.x < (b.left + b.right) / 2 ? 1 : -1) * 0.8; desiredY *= 0.12; }
        speed = panic ? SPEEDS.sheepPanic * scale * (0.78 + s.courage * 0.16) : (17 + 7 * Math.max(0, 1 - dogDist / alertRadius)) * scale;
      } else if (food) {
        s.state = 'following'; s.goalX = food.x; s.goalY = food.y;
        if (nearest < 32 * scale) {
          const amount = Math.min(food.amount, dt * 0.085); food.amount -= amount; s.ate += amount; this.eaten += amount;
          s.hunger = Math.max(0, s.hunger - amount * 0.4); speed = 0;
        } else { desiredX = food.x - s.x; desiredY = food.y - s.y; speed = Math.min(SPEEDS.sheepFood, s.speed * 1.35) * scale; }
      } else {
        if (s.state === 'startled' || s.state === 'following') this.freshGrass(s);
        if (s.state === 'grazing') {
          const mouthX = s.x + Math.cos(s.heading) * 25 * scale, mouthY = s.y + Math.sin(s.heading) * 25 * scale;
          const amount = this.pasture.bite(mouthX, mouthY, dt, 21 * scale);
          s.ate += amount; this.eaten += amount; s.hunger = Math.max(0, s.hunger - dt * 0.01); speed = 0;
          if (this.pasture.at(mouthX, mouthY) < 0.14 || s.timer < 0) this.freshGrass(s);
        }
        if (s.state === 'walking') {
          const dx = s.goalX - s.x, dy = s.goalY - s.y;
          if (Math.hypot(dx, dy) < 10 * scale || s.timer < 0) { s.state = 'grazing'; s.timer = 14 + this.random() * 16; speed = 0; }
          else { desiredX = dx; desiredY = dy; }
        }
      }
      const length = Math.hypot(desiredX, desiredY) || 1; desiredX = desiredX / length * speed; desiredY = desiredY / length * speed;
      for (const other of this.sheep) {
        if (other === s) continue;
        const dx = s.x - other.x, dy = s.y - other.y, d = Math.hypot(dx, dy), spacing = 64 * scale * (s.size + other.size) * 0.5;
        if (d < spacing) { const k = (1 - d / spacing) ** 2 * 30 * scale; desiredX += (d < 0.001 ? s.id < other.id ? -1 : 1 : dx / d) * k; desiredY += (d < 0.001 ? 0.3 : dy / d) * k; }
      }
      // Sleeping dogs still get a little personal space, without startling the flock.
      if (dog?.sleeping && dogDist < avoidRadius) {
        const dx = s.x - dog.x, dy = s.y - dog.y, distance = dogDist || 1;
        const push = (1 - dogDist / avoidRadius) * 12 * scale;
        desiredX += (dogDist < 0.001 ? 1 : dx / distance) * push;
        desiredY += dy / distance * push;
      }
      const hx = s.x - this.home.x, hy = s.y - this.home.y, hd = Math.hypot(hx, hy) || 1;
      if (hd < 70 * scale) { desiredX += hx / hd * 25 * scale; desiredY += hy / hd * 25 * scale; }
      const cap = (this.panicLeft > 0 ? SPEEDS.sheepPanic : s.state === 'startled' ? SPEEDS.sheepChased : s.state === 'following' ? SPEEDS.sheepFood : SPEEDS.sheepWalk + 2) * scale;
      const desiredSpeed = Math.hypot(desiredX, desiredY);
      if (desiredSpeed > cap) { desiredX *= cap / desiredSpeed; desiredY *= cap / desiredSpeed; }
      const blend = 1 - Math.exp(-dt * (s.state === 'startled' ? 3.5 : 2));
      s.vx += (desiredX - s.vx) * blend; s.vy += (desiredY - s.vy) * blend;
      const v = Math.hypot(s.vx, s.vy);
      if (v > cap) { s.vx *= cap / v; s.vy *= cap / v; }
      Object.assign(s, this.clampPoint(s.x + s.vx * dt, s.y + s.vy * dt));
      if (v > 2) s.heading += clamp(angleDelta(s.heading, Math.atan2(s.vy, s.vx)), -dt * 1.7, dt * 1.7);
      this.pasture.tread(s.x, s.y, dt * (v > 3 ? 0.32 : 0.04), 19 * scale);
    }
    this.resolveOverlaps(dt);
    for (const f of this.feed) f.age += dt;
    this.feed = this.feed.filter(f => f.amount > 0.015 && f.age < 120);
  }
  /** A soft spacing zone plus positional relaxation leaves only a little wool overlap. */
  private resolveOverlaps(dt: number) {
    const cap = 0.85 * this.scale * dt * 60;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < this.sheep.length; i++) for (let j = i + 1; j < this.sheep.length; j++) {
      const a = this.sheep[i], b = this.sheep[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const min = 43 * this.scale * (a.size + b.size) * 0.5;
      if (d >= min) continue;
      const angle = hash3(a.id, b.id, 33) * TAU, nx = d < 0.001 ? Math.cos(angle) : dx / d, ny = d < 0.001 ? Math.sin(angle) : dy / d;
      const push = Math.min(cap, (min - d) * 0.32);
      Object.assign(a, this.clampPoint(a.x - nx * push, a.y - ny * push)); Object.assign(b, this.clampPoint(b.x + nx * push, b.y + ny * push));
    }
  }
}
