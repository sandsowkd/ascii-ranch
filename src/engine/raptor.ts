import type { Bird } from '../simulation/Birds';

/** Broad shoulders, a bent wrist, rounded secondaries and five separate primaries. */
const wing = [[4, 3], [8, 9], [3, 18], [10, 26], [5, 33], [-4, 35], [-12, 29], [-18, 20], [-13, 12], [-10, 4]];
const fingers = [
  [8, 27, 10, 36], [4, 30, 4, 41], [-1, 31, -2, 43], [-6, 30, -9, 41], [-10, 27, -16, 36],
];
function inPolygon(x: number, y: number) {
  let inside = false;
  for (let i = 0, j = wing.length - 1; i < wing.length; j = i++) {
    const a = wing[i], b = wing[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function hawkPose(time: number, bird: Pick<Bird, 'state' | 'phase' | 'age'>) {
  const clock = time + bird.phase, cycle = (clock % 6 + 6) % 6;
  const envelope = Math.max(0, Math.min(1, cycle / 0.3, (3.8 - cycle) / 0.3));
  const launching = bird.state === 'departing' && bird.age < 2;
  const beat = Math.sin(clock * Math.PI * 2 * 0.9) * (launching ? 1 : envelope);
  const braking = bird.state === 'striking';
  const diving = bird.state === 'swooping';
  return { beat: braking || diving ? 0 : beat, spread: braking ? 1 : diving ? 0.72 : 0.8 + beat * 0.2 };
}
export function hawkWingAt(along: number, side: number, pose: ReturnType<typeof hawkPose>, bank = 0) {
  const spread = pose.spread * (side < 0 ? 1 - bank * 0.12 : 1 + bank * 0.12);
  const y = Math.abs(side) / spread;
  const x = along - pose.beat * 8 * (y / 43) ** 2;
  if (inPolygon(x, y)) return { feather: false, covert: y < 18 };
  for (const [ax, ay, bx, by] of fingers) {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(x - ax - dx * t, y - ay - dy * t) < 2) return { feather: true, covert: false };
  }
  return null;
}
