export interface Point { x: number; y: number }
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** The convex hull of circular footprints makes a snug outline with rounded ends. */
export function roundedEnvelope(points: Point[], padding: number): Point[] {
  const cloud: Point[] = [];
  for (const p of points) for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    cloud.push({ x: p.x + Math.cos(a) * padding, y: p.y + Math.sin(a) * padding });
  }
  cloud.sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Point[]) => { const h: Point[] = []; for (const p of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  return [...half(cloud), ...half([...cloud].reverse())];
}
export function perimeter(path: Point[]) {
  return path.reduce((sum, p, i) => { const q = path[(i + 1) % path.length]; return sum + Math.hypot(q.x - p.x, q.y - p.y); }, 0);
}
export function nearestOnRoute(path: Point[], p: Point) {
  let best = { x: path[0].x, y: path[0].y, edge: 0, distance: Infinity };
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const x = a.x + dx * t, y = a.y + dy * t, distance = Math.hypot(x - p.x, y - p.y);
    if (distance < best.distance) best = { x, y, edge: i, distance };
  }
  return best;
}
export function aheadOnRoute(path: Point[], from: Point & { edge: number }, distance: number): Point {
  let p = from;
  for (let n = 0; n <= path.length; n++) {
    const next = path[(p.edge + 1) % path.length], length = Math.hypot(next.x - p.x, next.y - p.y);
    if (length >= distance) { const t = distance / (length || 1); return { x: p.x + (next.x - p.x) * t, y: p.y + (next.y - p.y) * t }; }
    distance -= length; p = { ...next, edge: (p.edge + 1) % path.length };
  }
  return p;
}
