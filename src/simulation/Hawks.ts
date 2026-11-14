import { clamp, hash3, TAU } from '../vendor/pond-math';
import { mouseExposed, type MouseCover, type MouseLife } from './Mice';
import type { Bird } from './Birds';
import type { Pasture } from './Pasture';

interface Point { x: number; y: number }
export interface HawkHunt {
  center: Point; radius: number; angle: number; sweep: number; direction: number; totalTime: number;
  entry?: Point; baseRadius?: number; plannedSweep?: number;
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
function planHunt(b: Bird, mouse: Point, width: number, height: number, scale: number): HawkHunt {
  const radius = Math.min((76 + hash3(b.id, 9, 781) * 78) * scale, width * 0.21, (height - 140) * 0.23);
  const center = circleCenter(mouse, radius, width, height), distance = Math.hypot(b.x - center.x, b.y - center.y);
  const from = Math.atan2(b.y - center.y, b.x - center.x), tangent = Math.acos(Math.min(1, radius / Math.max(radius, distance)));
  // Enter along a tangent, choosing the side that needs the gentler turn from
  // the incoming flight. This avoids flying radially in, then snapping sideways.
  const options = [-1, 1].map(direction => {
    const angle = from + direction * tangent, entry = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    const heading = Math.atan2(entry.y - b.y, entry.x - b.x);
    return { direction, angle, entry, turn: Math.abs(Math.atan2(Math.sin(heading - b.heading), Math.cos(heading - b.heading))) };
  }).sort((a, z) => a.turn - z.turn);
  const chosen = options[0], variation = hash3(b.id, 11, 781);
  return { center, radius, baseRadius: radius, angle: chosen.angle, sweep: 0, direction: chosen.direction, totalTime: 0, entry: chosen.entry,
    plannedSweep: Math.PI * (1 + variation * variation * 3) };
}
function depart(b: Bird) { b.state = 'departing'; b.age = 0; b.targetMouseId = undefined; }
function beginDive(b: Bird, mouse: Point, scale: number) {
  const h = b.hunt!;
  h.dive = { start: { x: b.x, y: b.y }, control: { x: b.x + Math.cos(b.heading) * 62 * scale, y: b.y + Math.sin(b.heading) * 62 * scale },
    end: { ...mouse }, elapsed: 0, duration: clamp(Math.hypot(mouse.x - b.x, mouse.y - b.y) / (105 * scale) + 0.6, 1.35, 2.2), altitude: b.altitude };
  b.state = 'swooping'; b.age = 0;
}

/** A tangent approach, a variable banked hunting arc, a controlled descent and grab,
 * and a climbing departure. Capture is resolved once, at the actual strike. */
export function stepHawk(b: Bird, dt: number, width: number, height: number, pasture: Pasture, animals: MouseCover[], mice?: MouseLife) {
  const scale = width < 600 ? 0.79 : 1, mouse = mice?.mice.find(m => m.id === b.targetMouseId);
  if (b.state !== 'departing' && b.targetMouseId !== undefined && (!mouse || !mouseExposed(mouse, animals, scale) || mouse.x < 0 || mouse.x > width || mouse.y < 0 || mouse.y > height)) depart(b);
  if (b.state === 'departing' || !mouse) {
    flyToward(b, { x: b.exitX, y: b.exitY }, 132 * scale, dt);
    b.altitude = Math.min(1.8, b.altitude + dt * 1.1);
    if (b.age > 20) { b.x = b.exitX; b.y = b.exitY; }
    return;
  }
  if (!b.hunt) b.hunt = planHunt(b, mouse, width, height, scale);
  const h = b.hunt; h.totalTime += dt;
  if (h.totalTime > 35) { depart(b); return; }
  if (b.state === 'soaring') {
    const entry = h.entry ?? { x: h.center.x + Math.cos(h.angle) * h.radius, y: h.center.y + Math.sin(h.angle) * h.radius };
    flyToward(b, entry, 115 * scale, dt); b.altitude = 1.8;
    if (Math.hypot(b.x - entry.x, b.y - entry.y) < 12 * scale) {
      h.angle = Math.atan2(b.y - h.center.y, b.x - h.center.x);
      b.state = 'circling'; b.age = 0;
    }
    return;
  }
  if (b.state === 'circling') {
    const base = h.baseRadius ?? h.radius, desiredRadius = base * (1 + Math.sin(h.sweep * 0.65) * 0.14);
    h.radius += (desiredRadius - h.radius) * Math.min(1, dt * 0.8);
    const wanted = circleCenter(mouse, base, width, height), dx = wanted.x - h.center.x, dy = wanted.y - h.center.y, distance = Math.hypot(dx, dy) || 1;
    const drift = Math.min(distance, dt * 7 * scale); h.center.x += dx / distance * drift; h.center.y += dy / distance * drift;
    const angle = Math.atan2(b.y - h.center.y, b.x - h.center.x), radialDistance = Math.hypot(b.x - h.center.x, b.y - h.center.y);
    const correction = clamp((radialDistance - h.radius) / h.radius * 1.7, -0.65, 0.65);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    turn(b, Math.atan2(ux * h.direction - uy * correction, -uy * h.direction - ux * correction), dt, 2.1);
    // Integrate flight rather than projecting the bird onto a perfect circle.
    // Its position and heading both stay continuous at the approach and dive.
    b.x += Math.cos(b.heading) * dt * 100 * scale; b.y += Math.sin(b.heading) * dt * 100 * scale;
    const nextAngle = Math.atan2(b.y - h.center.y, b.x - h.center.x);
    h.sweep += Math.max(0, Math.atan2(Math.sin(nextAngle - angle), Math.cos(nextAngle - angle)) * h.direction); h.angle = nextAngle;
    b.altitude += (1.8 + Math.sin(h.sweep * 2) * 0.08 - b.altitude) * Math.min(1, dt * 2);
    if (h.sweep >= (h.plannedSweep ?? TAU)) beginDive(b, mouse, scale);
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
