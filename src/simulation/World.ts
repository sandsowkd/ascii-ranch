import { clamp, TAU } from '../vendor/pond-math';
import { Pasture } from './Pasture';

export type SheepState = 'grazing' | 'walking' | 'following' | 'startled';
export interface Sheep {
  id: number; x: number; y: number; vx: number; vy: number; heading: number;
  goalX: number; goalY: number; timer: number; hunger: number; state: SheepState;
  phase: number; size: number; speed: number; courage: number; wool: number; ate: number;
}
export type Ability = 'q' | 'w' | 'e' | 'r';
export const ABILITIES: Record<Ability, { name: string; cooldown: number; duration: number }> = {
  q: { name: 'Bark', cooldown: 2.8, duration: 1.3 },
  w: { name: 'Come By', cooldown: 7, duration: 3.6 },
  e: { name: 'Sprint', cooldown: 5, duration: 0.85 },
  r: { name: 'Hold the Flock', cooldown: 16, duration: 6 },
};
export interface Dog { x: number; y: number; vx: number; vy: number; heading: number; targetX: number; targetY: number; dragging: boolean; arrived: boolean; sprint: number; orbit: 'w' | 'r' | null; orbitLeft: number; orbitAngle: number; anchorX: number; anchorY: number; orbitRadius: number }
export interface Feed { id: number; x: number; y: number; amount: number; age: number; seed: number }
export interface Bark { x: number; y: number; age: number }
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s += 0x6d2b79f5; let t = Math.imul(s ^ s >>> 15, s | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function angleDelta(from: number, to: number) { return ((to - from + Math.PI * 3) % TAU) - Math.PI; }

export class World {
  pasture: Pasture;
  sheep: Sheep[] = [];
  dog: Dog | null = null;
  feed: Feed[] = [];
  barks: Bark[] = [];
  cooldowns: Record<Ability, number> = { q: 0, w: 0, e: 0, r: 0 };
  marker: { x: number; y: number; age: number } | null = null;
  time = 0; paused = false; eaten = 0; nextId = 0; nextFeed = 0;
  private random = seeded(74821);
  constructor(public width: number, public height: number, count = 18) {
    this.pasture = new Pasture(width, height); this.reset(count);
  }
  get scale() { return this.width < 600 ? 0.79 : 1; }
  get bounds() { return { left: 35 * this.scale, right: this.width - 35 * this.scale, top: 100, bottom: this.height - (this.width < 680 ? 230 : this.width < 1000 ? 180 : 110) }; }
  clampPoint(x: number, y: number) {
    const b = this.bounds;
    return { x: clamp(x, b.left, Math.max(b.left, b.right)), y: clamp(y, Math.min(b.top, this.height * 0.2), Math.max(this.height * 0.35, b.bottom)) };
  }
  reset(count = this.sheep.length) {
    this.random = seeded(74821); this.sheep.length = 0; this.dog = null; this.feed.length = 0;
    this.time = 0; this.eaten = 0; this.nextId = 0; this.nextFeed = 0;
    this.barks.length = 0; this.cooldowns = { q: 0, w: 0, e: 0, r: 0 }; this.marker = null;
    this.pasture.resize(this.width, this.height, false);
    for (let i = 0; i < count; i++) this.addSheep(true);
  }
  addSheep(initial = false) {
    if (this.sheep.length >= 80) return false;
    const rand = this.random, id = this.nextId++, a = rand() * TAU;
    const group = id % 3, baseX = [0.36, 0.68, 0.48][group], baseY = [0.38, 0.47, 0.67][group];
    const spreadX = this.width * 0.19, spreadY = this.height * 0.16;
    const point = initial ? this.clampPoint(this.width * baseX + Math.cos(a) * spreadX * rand(), this.height * baseY + Math.sin(a) * spreadY * rand()) :
      this.clampPoint(this.width * (0.22 + rand() * 0.56), this.height * (0.28 + rand() * 0.4));
    // Resolve spawn overlaps before the sheep starts grazing.
    for (let attempt = 0; attempt < 36; attempt++) {
      if (!this.sheep.some(s => Math.hypot(s.x - point.x, s.y - point.y) < 58 * this.scale)) break;
      const p = this.clampPoint(this.width * (0.14 + rand() * 0.72), this.height * (0.25 + rand() * 0.49)); point.x = p.x; point.y = p.y;
    }
    this.sheep.push({ id, ...point, vx: 0, vy: 0, heading: rand() * TAU, goalX: point.x, goalY: point.y,
      timer: 1.5 + rand() * 5.5, hunger: 0.3 + rand() * 0.5, state: 'grazing', phase: rand() * TAU,
      size: (0.87 + rand() * 0.25), speed: 20 + rand() * 11, courage: 0.8 + rand() * 0.4, wool: rand(), ate: 0 });
    return true;
  }
  removeSheep() { return this.sheep.pop() !== undefined; }
  toggleDog() {
    if (this.dog) { this.dog = null; return false; }
    const point = this.clampPoint(this.width * 0.78, this.height * 0.72);
    this.dog = { ...point, vx: 0, vy: 0, heading: -2.3, targetX: point.x, targetY: point.y, dragging: false, arrived: true, sprint: 0, orbit: null, orbitLeft: 0, orbitAngle: 0, anchorX: point.x, anchorY: point.y, orbitRadius: 160 };
    return true;
  }
  sendDog(x: number, y: number) {
    if (!this.dog) this.toggleDog();
    const p = this.clampPoint(x, y); this.dog!.targetX = p.x; this.dog!.targetY = p.y; this.dog!.arrived = false;
    this.dog!.orbit = null; this.dog!.orbitLeft = 0;
    this.marker = { ...p, age: 0 };
  }
  flockCenter() {
    if (!this.sheep.length) return { x: this.width * 0.5, y: this.height * 0.5, radius: 90 * this.scale };
    let x = 0, y = 0;
    for (const s of this.sheep) { x += s.x; y += s.y; }
    x /= this.sheep.length; y /= this.sheep.length;
    let spread = 0;
    for (const s of this.sheep) spread += Math.hypot(s.x - x, s.y - y);
    return { x, y, radius: clamp(spread / this.sheep.length + 62 * this.scale, 85 * this.scale, Math.min(250, this.width * 0.36)) };
  }
  cast(key: Ability, aim?: { x: number; y: number }) {
    if (this.paused || this.cooldowns[key] > 0.001) return false;
    if (!this.dog) this.toggleDog();
    const dog = this.dog!;
    this.cooldowns[key] = ABILITIES[key].cooldown;
    if (key === 'q') this.barks.push({ x: dog.x, y: dog.y, age: 0 });
    if (key === 'e') {
      if (dog.arrived && aim) this.sendDog(aim.x, aim.y);
      dog.sprint = ABILITIES.e.duration;
    }
    if (key === 'w' || key === 'r') {
      const center = this.flockCenter();
      dog.anchorX = center.x; dog.anchorY = center.y; dog.orbitRadius = center.radius;
      dog.orbitAngle = Math.atan2(dog.y - center.y, dog.x - center.x);
      dog.orbit = key; dog.orbitLeft = ABILITIES[key].duration;
    }
    return true;
  }
  addFeed(x: number, y: number) {
    if (this.feed.length >= 10) this.feed.shift();
    const p = this.clampPoint(x, y);
    this.feed.push({ id: this.nextFeed++, ...p, amount: 2.2, age: 0, seed: this.random() * 10000 });
  }
  resize(width: number, height: number) {
    const sx = width / this.width, sy = height / this.height;
    this.width = width; this.height = height; this.pasture.resize(width, height);
    for (const s of this.sheep) {
      const p = this.clampPoint(s.x * sx, s.y * sy), goal = this.clampPoint(s.goalX * sx, s.goalY * sy);
      s.x = p.x; s.y = p.y; s.goalX = goal.x; s.goalY = goal.y;
    }
    if (this.dog) {
      const p = this.clampPoint(this.dog.x * sx, this.dog.y * sy), anchor = this.clampPoint(this.dog.anchorX * sx, this.dog.anchorY * sy);
      Object.assign(this.dog, p, { targetX: p.x, targetY: p.y, anchorX: anchor.x, anchorY: anchor.y,
        orbitRadius: clamp(this.dog.orbitRadius * Math.sqrt(sx * sy), 50 * this.scale, this.width * 0.36) });
    }
    for (const f of this.feed) { const p = this.clampPoint(f.x * sx, f.y * sy); Object.assign(f, p); }
    this.barks.length = 0; this.marker = null;
  }
  private freshGrass(s: Sheep) {
    let score = -Infinity, bestX = s.x, bestY = s.y;
    for (let j = 0; j < 18; j++) {
      const a = this.random() * TAU, radius = 42 + this.random() * 115;
      const p = this.clampPoint(s.x + Math.cos(a) * radius * this.scale, s.y + Math.sin(a) * radius * this.scale);
      let quality = this.pasture.at(p.x, p.y) - Math.hypot(p.x - s.x, p.y - s.y) * 0.0008;
      for (const other of this.sheep) if (other !== s && Math.hypot(other.x - p.x, other.y - p.y) < 45 * this.scale) quality -= 0.24;
      if (this.dog) quality -= Math.max(0, 150 - Math.hypot(p.x - this.dog.x, p.y - this.dog.y)) * 0.008;
      if (quality > score) { score = quality; bestX = p.x; bestY = p.y; }
    }
    s.goalX = bestX; s.goalY = bestY; s.timer = 3 + this.random() * 5; s.state = 'walking';
  }
  step(dt: number) {
    if (this.paused) return;
    dt = Math.min(dt, 1 / 30); this.time += dt; this.pasture.step(dt);
    for (const key of ['q', 'w', 'e', 'r'] as Ability[]) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    for (const bark of this.barks) bark.age += dt;
    this.barks = this.barks.filter(b => b.age < ABILITIES.q.duration);
    if (this.marker) { this.marker.age += dt; if (this.marker.age > 1.5) this.marker = null; }
    const dog = this.dog, scale = this.scale;
    if (dog) {
      dog.sprint = Math.max(0, dog.sprint - dt);
      if (dog.orbit && dog.orbitLeft > 0) {
        dog.orbitLeft -= dt;
        if (dog.orbit === 'w') {
          const center = this.flockCenter();
          dog.anchorX += (center.x - dog.anchorX) * dt; dog.anchorY += (center.y - dog.anchorY) * dt;
          dog.orbitRadius += (center.radius - dog.orbitRadius) * dt;
        }
        dog.orbitAngle += dt * (dog.orbit === 'r' ? 1.7 : 1.2);
        const p = this.clampPoint(dog.anchorX + Math.cos(dog.orbitAngle) * dog.orbitRadius, dog.anchorY + Math.sin(dog.orbitAngle) * dog.orbitRadius);
        dog.targetX = p.x; dog.targetY = p.y;
        if (dog.orbitLeft <= 0) { dog.orbit = null; dog.targetX = dog.x; dog.targetY = dog.y; }
      }
      const dx = dog.targetX - dog.x, dy = dog.targetY - dog.y, d = Math.hypot(dx, dy);
      const speed = Math.min(dog.sprint > 0 ? 520 : dog.orbit ? 360 : dog.dragging ? 520 : 190, d * 7);
      const vx = d > 1 ? dx / d * speed : 0, vy = d > 1 ? dy / d * speed : 0;
      dog.vx = vx; dog.vy = vy; dog.x += vx * dt; dog.y += vy * dt; dog.arrived = d < 3;
      if (speed > 5) dog.heading += clamp(angleDelta(dog.heading, Math.atan2(vy, vx)), -dt * 9, dt * 9);
      this.pasture.tread(dog.x, dog.y, dt * 1.8, 28 * scale);
    }
    for (const f of this.feed) { f.age += dt; }
    let index = 0;
    for (const f of this.feed) if (f.amount > 0.015 && f.age < 80) this.feed[index++] = f;
    this.feed.length = index;
    for (const s of this.sheep) {
      s.timer -= dt; s.hunger = Math.min(1, s.hunger + dt * 0.007);
      let desiredX = 0, desiredY = 0, speed = s.speed * scale;
      const dogDist = dog ? Math.hypot(s.x - dog.x, s.y - dog.y) : Infinity;
      const alertRadius = (dog && dog.sprint > 0 ? 185 : dog?.dragging ? 175 : 126) * scale * s.courage;
      let food: Feed | undefined, nearest = 390 * scale;
      if (dogDist > alertRadius * 0.8) for (const f of this.feed) {
        const d = Math.hypot(f.x - s.x, f.y - s.y);
        if (d < nearest && f.amount > 0.015) { food = f; nearest = d; }
      }
      if (dog && dogDist < alertRadius) {
        s.state = 'startled'; s.timer = 1.4 + this.random();
        const dx = s.x - dog.x, dy = s.y - dog.y, d = dogDist || 1;
        desiredX = dx / d; desiredY = dy / d;
        // The dog moves the group, rather than exploding it: nearby sheep share the turn.
        let centerX = 0, centerY = 0, neighbors = 0;
        for (const n of this.sheep) if (n !== s && Math.hypot(n.x - s.x, n.y - s.y) < 150 * scale) { centerX += n.x; centerY += n.y; neighbors++; }
        if (neighbors) { desiredX += (centerX / neighbors - s.x) * 0.004; desiredY += (centerY / neighbors - s.y) * 0.004; }
        speed = (43 + 46 * (1 - dogDist / alertRadius)) * scale;
      } else if (food) {
        s.state = 'following'; s.goalX = food.x; s.goalY = food.y;
        const eatRadius = 24 * scale;
        if (nearest < eatRadius) {
          const amount = Math.min(food.amount, dt * 0.23); food.amount -= amount; s.ate += amount; this.eaten += amount;
          s.hunger = Math.max(0, s.hunger - amount * 0.4); speed = 0;
        } else { desiredX = food.x - s.x; desiredY = food.y - s.y; speed *= 1.28; }
      } else {
        if (s.state === 'startled' || s.state === 'following') this.freshGrass(s);
        if (s.state === 'grazing') {
          const mouthX = s.x + Math.cos(s.heading) * 20 * scale, mouthY = s.y + Math.sin(s.heading) * 20 * scale;
          const amount = this.pasture.bite(mouthX, mouthY, dt, 22 * scale);
          s.ate += amount; this.eaten += amount; s.hunger = Math.max(0, s.hunger - dt * 0.025);
          speed = 0;
          if (this.pasture.at(mouthX, mouthY) < 0.16 || s.timer < 0) this.freshGrass(s);
        }
        if (s.state === 'walking') {
          const dx = s.goalX - s.x, dy = s.goalY - s.y, distance = Math.hypot(dx, dy);
          if (distance < 13 * scale || s.timer < 0) { s.state = 'grazing'; s.timer = 3 + this.random() * 8; speed = 0; }
          else { desiredX = dx; desiredY = dy; }
        }
      }
      let separateX = 0, separateY = 0;
      const spacing = 48 * scale;
      for (const other of this.sheep) {
        if (other === s) continue;
        const dx = s.x - other.x, dy = s.y - other.y, d = Math.hypot(dx, dy);
        if (d < spacing) { const k = (1 - d / spacing); separateX += (d < 0.001 ? (s.id < other.id ? -1 : 1) : dx / d) * k; separateY += (d < 0.001 ? 0.3 : dy / d) * k; }
      }
      const len = Math.hypot(desiredX, desiredY) || 1;
      desiredX = desiredX / len * speed + separateX * 42 * scale;
      desiredY = desiredY / len * speed + separateY * 42 * scale;
      for (const bark of this.barks) {
        const dx = s.x - bark.x, dy = s.y - bark.y, d = Math.hypot(dx, dy) || 1;
        const off = Math.abs(d - bark.age * 215 * scale);
        if (off < 36 * scale) { const force = (1 - off / (36 * scale)) * 110 * scale * (1 - bark.age / 1.3); desiredX += dx / d * force; desiredY += dy / d * force; s.state = 'startled'; }
      }
      if (dog?.orbit) {
        const dx = dog.anchorX - s.x, dy = dog.anchorY - s.y, d = Math.hypot(dx, dy) || 1;
        const targetRadius = dog.orbit === 'r' ? 70 * scale : 105 * scale;
        const gather = clamp((d - targetRadius) * (dog.orbit === 'r' ? 0.8 : 0.45), 0, 65 * scale);
        desiredX += dx / d * gather; desiredY += dy / d * gather;
        if (gather > 6) s.state = 'walking';
      }
      // Keep calm grazers calmly still unless another sheep is actually overlapping.
      const blend = 1 - Math.exp(-dt * (s.state === 'startled' ? 5 : 3));
      s.vx += (desiredX - s.vx) * blend; s.vy += (desiredY - s.vy) * blend;
      const v = Math.hypot(s.vx, s.vy), max = 105 * scale;
      if (v > max) { s.vx *= max / v; s.vy *= max / v; }
      const p = this.clampPoint(s.x + s.vx * dt, s.y + s.vy * dt);
      if (p.x === s.x && Math.abs(s.vx) > 3) { s.vx *= -0.4; s.timer = 0; }
      if (p.y === s.y && Math.abs(s.vy) > 3) { s.vy *= -0.4; s.timer = 0; }
      s.x = p.x; s.y = p.y;
      if (v > 3) s.heading += clamp(angleDelta(s.heading, Math.atan2(s.vy, s.vx)), -dt * 2.6, dt * 2.6);
      this.pasture.tread(s.x, s.y, dt * (v > 4 ? 0.65 : 0.1), 20 * scale);
    }
  }
}
