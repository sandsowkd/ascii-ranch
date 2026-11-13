import type { Point } from './route';
export interface Obstacle extends Point { radius: number }
export interface NavigationBounds { left: number; right: number; top: number; bottom: number }
const square = (n: number) => n * n;
export function segmentClear(a: Point, b: Point, obstacles: Obstacle[]) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  for (const o of obstacles) {
    const start = square(a.x - o.x) + square(a.y - o.y);
    // A moving sheep can enter the dog's clearance zone; permit a clean exit.
    if (start < o.radius * o.radius && square(b.x - o.x) + square(b.y - o.y) > start && (a.x - o.x) * dx + (a.y - o.y) * dy >= 0) continue;
    const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / (length || 1)));
    if (square(a.x + dx * t - o.x) + square(a.y + dy * t - o.y) < square(o.radius + 0.2)) return false;
  }
  return true;
}
/** Continuous collision detection, including at sprint speeds. */
export function safeMovementFraction(a: Point, b: Point, obstacles: Obstacle[]) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  if (length < 1e-10) return 1;
  let allowed = 1;
  for (const o of obstacles) {
    const ox = a.x - o.x, oy = a.y - o.y, c = ox * ox + oy * oy - o.radius * o.radius, dot = ox * dx + oy * dy;
    if (c < 0 && dot >= 0) continue;
    if (c < 0) { allowed = 0; continue; }
    const discriminant = dot * dot - length * c;
    if (discriminant < 0) continue;
    const t = (-dot - Math.sqrt(discriminant)) / length;
    if (t >= 0 && t < allowed) allowed = Math.max(0, t - 0.02 / Math.sqrt(length));
  }
  return allowed;
}
/** A small visibility-smoothed A* grid around the current animal footprints. */
export function planDogPath(start: Point, goal: Point, bounds: NavigationBounds, obstacles: Obstacle[], cell = 22): Point[] {
  if (segmentClear(start, goal, obstacles)) return [goal];
  const cols = Math.max(2, Math.ceil((bounds.right - bounds.left) / cell) + 1);
  const rows = Math.max(2, Math.ceil((bounds.bottom - bounds.top) / cell) + 1), count = cols * rows;
  const dx = (bounds.right - bounds.left) / (cols - 1), dy = (bounds.bottom - bounds.top) / (rows - 1);
  const idAt = (p: Point) => Math.max(0, Math.min(rows - 1, Math.round((p.y - bounds.top) / (dy || 1)))) * cols + Math.max(0, Math.min(cols - 1, Math.round((p.x - bounds.left) / (dx || 1))));
  const first = idAt(start), pointAt = (id: number): Point => id === first ? start : ({ x: bounds.left + id % cols * dx, y: bounds.top + Math.floor(id / cols) * dy });
  const free = new Uint8Array(count), cost = new Float64Array(count).fill(Infinity), parent = new Int32Array(count).fill(-1), closed = new Uint8Array(count);
  let last = first, nearest = Infinity;
  for (let i = 0; i < count; i++) {
    const p = pointAt(i); free[i] = Number(!obstacles.some(o => square(p.x - o.x) + square(p.y - o.y) < square(o.radius + 0.2)));
    if (free[i]) { const d = Math.hypot(p.x - goal.x, p.y - goal.y); if (d < nearest) { nearest = d; last = i; } }
  }
  free[first] = 1; cost[first] = 0;
  const heuristic = (id: number) => { const p = pointAt(id), q = pointAt(last); return Math.hypot(p.x - q.x, p.y - q.y); };
  const heap: { id: number; f: number }[] = [];
  const push = (id: number, f: number) => {
    heap.push({ id, f }); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], tail = heap.pop()!;
    if (heap.length) { heap[0] = tail; let i = 0; for (;;) { let c = i * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[i].f <= heap[c].f) break; [heap[i], heap[c]] = [heap[c], heap[i]]; i = c; } }
    return top.id;
  };
  push(first, heuristic(first)); let best = first, bestDistance = heuristic(first);
  while (heap.length) {
    const id = pop(); if (closed[id]) continue; closed[id] = 1;
    const remaining = heuristic(id); if (remaining < bestDistance) { best = id; bestDistance = remaining; }
    if (id === last) { best = id; break; }
    const col = id % cols, row = Math.floor(id / cols), a = pointAt(id);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if ((!ox && !oy) || col + ox < 0 || col + ox >= cols || row + oy < 0 || row + oy >= rows) continue;
      const next = (row + oy) * cols + col + ox;
      if (!free[next] || closed[next]) continue;
      const b = pointAt(next); if (!segmentClear(a, b, obstacles)) continue;
      const nextCost = cost[id] + Math.hypot(b.x - a.x, b.y - a.y);
      if (nextCost < cost[next]) { cost[next] = nextCost; parent[next] = id; push(next, nextCost + heuristic(next)); }
    }
  }
  const raw: Point[] = [];
  for (let id = best; id !== first && id >= 0; id = parent[id]) raw.push(pointAt(id));
  raw.reverse();
  if (raw.length && segmentClear(raw[raw.length - 1], goal, obstacles)) raw.push(goal);
  const path: Point[] = []; let from = start;
  for (let i = 0; i < raw.length;) {
    let far = raw.length - 1; while (far > i && !segmentClear(from, raw[far], obstacles)) far--;
    path.push(raw[far]); from = raw[far]; i = far + 1;
  }
  return path;
}
