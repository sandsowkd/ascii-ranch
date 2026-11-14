import { clamp, hash3, TAU } from '../vendor/pond-math';
import { Pasture } from './Pasture';
import { closestOnFence, FieldFences, makeFence, type Fence, type FenceSegment } from './fence';
import { BirdLife } from './Birds';
import { MouseLife } from './Mice';
import { BARK_LIFETIME, barkTouches, createBark, type Bark } from './bark';
import { planDogPath, safeMovementFraction, segmentClear, type Obstacle } from './navigation';
import { aheadOnRoute, nearestOnRoute, perimeter, roundedEnvelope, type Point } from './route';

export type SheepState = 'grazing' | 'walking' | 'following' | 'startled';
export interface Sheep {
  id: number; isLamb?: boolean; parentId?: number; x: number; y: number; vx: number; vy: number; heading: number;
  goalX: number; goalY: number; timer: number; hunger: number; state: SheepState;
  phase: number; size: number; speed: number; courage: number; wool: number; ate: number;
  companions: number[]; socialTimer: number; searchIn?: number; barkLeft: number; barkGoalX: number; barkGoalY: number;
  fencePath?: Point[]; fenceNavAt?: number; fenceGoal?: Point; fenceRevision?: number;
}
export type Ability = 'q' | 'w' | 'e' | 'r';
export const ABILITIES: Record<Ability, { name: string; duration: number }> = {
  q: { name: 'Bark', duration: 2.4 }, w: { name: 'Come By', duration: 0 },
  e: { name: 'Sprint', duration: 1.25 }, r: { name: 'Recall / Release', duration: 0 },
};
export const SPEEDS = { sheepWalk: 11, sheepFood: 20, sheepChased: 32.5, sheepPanic: 46, dogWalk: 116, dogOrbit: 210, dogSprint: 248, dogRelease: 270 };
export interface Dog {
  x: number; y: number; vx: number; vy: number; heading: number; targetX: number; targetY: number;
  arrived: boolean; sprint: number; orbit: 'w' | null; orbitEntering: boolean; orbitPath: Point[]; orbitProgress: number; orbitLast?: Point; orbitUpdatedAt: number;
  anchorX: number; anchorY: number; recallReady: boolean; recalling: boolean; atHome: boolean; launching: boolean;
  idleTime: number; sleeping: boolean; barkAge?: number; navPath: Point[]; navAt: number; navGoalX: number; navGoalY: number; navMode: 'clear' | 'squeeze' | 'cross'; navStuck: number; navClearSince: number;
  penTransit?: 'exit' | 'approach' | 'enter' | null;
}
export interface Feed { id: number; x: number; y: number; amount: number; age: number; seed: number }
export interface Rect { left: number; right: number; top: number; bottom: number }
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s += 0x6d2b79f5; let t = Math.imul(s ^ s >>> 15, s | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Signed shortest turn, including headings accumulated over several laps. */
export function angleDelta(from: number, to: number) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }

