import type { Point } from './route';
import type { Obstacle } from './navigation';

export interface FenceRect { left: number; right: number; top: number; bottom: number }
export interface Fence { rails: { a: Point; b: Point }[]; posts: Point[]; obstacles: Obstacle[]; gate: Point }
export interface FenceSegment { a: Point; b: Point }
export function closestOnFence(p: Point, rail: FenceSegment): Point {
  const dx = rail.b.x - rail.a.x, dy = rail.b.y - rail.a.y;
  const t = Math.max(0, Math.min(1, ((p.x - rail.a.x) * dx + (p.y - rail.a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { x: rail.a.x + dx * t, y: rail.a.y + dy * t };
}

/** User-drawn straight rails share geometry between navigation and rendering. */
export class FieldFences {
  rails: FenceSegment[] = [];
  revision = 0;
  private obstacleCache = new Map<number, Obstacle[]>();
  private cachedPosts: Point[] | null = null;
  constructor(public scale = 1) {}
  private changed() { this.revision++; this.obstacleCache.clear(); this.cachedPosts = null; }
  add(a: Point, b: Point) { this.rails.push({ a: { ...a }, b: { ...b } }); this.changed(); }
  undo() { if (!this.rails.length) return false; this.rails.pop(); this.changed(); return true; }
  reset() { this.rails.length = 0; this.changed(); }
  resize(sx: number, sy: number, scale: number) {
    for (const rail of this.rails) for (const p of [rail.a, rail.b]) { p.x *= sx; p.y *= sy; }
    this.scale = scale; this.changed();
  }
  get posts(): Point[] {
    if (this.cachedPosts) return this.cachedPosts;
    const posts: Point[] = [];
    for (const rail of this.rails) {
      const spans = Math.max(1, Math.ceil(Math.hypot(rail.b.x - rail.a.x, rail.b.y - rail.a.y) / (110 * this.scale)));
      for (let j = 0; j <= spans; j++) {
        const p = { x: rail.a.x + (rail.b.x - rail.a.x) * j / spans, y: rail.a.y + (rail.b.y - rail.a.y) * j / spans };
        if (!posts.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 8 * this.scale)) posts.push(p);
      }
    }
    return this.cachedPosts = posts;
  }
  obstacles(padding: number): Obstacle[] {
    const cached = this.obstacleCache.get(padding); if (cached) return cached;
    const obstacles: Obstacle[] = [];
    for (const rail of this.rails) {
      const steps = Math.max(1, Math.ceil(Math.hypot(rail.b.x - rail.a.x, rail.b.y - rail.a.y) / (10 * this.scale)));
      for (let j = 0; j <= steps; j++) obstacles.push({ x: rail.a.x + (rail.b.x - rail.a.x) * j / steps, y: rail.a.y + (rail.b.y - rail.a.y) * j / steps, radius: padding + 6 * this.scale });
    }
    this.obstacleCache.set(padding, obstacles); return obstacles;
  }
  clear(p: Point, padding: number) { return this.rails.every(r => { const q = closestOnFence(p, r); return Math.hypot(q.x - p.x, q.y - p.y) >= padding + 6 * this.scale; }); }
  outside(p: Point, padding: number): Point {
    let q = { ...p };
    for (let pass = 0; pass < 4; pass++) for (const rail of this.rails) {
      const near = closestOnFence(q, rail), dx = q.x - near.x, dy = q.y - near.y, distance = Math.hypot(dx, dy), radius = padding + 6 * this.scale + 0.5;
      if (distance >= radius) continue;
      const length = Math.hypot(rail.b.x - rail.a.x, rail.b.y - rail.a.y) || 1;
      q = { x: near.x + (distance > 0.001 ? dx / distance : -(rail.b.y - rail.a.y) / length) * radius,
        y: near.y + (distance > 0.001 ? dy / distance : (rail.b.x - rail.a.x) / length) * radius };
    }
    return q;
  }
}
export function gateLeaf(p: FenceRect, openness: number) {
  const angle = Math.max(0, Math.min(1, openness)) * Math.PI / 2, length = p.bottom - p.top;
  return { a: { x: p.left, y: p.top }, b: { x: p.left - Math.sin(angle) * length, y: p.top + Math.cos(angle) * length } };
}
export function makeFence(p: FenceRect, scale: number): Fence {
  const cy = (p.top + p.bottom) / 2;
  const rails = [
    { a: { x: p.left, y: p.top }, b: { x: p.right, y: p.top } },
    { a: { x: p.right, y: p.top }, b: { x: p.right, y: p.bottom } },
    { a: { x: p.right, y: p.bottom }, b: { x: p.left, y: p.bottom } },
  ];
  const posts: Point[] = [], obstacles: Obstacle[] = [];
  const addPost = (q: Point) => { if (!posts.some(o => Math.hypot(o.x - q.x, o.y - q.y) < 2 * scale)) posts.push(q); };
  // Field navigation treats the pen as enclosed. Only the straight gate passage
  // can cross its left edge; its narrow interior cannot fit a turning dog.
  for (const rail of [...rails, gateLeaf(p, 0)]) {
    const length = Math.hypot(rail.b.x - rail.a.x, rail.b.y - rail.a.y), steps = Math.max(1, Math.ceil(length / (16 * scale)));
    for (let j = 0; j <= steps; j++) obstacles.push({ x: rail.a.x + (rail.b.x - rail.a.x) * j / steps, y: rail.a.y + (rail.b.y - rail.a.y) * j / steps, radius: 55 * scale });
    // One middle post on each long side; just corners on the short sides.
    const spans = length > 90 * scale ? 2 : 1;
    for (let j = 0; j <= spans; j++) addPost({ x: rail.a.x + (rail.b.x - rail.a.x) * j / spans, y: rail.a.y + (rail.b.y - rail.a.y) * j / spans });
  }
  return { rails, posts, obstacles, gate: { x: p.left, y: cy } };
}
