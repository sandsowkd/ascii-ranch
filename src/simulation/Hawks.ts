import { clamp, hash3, TAU } from '../vendor/pond-math';
import { mouseExposed, type MouseCover, type MouseLife } from './Mice';
import type { Bird } from './Birds';
import type { Pasture } from './Pasture';

interface Point { x: number; y: number }
export interface HawkHunt {
  center: Point; radius: number; angle: number; sweep: number; direction: number; totalTime: number;
  dive?: { start: Point; control: Point; end: Point; elapsed: number; duration: number; altitude: number };
  resolved?: boolean;
}
function turn(b: Bird, angle: number, dt: number, rate = 2.8) {
  const delta = Math.atan2(Math.sin(angle - b.heading), Math.cos(angle - b.heading));
  b.heading += clamp(delta, -dt * rate, dt * rate);
}
function flyToward(b: Bird, goal: Point, speed: number, dt: number) {
  const dx = goal.x - b.x, dy = goal.y - b.y, distance = Math.hypot(dx, dy);
  turn(b, Math.atan2(dy, dx), dt);
  const travel = Math.min(speed, Math.max(35, distance * 2.5)) * dt;
  if (distance <= travel + 1) { b.x = goal.x; b.y = goal.y; return; }
  b.x += Math.cos(b.heading) * travel; b.y += Math.sin(b.heading) * travel;
}
function circleCenter(prey: Point, radius: number, width: number, height: number) {
  return { x: clamp(prey.x, radius + 25, width - radius - 25), y: clamp(prey.y, 110 + radius, height - 80 - radius) };
}
function depart(b: Bird) { b.state = 'departing'; b.age = 0; b.targetMouseId = undefined; }
function beginDive(b: Bird, mouse: Point, scale: number) {
  const h = b.hunt!;
  h.dive = { start: { x: b.x, y: b.y }, control: { x: b.x + Math.cos(b.heading) * 62 * scale, y: b.y + Math.sin(b.heading) * 62 * scale },
    end: { ...mouse }, elapsed: 0, duration: clamp(Math.hypot(mouse.x - b.x, mouse.y - b.y) / (105 * scale) + 0.6, 1.35, 2.2), altitude: b.altitude };
  b.state = 'swooping'; b.age = 0;
}

/** A banked search circle, a curved controlled descent, a brief feet-first grab,
 * and a climbing departure. Capture is resolved once, at the actual strike. */
export function stepHawk(b: Bird, dt: number, width: number, height: number, pasture: Pasture, animals: MouseCover[], mice?: MouseLife) {
  const scale = width < 600 ? 0.79 : 1, mouse = mice?.mice.find(m => m.id === b.targetMouseId);
  if (b.state !== 'departing' && b.targetMouseId !== undefined && (!mouse || !mouseExposed(mouse, animals, scale))) depart(b);
  if (b.state === 'departing' || !mouse) {
    flyToward(b, { x: b.exitX, y: b.exitY }, 132 * scale, dt);
    b.altitude = Math.min(1.8, b.altitude + dt * 1.1);
    if (b.age > 20) { b.x = b.exitX; b.y = b.exitY; }
    return;
  }
  if (!b.hunt) {
    const radius = Math.min((90 + hash3(b.id, 9, 781) * 18) * scale, width * 0.21, (height - 140) * 0.23);
    b.hunt = { center: circleCenter(mouse, radius, width, height), radius, angle: 0, sweep: 0,
      direction: hash3(b.id, 10, 781) < 0.5 ? -1 : 1, totalTime: 0 };
  }
  const h = b.hunt; h.totalTime += dt;
  if (h.totalTime > 35) { depart(b); return; }
  if (b.state === 'soaring') {
    const angle = Math.atan2(b.y - h.center.y, b.x - h.center.x);
    const entry = { x: h.center.x + Math.cos(angle) * h.radius, y: h.center.y + Math.sin(angle) * h.radius };
    flyToward(b, entry, 115 * scale, dt); b.altitude = 1.8;
    if (Math.hypot(b.x - entry.x, b.y - entry.y) < 12 * scale) {
      h.angle = Math.atan2(b.y - h.center.y, b.x - h.center.x); h.radius = Math.hypot(b.x - h.center.x, b.y - h.center.y);
      b.state = 'circling'; b.age = 0;
    }
    return;
  }
  if (b.state === 'circling') {
    const wanted = circleCenter(mouse, h.radius, width, height), dx = wanted.x - h.center.x, dy = wanted.y - h.center.y, distance = Math.hypot(dx, dy) || 1;
    const drift = Math.min(distance, dt * 10 * scale); h.center.x += dx / distance * drift; h.center.y += dy / distance * drift;
    const arc = dt * 100 * scale / Math.max(25, h.radius); h.angle += arc * h.direction; h.sweep += arc;
    b.x = h.center.x + Math.cos(h.angle) * h.radius; b.y = h.center.y + Math.sin(h.angle) * h.radius;
    turn(b, h.angle + h.direction * Math.PI / 2, dt); b.altitude = 1.8 + Math.sin(h.angle * 2) * 0.1;
    if (h.sweep >= TAU * (1 + hash3(b.id, 11, 781) * 0.18)) beginDive(b, mouse, scale);
    return;
  }
  if (b.state === 'swooping') {
    if (!h.dive) beginDive(b, mouse, scale);
    const d = h.dive!, dx = mouse.x - d.end.x, dy = mouse.y - d.end.y, distance = Math.hypot(dx, dy) || 1;
    const follow = Math.min(distance, dt * 105 * scale); d.end.x += dx / distance * follow; d.end.y += dy / distance * follow;
    d.elapsed += dt; const t = Math.min(1, d.elapsed / d.duration), u = 1 - t;
    const x = u * u * d.start.x + 2 * u * t * d.control.x + t * t * d.end.x, y = u * u * d.start.y + 2 * u * t * d.control.y + t * t * d.end.y;
    if (Math.hypot(x - b.x, y - b.y) > 0.01) turn(b, Math.atan2(y - b.y, x - b.x), dt);
    b.x = x; b.y = y; b.altitude = d.altitude * (1 - t * t * (3 - 2 * t));
    if (t >= 1) { b.state = 'striking'; b.age = 0; }
    return;
  }
  if (b.state === 'striking') {
    b.altitude = 0; b.x += Math.cos(b.heading) * dt * 12 * scale; b.y += Math.sin(b.heading) * dt * 12 * scale;
    if (b.age < 0.22 || h.resolved) return;
    h.resolved = true;
    const feet = { x: b.x + Math.cos(b.heading) * 10 * scale, y: b.y + Math.sin(b.heading) * 10 * scale };
    if (mouseExposed(mouse, animals, scale) && Math.hypot(mouse.x - feet.x, mouse.y - feet.y) < 30 * scale && (b.catchRoll ?? hash3(b.id, 8, 781)) < 0.5) b.caughtMouse = mice!.catch(mouse.id);
    else mice!.flee(mouse, b, width, height, pasture);
    depart(b);
  }
}