export class World {
  pasture: Pasture; sheep: Sheep[] = []; lambs: Sheep[] = []; birdLife = new BirdLife(); dog: Dog | null = null; feed: Feed[] = []; barks: Bark[] = [];
  marker: { x: number; y: number; age: number } | null = null;
  time = 0; paused = false; eaten = 0; nextId = 0; nextFeed = 0;
  panicLeft = 0; panicX = 0; panicY = 0;
  gateOpen = 0;
  fieldFences = new FieldFences();
  fencePreview: (FenceSegment & { valid: boolean }) | null = null;
  mouseLife = new MouseLife();
  private random = seeded(74821);
  private nextLambId = 100000;
  private fenceCache?: { width: number; height: number; value: Fence };
  constructor(public width: number, public height: number, count = 18, lambCount = Math.floor(count / 6)) { this.fieldFences.scale = this.scale; this.pasture = new Pasture(width, height); this.reset(count, lambCount); }
  get birds() { return this.birdLife.birds; }
  get mice() { return this.mouseLife.mice; }
  get fencePosts() { return [...this.fence.posts, ...this.fieldFences.posts]; }
  get fixedDogObstacles() { return [...this.fence.obstacles, ...this.fieldFences.obstacles(49 * this.scale)]; }
  get animals(): Sheep[] { return [...this.sheep, ...this.lambs]; }
  get scale() { return this.width < 600 ? 0.79 : 1; }
  get dogBounds(): Rect {
    return { left: 18 * this.scale, right: this.width - 18 * this.scale, top: 83,
      bottom: Math.max(180, this.height - (this.width < 680 ? 180 : this.width < 1000 ? 130 : 65)) };
  }
  get bounds(): Rect {
    const b = this.dogBounds, pad = 78 * this.scale;
    return { left: b.left + pad, right: b.right - pad, top: b.top + pad,
      bottom: Math.max(b.top + pad + 30, b.bottom - pad) };
  }
  get pen(): Rect {
    const right = this.width - 32 * this.scale, bottom = this.dogBounds.bottom - 5 * this.scale;
    return { left: right - 120 * this.scale, right, top: bottom - 72 * this.scale, bottom };
  }
  get fence() {
    if (!this.fenceCache || this.fenceCache.width !== this.width || this.fenceCache.height !== this.height)
      this.fenceCache = { width: this.width, height: this.height, value: makeFence(this.pen, this.scale) };
    return this.fenceCache.value;
  }
  private outsidePen(p: Point, padding: number) {
    const b = this.pen;
    if (p.x > b.left - padding && p.x < b.right + padding && p.y > b.top - padding && p.y < b.bottom + padding) {
      if (p.x - (b.left - padding) < p.y - (b.top - padding)) return { x: b.left - padding, y: p.y };
      return { x: p.x, y: b.top - padding };
    }
    return p;
  }
  get home() {
    const b = this.pen, x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
    return { x, y, doorX: x, doorY: y };
  }
  private get penApproach() { return { x: this.pen.left - (this.pen.bottom - this.pen.top) - 54 * this.scale, y: this.home.y }; }
  private needsPenExit(d: Dog) {
    return d.x > this.penApproach.x && d.x <= this.home.x + 2 * this.scale && Math.abs(d.y - this.home.y) < 3 * this.scale &&
      (d.atHome || d.penTransit === 'exit' || d.penTransit === 'enter' || d.x >= this.pen.left);
  }
  dogAvoidanceRadius() {
    const d = this.dog;
    if (!d || d.atHome) return 0;
    return (d.sleeping ? 88 : d.orbit ? 235 : d.sprint > 0 || d.launching ? 205 : !d.arrived || d.orbit ? 172 : 92) * this.scale;
  }
  private clampTo(x: number, y: number, b: Rect) {
    return { x: clamp(x, b.left, Math.max(b.left, b.right)), y: clamp(y, b.top, Math.max(b.top, b.bottom)) };
  }
  clampPoint(x: number, y: number) { const p = this.outsidePen(this.clampTo(x, y, this.bounds), 66 * this.scale); return this.clampTo(p.x, p.y, this.bounds); }
  private clearGrassPoint(p: Point, padding: number): Point | null {
    const q = this.fieldFences.outside(p, padding), b = this.bounds;
    const inside = (p: Point) => { const clamped = this.clampPoint(p.x, p.y); return p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom && clamped.x === p.x && clamped.y === p.y && this.fieldFences.clear(p, padding); };
    if (inside(q)) return q;
    // Construction can make the nearest side too narrow. Search the remaining
    // grass before spawning an animal or feed into a rail.
    let best: Point | null = null, distance = Infinity;
    for (let y = b.top; y <= b.bottom; y += 24 * this.scale) for (let x = b.left; x <= b.right; x += 24 * this.scale) {
      const candidate = this.clampPoint(x, y), d = Math.hypot(candidate.x - p.x, candidate.y - p.y);
      if (d < distance && inside(candidate)) { best = candidate; distance = d; }
    }
    return best;
  }
  dogPoint(x: number, y: number) {
    const b = this.pen;
    if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return this.home;
    const p = this.clampTo(x, y, this.dogBounds), obstacles = this.fixedDogObstacles, safe = (q: Point) => !obstacles.some(o => Math.hypot(q.x - o.x, q.y - o.y) < o.radius + 1);
    if (safe(p)) return p;
    if (this.fieldFences.rails.length) {
      const outside = this.fieldFences.outside(p, 50 * this.scale), clear = this.clampTo(outside.x, outside.y, this.dogBounds);
      if (safe(clear)) return clear;
    }
    const candidates = [this.home, this.outsidePen(p, 64 * this.scale),
      { x: this.pen.left - 64 * this.scale, y: p.y }, { x: p.x, y: this.pen.top - 64 * this.scale }]
      .map(q => this.clampTo(q.x, q.y, this.dogBounds)).filter(safe);
    return candidates.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] ?? this.home;
  }
  reset(count = this.sheep.length, lambCount = this.lambs.length) {
    this.fieldFences.reset(); this.fencePreview = null; this.mouseLife.reset();
    this.random = seeded(74821); this.sheep.length = 0; this.lambs.length = 0; this.birdLife.reset(); this.dog = null; this.feed.length = 0;
    this.time = 0; this.eaten = 0; this.nextId = 0; this.nextLambId = 100000; this.nextFeed = 0; this.barks.length = 0; this.marker = null; this.panicLeft = 0; this.gateOpen = 0;
    this.pasture.resize(this.width, this.height, false);
    for (let i = 0; i < count; i++) this.addSheep(true);
    for (let i = 0; i < lambCount; i++) this.addLamb();
  }
  addSheep(initial = false) {
    if (this.sheep.length >= 80) return false;
    const rand = this.random, id = this.nextId++, a = rand() * TAU, group = id % 3;
    const point = initial ? this.clampPoint(this.width * [0.36, 0.68, 0.48][group] + Math.cos(a) * this.width * 0.19 * rand(), this.height * [0.38, 0.47, 0.67][group] + Math.sin(a) * this.height * 0.16 * rand()) :
      this.clampPoint(this.width * (0.18 + rand() * 0.64), this.height * (0.28 + rand() * 0.43));
    for (let attempt = 0; attempt < 70; attempt++) {
      if (this.fieldFences.clear(point, 53 * this.scale) && !this.animals.some(s => Math.hypot(s.x - point.x, s.y - point.y) < 62 * this.scale) && Math.hypot(point.x - this.home.x, point.y - this.home.y) > 75 * this.scale) break;
      Object.assign(point, this.clampPoint(this.width * (0.1 + rand() * 0.8), this.height * (0.2 + rand() * 0.57)));
    }
    const clear = this.clearGrassPoint(point, 55 * this.scale); if (!clear) return false; Object.assign(point, clear);
    this.sheep.push({ id, ...point, vx: 0, vy: 0, heading: rand() * TAU, goalX: point.x, goalY: point.y,
      timer: 8 + rand() * 12, hunger: 0.3 + rand() * 0.5, state: 'grazing', phase: rand() * TAU,
      companions: [], socialTimer: 0, barkLeft: 0, barkGoalX: point.x, barkGoalY: point.y,
      size: 0.87 + rand() * 0.25, speed: 7 + rand() * 3.5, courage: 0.8 + rand() * 0.4, wool: rand(), ate: 0 });
    this.reparentLambs();
    return true;
  }
  addLamb() {
    const id = this.nextLambId++, parent = this.sheep[(this.lambs.length + 5) % this.sheep.length];
    const origin = parent ?? this.clampPoint(this.width * (0.18 + this.random() * 0.64), this.height * (0.28 + this.random() * 0.43));
    let point = this.clampPoint(origin.x, origin.y), best = -Infinity;
    const animals = this.animals;
    for (let j = 0; j < 48; j++) {
      const a = (parent?.heading ?? 0) + j * TAU / 16, radius = (48 + Math.floor(j / 16) * 28) * this.scale;
      const p = this.clampPoint(origin.x + Math.cos(a) * radius, origin.y + Math.sin(a) * radius);
      if (!this.fieldFences.clear(p, 31 * this.scale)) continue;
      const clearance = animals.reduce((closest, s) => Math.min(closest, Math.hypot(s.x - p.x, s.y - p.y)), Infinity);
      if (clearance > best) { point = p; best = clearance; }
      if (clearance >= 44 * this.scale) break;
    }
    const clear = this.clearGrassPoint(point, 31 * this.scale); if (!clear) return false; point = clear;
    this.lambs.push({ id, ...point, parentId: parent?.id, isLamb: true, heading: parent?.heading ?? this.random() * TAU,
      size: 0.52 + hash3(id, 2, 881) * 0.07, speed: 8.5, phase: (parent?.phase ?? this.random() * TAU) + 1.3,
      vx: 0, vy: 0, goalX: point.x, goalY: point.y, companions: [], socialTimer: Infinity, ate: 0,
      timer: 8 + this.random() * 12, hunger: 0.3, state: 'grazing', courage: 0.9, wool: hash3(id, 3, 881),
      barkLeft: 0, barkGoalX: point.x, barkGoalY: point.y });
    return true;
  }
  private reparentLambs() {
    for (const lamb of this.lambs) {
      if (this.sheep.some(s => s.id === lamb.parentId)) continue;
      let parent: Sheep | undefined, nearest = Infinity;
      for (const sheep of this.sheep) { const d = Math.hypot(sheep.x - lamb.x, sheep.y - lamb.y); if (d < nearest) { parent = sheep; nearest = d; } }
      lamb.parentId = parent?.id;
    }
  }
  removeSheep() { const removed = this.sheep.pop() !== undefined; this.reparentLambs(); return removed; }
  removeLamb() { return this.lambs.pop() !== undefined; }
  fenceEndpoints(a: Point, b: Point): FenceSegment {
    const bounds = { left: 20, right: this.width - 20, top: 105, bottom: this.height - 100 };
    return { a: this.clampTo(a.x, a.y, bounds), b: this.clampTo(b.x, b.y, bounds) };
  }
  canAddFence(a: Point, b: Point) {
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || Math.hypot(b.x - a.x, b.y - a.y) < 32 * this.scale) return false;
    // Leave the gate's full straight passage free for recall and release.
    const passage: Obstacle[] = [];
    for (let x = this.penApproach.x; x <= this.home.x; x += 12 * this.scale) passage.push({ x, y: this.home.y, radius: 56 * this.scale });
    return this.fence.obstacles.concat(passage).every(o => { const q = closestOnFence(o, { a, b }); return Math.hypot(o.x - q.x, o.y - q.y) > o.radius + 0.2; });
  }
  addFence(a: Point, b: Point) {
    const rail = this.fenceEndpoints(a, b);
    if (!this.canAddFence(rail.a, rail.b)) return false;
    this.fieldFences.add(rail.a, rail.b);
    // Construction gently clears the occupied strip instead of rejecting a
    // player's drag. Choose the nearest usable side, with room for neighbours.
    const length = Math.hypot(rail.b.x - rail.a.x, rail.b.y - rail.a.y), tx = (rail.b.x - rail.a.x) / length, ty = (rail.b.y - rail.a.y) / length;
    const animals = this.animals;
    for (const s of animals) {
      const padding = (49 * s.size + 2) * this.scale;
      const near = closestOnFence(s, rail), radius = padding + 7 * this.scale;
      if (Math.hypot(s.x - near.x, s.y - near.y) >= padding + 6 * this.scale) continue;
      let best: Point | null = null, score = Infinity;
      for (const side of [-1, 1]) for (const along of [0, -38, 38, -76, 76]) {
        const p = this.clearGrassPoint({ x: near.x - ty * side * radius + tx * along * this.scale, y: near.y + tx * side * radius + ty * along * this.scale }, padding);
        if (!p) continue;
        const crowd = animals.reduce((sum, other) => other === s ? sum : sum + Math.max(0, (29 * (s.size + other.size) + 5) * this.scale - Math.hypot(other.x - p.x, other.y - p.y)) * 3, 0);
        const cost = Math.hypot(p.x - s.x, p.y - s.y) + crowd;
        if (cost < score) { best = p; score = cost; }
      }
      if (best) Object.assign(s, best, { goalX: best.x, goalY: best.y, vx: 0, vy: 0, timer: 0, searchIn: 0 });
    }
    const d = this.dog;
    if (d && !d.atHome && !this.fieldFences.clear(d, 49 * this.scale)) {
      const p = this.dogPoint(d.x, d.y); Object.assign(d, p, { vx: 0, vy: 0 });
      const goal = this.dogPoint(d.targetX, d.targetY); d.targetX = goal.x; d.targetY = goal.y;
    }
    this.invalidateFenceRoutes(); return true;
  }
  undoFence() { const removed = this.fieldFences.undo(); if (removed) this.invalidateFenceRoutes(); return removed; }
  private invalidateFenceRoutes() {
    if (this.dog) { this.dog.navPath = []; this.dog.navAt = -10; this.dog.orbitUpdatedAt = -10; }
    for (const s of this.animals) { s.fencePath = []; s.fenceRevision = -1; }
  }
  toggleDog() {
    if (this.dog) { this.dog = null; return false; }
    const p = { x: this.home.x, y: this.home.y };
    this.dog = { ...p, vx: 0, vy: 0, heading: Math.PI, targetX: p.x, targetY: p.y, arrived: true,
      sprint: 0, orbit: null, orbitEntering: false, orbitPath: [], orbitProgress: 0, orbitUpdatedAt: 0,
      anchorX: p.x, anchorY: p.y, recallReady: true, recalling: false, atHome: true, launching: false, idleTime: 0, sleeping: false, barkAge: 99, navPath: [], navAt: -10, navGoalX: p.x, navGoalY: p.y, navMode: 'clear', navStuck: 0, navClearSince: -1, penTransit: null };
    this.gateOpen = 0;
    return true;
  }
  sendDog(x: number, y: number) {
    if (!this.dog) this.toggleDog();
    const p = this.dogPoint(x, y), d = this.dog!;
    const homeGoal = p.x === this.home.x && p.y === this.home.y, leaving = this.needsPenExit(d);
    const penTransit = homeGoal ? leaving ? 'enter' : 'approach' : leaving ? 'exit' : null;
    Object.assign(d, { targetX: p.x, targetY: p.y, arrived: false, orbit: null, recallReady: homeGoal, recalling: homeGoal, atHome: false, launching: false, idleTime: 0, sleeping: false, navPath: [], navAt: -10, navMode: 'clear', navStuck: 0, navClearSince: -1, penTransit });
    this.marker = { ...p, age: 0 };
  }
  /** A padded envelope of EVERY sheep, rather than a mean radius. */
  orbitOutline(): Rect {
    const lane = this.dogBounds, pad = 78 * this.scale;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const s of this.animals) { left = Math.min(left, s.x); right = Math.max(right, s.x); top = Math.min(top, s.y); bottom = Math.max(bottom, s.y); }
    if (!this.animals.length) { left = this.width * 0.5 - 45; right = this.width * 0.5 + 45; top = this.height * 0.45 - 40; bottom = this.height * 0.45 + 40; }
    return { left: Math.max(lane.left, left - pad), right: Math.min(lane.right, right + pad), top: Math.max(lane.top, top - pad), bottom: Math.min(lane.bottom, bottom + pad) };
  }
  flockCenter() {
    const b = this.orbitOutline(), x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
    let radius = 0; for (const s of this.animals) radius = Math.max(radius, Math.hypot(s.x - x, s.y - y));
    return { x, y, radius: radius + 78 * this.scale };
  }
  orbitRoute(): Point[] {
    const animals = this.animals, points = animals.length ? animals : [{ x: this.width * 0.5, y: this.height * 0.45 }];
    const path = roundedEnvelope(points, 78 * this.scale).map(p => { const q = this.outsidePen(p, 64 * this.scale); return this.dogPoint(q.x, q.y); });
    const route: Point[] = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length]; route.push(a);
      if (!segmentClear(a, b, this.fixedDogObstacles)) {
        const detour = planDogPath(a, b, this.dogBounds, this.fixedDogObstacles, 16 * this.scale);
        route.push(...detour.slice(0, -1));
      }
    }
    return route;
  }
  cast(key: Ability, aim?: { x: number; y: number }) {
    if (this.paused) return false;
    if (!this.dog) this.toggleDog();
    const d = this.dog!; d.idleTime = 0; d.sleeping = false;
    if (key === 'q') {
      d.barkAge = 0;
      if (this.barks.length >= 10) this.barks.shift();
      this.barks.push(createBark(d.x, d.y, this.width, this.height, this.scale));
      this.panicX = d.x; this.panicY = d.y; this.panicLeft = ABILITIES.q.duration;
    }
    if (key === 'e') { if (d.arrived && aim) this.sendDog(aim.x, aim.y); d.sprint = ABILITIES.e.duration; }
    if (key === 'w') {
      const leaving = this.needsPenExit(d);
      d.recalling = false; d.recallReady = false; d.atHome = false; d.launching = false; d.navAt = -10;
      d.penTransit = leaving ? 'exit' : null;
      d.orbitPath = this.orbitRoute(); d.orbitProgress = 0; d.orbitLast = undefined; d.orbitUpdatedAt = this.time;
      d.orbit = 'w'; d.orbitEntering = true;
    }
    if (key === 'r') {
      if (d.recallReady) {
        const p = aim ?? { x: this.width * 0.5, y: this.height * 0.5 };
        this.sendDog(p.x, p.y); d.launching = true; d.sprint = 0;
      } else {
        const returning = this.needsPenExit(d);
        d.orbit = null; d.sprint = 0; d.launching = false; d.recalling = true; d.recallReady = true; d.atHome = false;
        d.penTransit = returning ? 'enter' : 'approach'; d.navPath = []; d.navAt = -10;
        d.targetX = this.home.doorX; d.targetY = this.home.doorY; d.arrived = false;
      }
    }
    return true;
  }
  addFeed(x: number, y: number) {
    const p = this.clearGrassPoint(this.clampPoint(x, y), 55 * this.scale); if (!p) return;
    if (this.feed.length >= 10) this.feed.shift();
    this.feed.push({ id: this.nextFeed++, ...p, amount: 2.2, age: 0, seed: this.random() * 10000 });
  }
  resize(width: number, height: number) {
    const sx = width / this.width, sy = height / this.height; this.width = width; this.height = height; this.pasture.resize(width, height);
    this.fieldFences.resize(sx, sy, this.scale); this.mouseLife.resize(sx, sy); this.fencePreview = null;
    this.birdLife.resize(sx, sy, this.fencePosts, this.pasture.cellH); this.invalidateFenceRoutes();
    for (const s of this.animals) { const p = this.fieldFences.outside(this.clampPoint(s.x * sx, s.y * sy), 49 * s.size * this.scale), goal = this.clampPoint(s.goalX * sx, s.goalY * sy); Object.assign(s, p, { goalX: goal.x, goalY: goal.y }); }
    if (this.dog) {
      const d = this.dog, p = this.dogPoint(d.x * sx, d.y * sy), goal = this.dogPoint(d.targetX * sx, d.targetY * sy);
      if (d.atHome) {
        Object.assign(d, this.home, { targetX: this.home.x, targetY: this.home.y, vx: 0, vy: 0, heading: Math.PI, arrived: true, penTransit: null }); this.gateOpen = 0;
      } else {
        Object.assign(d, p, { targetX: goal.x, targetY: goal.y, navPath: [], navAt: -10 });
        if (d.penTransit === 'enter' || d.penTransit === 'exit') { d.x = clamp(d.x, this.penApproach.x, this.home.x); d.y = this.home.y; }
        if (d.recalling) { d.targetX = this.home.x; d.targetY = this.home.y; if (d.penTransit !== 'enter') d.penTransit = 'approach'; }
      }
    }
    for (const f of this.feed) Object.assign(f, this.clampPoint(f.x * sx, f.y * sy));
    this.barks.length = 0; this.marker = null;
  }
  /** Aggregate position for diagnostics; grazing uses only local companions. */
  herdCenter() {
    let x = 0, y = 0;
    const animals = this.animals;
    for (const s of animals) { x += s.x; y += s.y; }
    const n = animals.length, b = this.bounds;
    return { x: n ? x / n : this.width / 2, y: n ? y / n : this.height / 2,
      radius: Math.max(50 * this.scale, Math.min(45 * Math.sqrt(n) * this.scale, Math.min(b.right - b.left, b.bottom - b.top) * 0.4)) };
  }
  private updateCompanions(s: Sheep, dt: number) {
    s.socialTimer -= dt;
    if (s.socialTimer > 0) return;
    const nearby = this.sheep.filter(o => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 230 * this.scale)
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    const count = this.random() < 0.22 ? 0 : this.random() < 0.6 ? 1 : 2;
    s.companions = nearby.slice(0, count).map(o => o.id); s.socialTimer = 24 + this.random() * 25;
  }
  private birdPenalty(x: number, y: number) {
    let penalty = 0;
    for (const b of this.birds) {
      if (b.kind === 'hawk' || b.state === 'departing' || b.perchId !== undefined) continue;
      const bx = b.state === 'arriving' ? b.landingX : b.x, by = b.state === 'arriving' ? b.landingY : b.y;
      penalty += Math.max(0, 1 - Math.hypot(x - bx, y - by) / (105 * this.scale)) * 4;
    }
    return penalty;
  }
  private freshGrass(s: Sheep, recovering = false) {
    const scale = this.scale, bounds = this.bounds;
    const inside = (p: Point) => p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom && this.outsidePen(p, 66 * scale).x === p.x && this.outsidePen(p, 66 * scale).y === p.y;
    const parent = s.isLamb ? this.sheep.find(o => o.id === s.parentId) : undefined;
    const catchingUp = parent && Math.hypot(parent.x - s.x, parent.y - s.y) > 74 * scale;
    const obstacles = this.animals.filter(o => o !== s).map(o => ({
      x: o.x + Math.cos(o.heading) * 8 * o.size * scale, y: o.y + Math.sin(o.heading) * 8 * o.size * scale,
      radius: (26 * (s.size + o.size) + 7) * scale,
    })).concat(this.fieldFences.obstacles(49 * s.size * scale));
    if (catchingUp) {
      let p = this.clampPoint(parent.x, parent.y), best = -Infinity;
      for (let j = 0; j < 8; j++) {
        const a = parent.heading + j * TAU / 8, candidate = this.clampPoint(parent.x + Math.cos(a) * 54 * scale, parent.y + Math.sin(a) * 54 * scale);
        const quality = this.pasture.patchQuality(candidate.x, candidate.y) * 3 - Math.hypot(candidate.x - s.x, candidate.y - s.y) * 0.004 - this.birdPenalty(candidate.x, candidate.y) - (segmentClear(s, candidate, obstacles) ? 0 : 2);
        if (quality > best) { p = candidate; best = quality; }
      }
      s.goalX = p.x; s.goalY = p.y; s.timer = 12; s.searchIn = 0; s.state = 'walking'; return;
    }
    const forward = { x: s.x + Math.cos(s.heading) * 35 * scale, y: s.y + Math.sin(s.heading) * 35 * scale };
    const dogNearby = this.dog && !this.dog.atHome && Math.hypot(s.x - this.dog.x, s.y - this.dog.y) < this.dogAvoidanceRadius() * 1.2;
    const constrained = !recovering && !dogNearby && this.birdPenalty(s.x, s.y) === 0 && inside(forward);
    const maxTurn = constrained ? Math.PI / 4 : Math.PI;
    let score = -Infinity, best: Point | null = null;
    const friends = this.sheep.filter(o => s.companions.includes(o.id));
    for (let j = 0; j < 38; j++) {
      const turn = j < 15 ? [0, -0.5, 0.5, -1, 1][j % 5] * maxTurn : (this.random() + this.random() - 1) * maxTurn;
      const a = s.heading + turn, radius = (j < 15 ? [45, 100, 200][Math.floor(j / 5)] : 35 + this.random() * (j < 28 ? 160 : 330)) * scale;
      // Reject outside points rather than clamping them and bending the intended turn.
      const p = { x: s.x + Math.cos(a) * radius, y: s.y + Math.sin(a) * radius };
      if (!inside(p)) continue;
      const lookahead = Math.max(radius, 100 * scale);
      if (!segmentClear(s, { x: s.x + Math.cos(a) * lookahead, y: s.y + Math.sin(a) * lookahead }, obstacles)) continue;
      let quality = this.pasture.patchQuality(p.x, p.y, 25 * scale) * 3 - radius * 0.002 - this.birdPenalty(p.x, p.y) - Math.abs(turn) / maxTurn * 0.12;
      for (const other of this.animals) if (other !== s && Math.hypot(other.x - p.x, other.y - p.y) < 70 * scale) quality -= 0.24;
      for (const friend of friends) quality += Math.max(0, 1 - Math.hypot(p.x - friend.x, p.y - friend.y) / (180 * scale)) * 0.17;
      if (parent) quality -= Math.max(0, Math.hypot(p.x - parent.x, p.y - parent.y) - 50 * scale) * 0.035;
      if (this.dog) quality -= Math.max(0, this.dogAvoidanceRadius() - Math.hypot(p.x - this.dog.x, p.y - this.dog.y)) * 0.015;
      if (Math.hypot(p.x - this.home.x, p.y - this.home.y) < 72 * scale) quality -= 2;
      if (quality > score) { score = quality; best = p; }
    }
    if (!best) {
      // A blocked grazer waits for space instead of reversing or walking into wool.
      s.goalX = s.x; s.goalY = s.y; s.state = 'grazing'; s.searchIn = 1.5 + this.random() * 1.5; s.timer = s.searchIn; return;
    }
    s.goalX = best.x; s.goalY = best.y; s.timer = 16 + this.random() * 15; s.searchIn = 0; s.state = 'walking';
  }
  dogObstacles(mode: 'clear' | 'squeeze' | 'cross' = 'clear'): Obstacle[] {
    const body = mode === 'clear' ? 24 : mode === 'squeeze' ? 18 : 9;
    const margin = mode === 'clear' ? 13 : mode === 'squeeze' ? 7 : 3;
    return this.animals.map(s => ({ x: s.x + Math.cos(s.heading) * 8 * this.scale,
      y: s.y + Math.sin(s.heading) * 8 * this.scale, radius: (body * s.size + margin) * this.scale })).concat(this.fixedDogObstacles);
  }
  private chooseDogRoute(goal: Point) {
    const d = this.dog!, start = { x: d.x, y: d.y };
    const length = (path: Point[]) => { let sum = 0, from = start; for (const p of path) { sum += Math.hypot(p.x - from.x, p.y - from.y); from = p; } return sum; };
    const reaches = (path: Point[]) => !!path.length && Math.hypot(path[path.length - 1].x - goal.x, path[path.length - 1].y - goal.y) < 5 * this.scale;
    const clearObstacles = this.dogObstacles('clear'), tightObstacles = this.dogObstacles('squeeze');
    const clear = planDogPath(start, goal, this.dogBounds, clearObstacles, 16 * this.scale);
    let path = clear, mode: Dog['navMode'] = 'clear';
    // Tight gaps are useful when a generous detour costs noticeably more distance.
    const tight = planDogPath(start, goal, this.dogBounds, tightObstacles, 12 * this.scale);
    const gap = segmentClear(start, goal, tightObstacles) && clearObstacles.filter(o => !segmentClear(start, goal, [o])).length > 1;
    if (reaches(tight) && (!reaches(clear) || gap || length(tight) * 1.015 + 8 * this.scale < length(clear))) { path = tight; mode = 'squeeze'; }
    if (!reaches(path) || d.navStuck > 0.85) {
      const crossing = planDogPath(start, goal, this.dogBounds, this.dogObstacles('cross'), 12 * this.scale);
      path = crossing; if (!reaches(path)) path.push(goal); mode = 'cross';
    }
    d.navPath = path; d.navMode = mode; d.navAt = this.time; d.navGoalX = goal.x; d.navGoalY = goal.y; d.navClearSince = -1;
  }
  private stepDog(dt: number) {
    const d = this.dog;
    const opening = d?.penTransit === 'exit' || d?.penTransit === 'enter';
    this.gateOpen = clamp(this.gateOpen + dt * (opening ? 10 : -10), 0, 1);
    if (!d) return;
    d.barkAge = Math.min(99, (d.barkAge ?? 99) + dt);
    if (d.atHome && (d.x < this.pen.left || d.x > this.pen.right || d.y < this.pen.top || d.y > this.pen.bottom)) d.atHome = false;
    d.sprint = Math.max(0, d.sprint - dt);
    if (opening) {
      const entering = d.penTransit === 'enter', goal = entering ? this.home : this.penApproach;
      d.heading = entering ? 0 : Math.PI; d.y = this.home.y; d.vx = 0; d.vy = 0;
      // Wait for the door, then pass lengthwise through the short pen. Staying
      // on its centerline keeps the head, tail and paws clear of the rails.
      if (this.gateOpen >= 1) {
        const dx = goal.x - d.x, max = (d.launching ? SPEEDS.dogRelease : d.sprint > 0 ? SPEEDS.dogSprint : d.orbit ? SPEEDS.dogOrbit : SPEEDS.dogWalk) * this.scale;
        d.vx = Math.sign(dx) * Math.min(max, Math.abs(dx) * 5);
        const fraction = safeMovementFraction(d, { x: d.x + d.vx * dt, y: d.y }, this.fieldFences.obstacles(49 * this.scale));
        d.vx *= fraction; d.x += d.vx * dt;
        if (Math.abs(goal.x - d.x) < 2 * this.scale) {
          d.x = goal.x; d.vx = 0; d.penTransit = null; d.navPath = []; d.navAt = -10;
          if (entering) { d.arrived = true; d.atHome = true; d.recalling = false; d.recallReady = true; d.launching = false; }
        }
      }
      return;
    }
    if (d.atHome) {
      d.idleTime += dt; d.sleeping = d.idleTime >= 7; return;
    }
    if (d.orbit) {
      if (this.time - d.orbitUpdatedAt > 0.45) { d.orbitPath = this.orbitRoute(); d.orbitUpdatedAt = this.time; }
      const path = d.orbitPath, near = nearestOnRoute(path, d);
      if (d.orbitEntering && near.distance < 4 * this.scale) d.orbitEntering = false;
      const p = d.orbitEntering ? near : aheadOnRoute(path, near, 64 * this.scale);
      d.targetX = p.x; d.targetY = p.y;
      if (!d.orbitEntering && d.orbitLast) {
        const length = Math.max(1, perimeter(path)), previous = nearestOnRoute(path, d.orbitLast);
        const arc = (q: Point & { edge: number }) => { let sum = Math.hypot(q.x - path[q.edge].x, q.y - path[q.edge].y); for (let i = 0; i < q.edge; i++) sum += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y); return sum / length; };
        const advance = (arc(near) - arc(previous) + 1.5) % 1 - 0.5;
        if (Math.abs(advance) * length < Math.hypot(d.x - d.orbitLast.x, d.y - d.orbitLast.y) * 2.5 + 2 * this.scale)
          d.orbitProgress = Math.max(0, d.orbitProgress + advance);
      }
      d.orbitLast = { x: d.x, y: d.y };
      if (d.orbitProgress >= 1) { d.orbit = null; d.targetX = d.x; d.targetY = d.y; }
    }
    const approaching = d.penTransit === 'approach';
    const obstacles = this.dogObstacles(), goal = approaching ? this.penApproach : { x: d.targetX, y: d.targetY };
    const goalDistance = Math.hypot(goal.x - d.x, goal.y - d.y), direct = segmentClear(d, goal, obstacles);
    if (direct) { if (d.navClearSince < 0) d.navClearSince = this.time; } else d.navClearSince = -1;
    while (d.navPath.length && Math.hypot(d.navPath[0].x - d.x, d.navPath[0].y - d.y) < (d.navPath.length === 1 ? 1.5 : 5) * this.scale) d.navPath.shift();
    const finishingCross = d.navMode === 'cross' && goalDistance < 30 * this.scale;
    const changed = Math.hypot(goal.x - d.navGoalX, goal.y - d.navGoalY) > 65 * this.scale;
    const routeAge = this.time - d.navAt;
    const directStable = direct && d.navClearSince >= 0 && this.time - d.navClearSince > 0.35 && routeAge > 0.65;
    if (goalDistance > 2 && (!direct || d.navPath.length)) {
      // Commit to a side through a sprint; moving wool does not reset the route each frame.
      if (!finishingCross && (changed || !d.navPath.length || routeAge > 1.05 || (d.navStuck > 0.3 && routeAge > 0.4))) this.chooseDogRoute(goal);
      if (directStable && !finishingCross) { d.navPath.length = 0; d.navMode = 'clear'; }
    } else { d.navPath.length = 0; d.navMode = 'clear'; }
    const waypoint = finishingCross ? goal : d.navPath[0] ?? (direct || d.navMode === 'cross' ? goal : d);
    const dx = waypoint.x - d.x, dy = waypoint.y - d.y, distance = Math.hypot(dx, dy);
    const max = (d.launching ? SPEEDS.dogRelease : d.sprint > 0 ? SPEEDS.dogSprint : d.orbit ? SPEEDS.dogOrbit : SPEEDS.dogWalk) * this.scale;
    const speed = Math.min(max, distance * 5);
    const wantedX = distance > 0.6 ? dx / distance * speed : 0, wantedY = distance > 0.6 ? dy / distance * speed : 0;
    const blend = 1 - Math.exp(-dt * 14);
    let vx = d.vx + (wantedX - d.vx) * blend, vy = d.vy + (wantedY - d.vy) * blend;
    if (goalDistance < 2 || distance < 0.6) { vx = 0; vy = 0; }
    const proposed = this.clampTo(d.x + vx * dt, d.y + vy * dt, this.dogBounds);
    // Wool can touch: only the smaller core stops motion. Crossing is the last resort.
    const cores = this.dogObstacles(d.navMode === 'clear' ? 'squeeze' : 'cross');
    const fraction = Math.min(d.navMode === 'cross' ? 1 : safeMovementFraction(d, proposed, cores), safeMovementFraction(d, proposed, this.fixedDogObstacles));
    d.vx = (proposed.x - d.x) * fraction / dt; d.vy = (proposed.y - d.y) * fraction / dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.arrived = Math.hypot(d.targetX - d.x, d.targetY - d.y) < 2;
    const moving = Math.hypot(d.vx, d.vy);
    d.navStuck = goalDistance > 12 * this.scale && moving < 12 * this.scale ? d.navStuck + dt : Math.max(0, d.navStuck - dt * 3);
    if (!d.arrived && Math.hypot(d.vx, d.vy) > 2) d.heading = angleDelta(0, d.heading + clamp(angleDelta(d.heading, Math.atan2(d.vy, d.vx)), -dt * 5, dt * 5));
    if (approaching && Math.hypot(d.x - goal.x, d.y - goal.y) < 2) {
      Object.assign(d, goal, { arrived: false, vx: 0, vy: 0, heading: 0, penTransit: 'enter', navPath: [], navAt: -10 });
    } else if (d.arrived) {
      d.launching = false;
    }
    d.idleTime = d.arrived && !d.orbit && d.sprint <= 0 ? d.idleTime + dt : 0;
    d.sleeping = d.idleTime >= 7;
  }
  step(dt: number) {
    if (this.paused) return;
    dt = Math.min(dt, 1 / 30); this.time += dt; this.pasture.step(dt);
    this.panicLeft = Math.max(0, this.panicLeft - dt);
    for (const bark of this.barks) bark.age += dt;
    this.barks = this.barks.filter(b => b.age < BARK_LIFETIME);
    if (this.marker) { this.marker.age += dt; if (this.marker.age > 1.5) this.marker = null; }
    this.stepDog(dt);
    const dog = this.dog, scale = this.scale, herd = this.herdCenter(), animals = this.animals, birdSpots = this.birdLife.groundSpots;
    this.mouseLife.step(dt, this.width, this.height, this.pasture, dog);
    const driving = !!dog?.orbit && !dog.orbitEntering;
    for (const s of animals) {
      this.updateCompanions(s, dt); s.searchIn = Math.max(0, (s.searchIn ?? 0) - dt); s.barkLeft = Math.max(0, s.barkLeft - dt);
      for (const bark of this.barks) {
        if (bark.hitIds.has(s.id) || !barkTouches(bark, s.x, s.y, 24 * scale * s.size, dt)) continue;
        bark.hitIds.add(s.id);
        const dx = s.x - bark.x, dy = s.y - bark.y;
        const angle = Math.hypot(dx, dy) < 0.1 ? s.phase : Math.atan2(dy, dx);
        const goal = this.clampPoint(s.x + Math.cos(angle) * 104 * scale, s.y + Math.sin(angle) * 104 * scale);
        s.barkLeft = ABILITIES.q.duration; s.barkGoalX = goal.x; s.barkGoalY = goal.y;
      }
      s.timer -= dt; s.hunger = Math.min(1, s.hunger + dt * 0.004);
      let desiredX = 0, desiredY = 0, speed = s.speed * scale;
      const dogDist = dog && !dog.atHome ? Math.hypot(s.x - dog.x, s.y - dog.y) : Infinity;
      const avoidRadius = this.dogAvoidanceRadius();
      const alertRadius = dog?.sleeping ? 0 : avoidRadius * (0.95 + (s.courage - 1) * 0.25);
      const dogSpeed = dog ? Math.hypot(dog.vx, dog.vy) : 0;
      const expectedSpeed = dog?.orbit ? SPEEDS.dogOrbit : dog && (dog.sprint > 0 || dog.launching) ? SPEEDS.dogSprint : SPEEDS.dogWalk;
      const anticipation = dog && !dog.arrived && dogSpeed > 1 ? Math.max(1, expectedSpeed * scale * 0.9 / dogSpeed) : 1;
      const predictedDist = dog && !dog.sleeping && !dog.atHome ? Math.hypot(s.x - dog.x - dog.vx * anticipation * 0.55, s.y - dog.y - dog.vy * anticipation * 0.55) : Infinity;
      const pressureDist = Math.min(dogDist, predictedDist);
      const barking = s.barkLeft > 0 && Math.hypot(s.barkGoalX - s.x, s.barkGoalY - s.y) > 8 * scale;
      let food: Feed | undefined, nearest = 380 * scale;
      if (!barking && pressureDist > alertRadius * 0.85) for (const f of this.feed) {
        const d = Math.hypot(f.x - s.x, f.y - s.y); if (d < nearest && f.amount > 0.015) { food = f; nearest = d; }
      }
      if (barking || dog && pressureDist < alertRadius) {
        s.state = 'startled'; s.timer = 3;
        const dx = barking ? s.barkGoalX - s.x : s.x - dog!.x, dy = barking ? s.barkGoalY - s.y : s.y - dog!.y, d = Math.hypot(dx, dy) || 1;
        desiredX = dx / d; desiredY = dy / d;
        // Run along boundaries rather than piling every frightened sheep into a corner.
        const b = this.bounds, edge = 22 * scale;
        if ((s.x < b.left + edge && desiredX < 0) || (s.x > b.right - edge && desiredX > 0)) { desiredY += (s.y < (b.top + b.bottom) / 2 ? 1 : -1) * 0.8; desiredX *= 0.12; }
        if ((s.y < b.top + edge && desiredY < 0) || (s.y > b.bottom - edge && desiredY > 0)) { desiredX += (s.x < (b.left + b.right) / 2 ? 1 : -1) * 0.8; desiredY *= 0.12; }
        speed = barking ? Math.min(SPEEDS.sheepPanic * scale, d * 3) : (17 + 7 * Math.max(0, 1 - pressureDist / alertRadius)) * 1.25 * scale;
      } else if (food) {
        s.state = 'following'; s.goalX = food.x; s.goalY = food.y;
        if (nearest < 32 * scale) {
          const amount = Math.min(food.amount, dt * 0.085); food.amount -= amount; s.ate += amount; this.eaten += amount;
          s.hunger = Math.max(0, s.hunger - amount * 0.4); speed = 0;
        } else { desiredX = food.x - s.x; desiredY = food.y - s.y; speed = Math.min(SPEEDS.sheepFood, s.speed * 1.35) * scale; }
      } else {
        const parent = s.isLamb ? this.sheep.find(o => o.id === s.parentId) : undefined;
        const followingParent = parent && Math.hypot(parent.x - s.x, parent.y - s.y) > 74 * scale;
        if (s.state === 'startled' || s.state === 'following' || followingParent) this.freshGrass(s, s.state === 'startled');
        if (followingParent) speed = 14 * scale;
        if (s.state === 'grazing') {
          const mouthX = s.x + Math.cos(s.heading) * 44 * scale * s.size, mouthY = s.y + Math.sin(s.heading) * 44 * scale * s.size;
          const amount = this.pasture.bite(mouthX, mouthY, dt * (s.isLamb ? 0.7 : 1), 21 * scale * s.size);
          s.ate += amount; this.eaten += amount; s.hunger = Math.max(0, s.hunger - dt * 0.01); speed = 0;
          if ((this.pasture.edibleAt(mouthX, mouthY) < 0.25 || s.timer < 0) && (s.searchIn ?? 0) <= 0) this.freshGrass(s);
        }
        if (s.state === 'walking') {
          const dx = s.goalX - s.x, dy = s.goalY - s.y;
          if (Math.hypot(dx, dy) < 10 * scale || s.timer < 0) { s.state = 'grazing'; s.timer = 14 + this.random() * 16; speed = 0; }
          else { desiredX = dx; desiredY = dy; }
        }
      }
      const length = Math.hypot(desiredX, desiredY) || 1; desiredX = desiredX / length * speed; desiredY = desiredY / length * speed;
      for (const other of animals) {
        if (other === s) continue;
        const dx = s.x - other.x, dy = s.y - other.y, d = Math.hypot(dx, dy), spacing = (s.isLamb || other.isLamb ? 66 : 76) * scale * (s.size + other.size) * 0.5;
        if (d < spacing) { const k = (1 - d / spacing) ** 2 * 36 * scale; desiredX += (d < 0.001 ? s.id < other.id ? -1 : 1 : dx / d) * k; desiredY += (d < 0.001 ? 0.3 : dy / d) * k; }
      }
      for (const bird of birdSpots) {
        const dx = s.x - bird.x, dy = s.y - bird.y, distance = Math.hypot(dx, dy), radius = 90 * scale;
        if (distance >= radius) continue;
        const nx = distance > 0.01 ? dx / distance : Math.cos(s.phase), ny = distance > 0.01 ? dy / distance : Math.sin(s.phase);
        const strength = 1 - distance / radius, approaching = desiredX * nx + desiredY * ny < 0;
        const cross = desiredX * ny - desiredY * nx;
        const side = Math.abs(cross) > 0.1 ? -Math.sign(cross) : hash3(s.id, bird.id, 183) > 0.5 ? 1 : -1;
        desiredX += nx * strength * 40 * scale + (approaching ? -ny * side * strength * 12 * scale : 0);
        desiredY += ny * strength * 40 * scale + (approaching ? nx * side * strength * 12 * scale : 0);
      }
      // Sleeping dogs still get a little personal space, without startling the flock.
      if (dog?.sleeping && dogDist < avoidRadius) {
        const dx = s.x - dog.x, dy = s.y - dog.y, distance = dogDist || 1;
        const push = (1 - dogDist / avoidRadius) * 23 * scale;
        const toward = desiredX * dx / distance + desiredY * dy / distance;
        if (toward < 0) { desiredX -= dx / distance * toward; desiredY -= dy / distance * toward; }
        desiredX += (dogDist < 0.001 ? 1 : dx / distance) * push;
        desiredY += dy / distance * push;
      }
      const hx = s.x - this.home.x, hy = s.y - this.home.y, hd = Math.hypot(hx, hy) || 1;
      if (hd < 70 * scale) { desiredX += hx / hd * 25 * scale; desiredY += hy / hd * 25 * scale; }
      if (driving && !barking) {
        const dx = herd.x - s.x, dy = herd.y - s.y, distance = Math.hypot(dx, dy);
        const radius = Math.max(75 * scale, 43 * Math.sqrt(animals.length) * scale);
        if (distance > radius * 0.85) {
          const pull = Math.min(20 * scale, 5 * scale + (distance - radius * 0.85) * 0.065);
          desiredX += dx / (distance || 1) * pull; desiredY += dy / (distance || 1) * pull;
          if (s.state === 'grazing') s.state = 'walking';
        }
      }
      const fenceObstacles = this.fieldFences.obstacles(49 * s.size * scale);
      if (fenceObstacles.length) {
        const goal = s.state === 'startled' ? this.clampPoint(s.x + desiredX * 6, s.y + desiredY * 6) : { x: s.goalX, y: s.goalY };
        const blocked = !segmentClear(s, goal, fenceObstacles);
        if (blocked || s.fencePath?.length) {
          if (s.fenceRevision !== this.fieldFences.revision || !s.fencePath?.length || this.time - (s.fenceNavAt ?? -10) > 1.5 || !s.fenceGoal || Math.hypot(goal.x - s.fenceGoal.x, goal.y - s.fenceGoal.y) > 70 * scale) {
            s.fencePath = planDogPath(s, goal, this.bounds, fenceObstacles, 16 * scale); s.fenceNavAt = this.time; s.fenceGoal = goal; s.fenceRevision = this.fieldFences.revision;
          }
          while (s.fencePath.length && Math.hypot(s.x - s.fencePath[0].x, s.y - s.fencePath[0].y) < 6 * scale) s.fencePath.shift();
          if (!blocked) s.fencePath = [];
          const target = s.fencePath[0];
          if (target) { const dx = target.x - s.x, dy = target.y - s.y, d = Math.hypot(dx, dy) || 1, v = Math.max(speed, Math.hypot(desiredX, desiredY)); desiredX = dx / d * v; desiredY = dy / d * v; }
        }
      }
      const cap = (barking ? SPEEDS.sheepPanic : driving ? 34 : s.state === 'startled' ? SPEEDS.sheepChased : s.state === 'following' ? SPEEDS.sheepFood : SPEEDS.sheepWalk + 2) * scale;
      const desiredSpeed = Math.hypot(desiredX, desiredY);
      if (desiredSpeed > cap) { desiredX *= cap / desiredSpeed; desiredY *= cap / desiredSpeed; }
      const blend = 1 - Math.exp(-dt * (s.state === 'startled' ? 3.5 : 2));
      s.vx += (desiredX - s.vx) * blend; s.vy += (desiredY - s.vy) * blend;
      const v = Math.hypot(s.vx, s.vy);
      if (v > cap) { s.vx *= cap / v; s.vy *= cap / v; }
      const proposed = this.clampPoint(s.x + s.vx * dt, s.y + s.vy * dt), fraction = safeMovementFraction(s, proposed, fenceObstacles);
      s.x += (proposed.x - s.x) * fraction; s.y += (proposed.y - s.y) * fraction;
      if (fraction < 1) { s.vx *= fraction; s.vy *= fraction; }
      if (v > 2) s.heading = angleDelta(0, s.heading + clamp(angleDelta(s.heading, Math.atan2(s.vy, s.vx)), -dt * 1.7, dt * 1.7));
    }
    this.resolveOverlaps(dt, animals);
    this.birdLife.step(dt, this.width, this.height, this.pasture, animals, dog, this.barks, this.fencePosts, this.pen, this.mouseLife, this.fieldFences);
    for (const f of this.feed) f.age += dt;
    this.feed = this.feed.filter(f => f.amount > 0.015 && f.age < 120);
  }
  /** A soft spacing zone plus positional relaxation leaves only a little wool overlap. */
  private resolveOverlaps(dt: number, animals: Sheep[]) {
    const cap = 1.05 * this.scale * dt * 60;
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < animals.length; i++) for (let j = i + 1; j < animals.length; j++) {
      const a = animals[i], b = animals[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const min = 50 * this.scale * (a.size + b.size) * 0.5;
      if (d >= min) continue;
      const angle = hash3(a.id, b.id, 33) * TAU, nx = d < 0.001 ? Math.cos(angle) : dx / d, ny = d < 0.001 ? Math.sin(angle) : dy / d;
      const push = Math.min(cap, (min - d) * 0.32);
      for (const [s, direction] of [[a, -1], [b, 1]] as const) {
        const p = this.clampPoint(s.x + nx * push * direction, s.y + ny * push * direction);
        const fraction = safeMovementFraction(s, p, this.fieldFences.obstacles(49 * s.size * this.scale));
        s.x += (p.x - s.x) * fraction; s.y += (p.y - s.y) * fraction;
      }
    }
  }
}
