import type { Point } from './route';
import type { Obstacle } from './navigation';

export interface FenceRect { left: number; right: number; top: number; bottom: number }
export interface Fence { rails: { a: Point; b: Point }[]; posts: Point[]; obstacles: Obstacle[]; gate: Point }
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
