import { expect, it } from 'vitest';
import { planDogPath, safeMovementFraction, segmentClear } from '../src/simulation/navigation';

it('plans a clear route around a joined cluster and returns to the requested goal', () => {
  const obstacles = [260, 340, 420].map(y => ({ x: 500, y, radius: 58 }));
  const start = { x: 200, y: 340 }, goal = { x: 800, y: 340 };
  const path = planDogPath(start, goal, { left: 20, right: 980, top: 80, bottom: 700 }, obstacles);
  expect(path.length).toBeGreaterThan(1); expect(path.at(-1)).toEqual(goal);
  let previous = start;
  for (const point of path) { expect(segmentClear(previous, point, obstacles)).toBe(true); previous = point; }
});
it('stops a continuous movement before contact and does not tunnel through sheep', () => {
  const a = { x: 0, y: 0 }, b = { x: 100, y: 0 }, obstacle = [{ x: 50, y: 0, radius: 10 }];
  const fraction = safeMovementFraction(a, b, obstacle);
  expect(fraction).toBeLessThan(0.4); expect(fraction).toBeGreaterThan(0.39);
});
it('returns a safe stopping point when the requested spot is occupied', () => {
  const start = { x: 100, y: 300 }, goal = { x: 500, y: 300 }, obstacles = [{ ...goal, radius: 60 }];
  const path = planDogPath(start, goal, { left: 20, right: 900, top: 80, bottom: 700 }, obstacles);
  expect(path.length).toBeGreaterThan(0);
  const last = path.at(-1)!; expect(Math.hypot(last.x - goal.x, last.y - goal.y)).toBeGreaterThanOrEqual(60);
  let previous = start; for (const point of path) { expect(segmentClear(previous, point, obstacles)).toBe(true); previous = point; }
});
