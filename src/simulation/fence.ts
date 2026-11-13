import type { Point } from './route';
import type { Obstacle } from './navigation';

export interface FenceRect { left: number; right: number; top: number; bottom: number }
export interface Fence { rails: { a: Point; b: Point }[]; posts: Point[]; obstacles: Obstacle[]; gate: Point }
export function makeFence(p: FenceRect, scale: number): Fence {
  const cy = (p.top + p.bottom) / 2, halfGate = 70 * scale;
  const rails = [
    { a: { x: p.left, y: p.top }, b: { x: p.right, y: p.top } },
    { a: { x: p.right, y: p.top }, b: { x: p.right, y: p.bottom } },
    { a: { x: p.right, y: p.bottom }, b: { x: p.left, y: p.bottom } },
    { a: { x: p.left, y: p.top }, b: { x: p.left, y: cy - halfGate } },
    { a: { x: p.left, y: cy + halfGate }, b: { x: p.left, y: p.bottom } },
  ];
  const posts: Point[] = [], obstacles: Obstacle[] = [];
  const addPost = (q: Point) => { if (!posts.some(o => Math.hypot(o.x - q.x, o.y - q.y) < 2 * scale)) posts.push(q); };
  for (const rail of rails) {
    const length = Math.hypot(rail.b.x - rail.a.x, rail.b.y - rail.a.y), steps = Math.ceil(length / (16 * scale));
    for (let j = 0; j <= steps; j++) obstacles.push({ x: rail.a.x + (rail.b.x - rail.a.x) * j / steps, y: rail.a.y + (rail.b.y - rail.a.y) * j / steps, radius: 58 * scale });
    const spans = Math.max(1, Math.ceil(length / (55 * scale)));
    for (let j = 0; j <= spans; j++) addPost({ x: rail.a.x + (rail.b.x - rail.a.x) * j / spans, y: rail.a.y + (rail.b.y - rail.a.y) * j / spans });
  }
  return { rails, posts, obstacles, gate: { x: p.left, y: cy } };
}
