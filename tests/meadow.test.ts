import { describe, expect, it } from 'vitest';
import { World, SPEEDS } from '../src/simulation/World';
import { Pasture } from '../src/simulation/Pasture';

function advance(world: World, seconds: number) { for (let i = 0; i < seconds * 60; i++) world.step(1 / 60); }
describe('the living pasture', () => {
  it('eats a local patch without changing distant grass', () => {
    const p = new Pasture(900, 700), near = p.index(400, 300), far = p.index(80, 80);
    const initial = p.grass[near], untouched = p.grass[far];
    expect(p.bite(400, 300, 1, 25)).toBeGreaterThan(0);
    expect(p.grass[near]).toBeLessThan(initial); expect(initial - p.grass[near]).toBeLessThanOrEqual(0.055); expect(p.grass[far]).toBe(untouched);
  });
  it('starts with a completely edible field and paints back only the brush area', () => {
    const p = new Pasture(900, 700);
    expect([...p.grass].every(g => g === 1)).toBe(true);
    expect([...p.capacity].every(g => g === 1)).toBe(true);
    expect([...p.soil].every(g => g === 0)).toBe(true);
    p.grass.fill(0); p.trampled.fill(1); p.regrow(450, 350);
    expect(p.at(450, 350)).toBe(1); expect(p.trampled[p.index(450, 350)]).toBe(0);
    expect(p.at(80, 80)).toBe(0);
  });
  it('regrows eaten grass and recovers flattened blades', () => {
    const p = new Pasture(900, 700), i = p.index(400, 300);
    p.grass[i] = 0; p.tread(400, 300, 1); const tread = p.trampled[i];
    for (let k = 0; k < 1200; k++) p.step(0.1);
    expect(p.grass[i]).toBeGreaterThan(0.3); expect(p.grass[i]).toBeLessThanOrEqual(p.capacity[i]);
    expect(p.trampled[i]).toBeLessThan(tread * 0.01);
  });
  it('grazers consume actual grass and move to new patches', () => {
    const w = new World(900, 700, 1), s = w.sheep[0], before = { x: s.x, y: s.y };
    advance(w, 40); expect(s.ate).toBeGreaterThan(0); expect(w.eaten).toBeGreaterThan(0);
    expect(Math.hypot(s.x - before.x, s.y - before.y)).toBeGreaterThan(15);
  });
  it('bare grass makes sheep seek a fresh patch immediately', () => {
    const w = new World(900, 700, 1); w.pasture.grass.fill(0); w.step(1 / 60);
    expect(w.sheep[0].state).toBe('walking');
  });
  it('food attracts sheep and is actually consumed', () => {
    const w = new World(900, 700, 1), s = w.sheep[0]; s.x = 350; s.y = 300;
    w.addFeed(410, 300); w.step(1 / 60); expect(s.state).toBe('following'); expect(s.vx).toBeGreaterThan(0);
    advance(w, 8); expect(s.ate).toBeGreaterThan(0.05); expect(w.feed.length === 0 || w.feed[0].amount < 2.2).toBe(true);
  });
  it('caps feed deposits and clears stale food', () => {
    const w = new World(900, 700, 0); for (let i = 0; i < 20; i++) w.addFeed(450, 300);
    expect(w.feed.length).toBe(10); advance(w, 121); expect(w.feed.length).toBe(0);
  });
});
describe('a controllable sheepdog', () => {
  it('moves to the command with bounded speed and arrives smoothly', () => {
    const w = new World(1200, 800, 0); w.sendDog(250, 250);
    const start = { x: w.dog!.x, y: w.dog!.y }; w.step(1 / 60);
    expect(Math.hypot(w.dog!.x - start.x, w.dog!.y - start.y)).toBeLessThanOrEqual(SPEEDS.dogWalk / 60 + 0.001);
    advance(w, 20); expect(Math.hypot(w.dog!.x - 250, w.dog!.y - 250)).toBeLessThan(2);
  });
  it('nearby sheep move away from the dog', () => {
    const w = new World(900, 700, 1), s = w.sheep[0]; s.x = 500; s.y = 300;
    w.toggleDog(); Object.assign(w.dog!, { x: 450, y: 300, targetX: 450, targetY: 300, arrived: true });
    advance(w, 0.5); expect(s.x).toBeGreaterThan(504); expect(s.state).toBe('startled');
  });
  it('sleeping dogs gently repel sheep in a smaller radius than a chase', () => {
    const w = new World(1200, 900, 1), s = w.sheep[0];
    Object.assign(s, { x: 530, y: 400, timer: 100 }); w.toggleDog();
    Object.assign(w.dog!, { x: 500, y: 400, targetX: 500, targetY: 400, arrived: true, sleeping: true, idleTime: 8 });
    const small = w.dogAvoidanceRadius(); advance(w, 1);
    expect(s.x).toBeGreaterThan(532); expect(s.state).toBe('grazing'); expect(Math.hypot(s.vx, s.vy)).toBeLessThan(10);
    w.sendDog(600, 400); expect(w.dogAvoidanceRadius()).toBeGreaterThan(small * 1.5);
    expect(w.pen.left).toBeGreaterThan(w.width * 0.75); expect(w.pen.top).toBeGreaterThan(w.height * 0.7);
    w.cast('r'); expect(w.dog!.targetX).toBeGreaterThan(w.pen.left); expect(w.dog!.targetX).toBeLessThan(w.pen.right);
  });
  it('bark releases a traveling pulse that adds an outward push', () => {
    const make = () => { const w = new World(900, 700, 1); w.sheep[0].x = 570; w.sheep[0].y = 300; w.toggleDog(); Object.assign(w.dog!, { x: 400, y: 300, targetX: 400, targetY: 300 }); return w; };
    const bark = make(), calm = make(); bark.cast('q'); advance(bark, 0.8); advance(calm, 0.8);
    expect(bark.sheep[0].vx).toBeGreaterThan(calm.sheep[0].vx + 2); expect(bark.sheep[0].x).toBeGreaterThan(calm.sheep[0].x);
  });
  it('allows every action to be cast again immediately, without cooldowns', () => {
    const w = new World(900, 700, 0);
    for (const key of ['q', 'w', 'e', 'r'] as const) { expect(w.cast(key)).toBe(true); expect(w.cast(key)).toBe(true); }
    expect(w.barks.length).toBe(2);
  });
  it('sprint travels farther than ordinary movement without teleporting', () => {
    const a = new World(1600, 1000, 0), b = new World(1600, 1000, 0);
    a.sendDog(1500, 750); b.sendDog(1500, 750); a.cast('e');
    advance(a, 0.5); advance(b, 0.5);
    expect(Math.hypot(a.dog!.x - 1500, a.dog!.y - 750)).toBeLessThan(Math.hypot(b.dog!.x - 1500, b.dog!.y - 750) - 45);
  });
  it('W encloses sheep on every pasture edge and follows a complete outside lap', () => {
    const w = new World(1200, 900, 4), b = w.bounds;
    const poses = [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom }];
    w.sheep.forEach((s, i) => Object.assign(s, poses[i], { timer: 10000 }));
    const outline = w.orbitOutline();
    expect(outline.left).toBeLessThan(b.left - 40); expect(outline.right).toBeGreaterThan(b.right + 40);
    expect(outline.top).toBeLessThan(b.top - 40); expect(outline.bottom).toBeGreaterThan(b.bottom + 40);
    w.cast('w'); const visited = new Set<string>();
    for (let frame = 0; frame < 5000 && w.dog!.orbit; frame++) {
      w.step(1 / 60); const d = w.dog!;
      if (!d.orbitEntering) expect(d.x < b.left || d.x > b.right || d.y < b.top || d.y > b.bottom).toBe(true);
      if (Math.abs(d.x - outline.left) < 10) visited.add('left'); if (Math.abs(d.x - outline.right) < 10) visited.add('right');
      if (Math.abs(d.y - outline.top) < 10) visited.add('top'); if (Math.abs(d.y - outline.bottom) < 10) visited.add('bottom');
      w.sheep.forEach((s, i) => Object.assign(s, poses[i], { vx: 0, vy: 0, timer: 10000 }));
    }
    expect(visited.size).toBe(4); expect(w.dog!.orbit).toBeNull();
    w.cast('w'); w.sendDog(100, 150); expect(w.dog!.orbit).toBeNull();
  });
  it('R recalls to the bottom-right pen, then sprints to the cursor with no click', () => {
    const w = new World(1200, 900, 0); w.sendDog(700, 400); advance(w, 3);
    w.cast('r'); expect(w.dog!.recalling).toBe(true); expect(w.dog!.targetX).toBe(w.home.doorX);
    advance(w, 12); expect(w.dog!.atHome).toBe(true); expect(w.dog!.x).toBeCloseTo(w.home.doorX);
    w.cast('r', { x: 900, y: 500 }); expect(w.dog!.launching).toBe(true); expect(w.dog!.targetX).toBe(900);
    w.step(1 / 60); expect(Math.hypot(w.dog!.vx, w.dog!.vy)).toBeGreaterThan(SPEEDS.dogWalk * 2);
    expect(w.dog!.recallReady).toBe(false);
  });
  it('an idle dog sleeps after seven seconds and wakes on a command or ability', () => {
    const w = new World(900, 700, 0); w.toggleDog(); advance(w, 7.2); expect(w.dog!.sleeping).toBe(true);
    w.cast('q'); expect(w.dog!.sleeping).toBe(false);
    advance(w, 7.2); expect(w.dog!.sleeping).toBe(true);
    w.sendDog(600, 300); expect(w.dog!.sleeping).toBe(false);
  });
  it('Q scares even distant sheep into a sustained six-second escape', () => {
    const w = new World(1800, 1000, 2); w.toggleDog();
    Object.assign(w.sheep[0], { x: 850, y: 450 }); Object.assign(w.sheep[1], { x: 1300, y: 600 });
    const positions = w.sheep.map(s => ({ x: s.x, y: s.y })); w.cast('q'); advance(w, 4);
    expect(w.sheep.every(s => s.state === 'startled')).toBe(true);
    w.sheep.forEach((s, i) => expect(Math.hypot(s.x - positions[i].x, s.y - positions[i].y)).toBeGreaterThan(150));
    advance(w, 2.2); expect(w.panicLeft).toBe(0);
  });
  it('normal walking and food-following remain much slower than a bark escape', () => {
    const w = new World(1200, 900, 1), s = w.sheep[0];
    Object.assign(s, { x: 400, y: 400, state: 'walking', goalX: 900, goalY: 400, timer: 100 }); advance(w, 2);
    const walking = Math.hypot(s.vx, s.vy); expect(walking).toBeLessThanOrEqual(15); expect(walking).toBeGreaterThan(5);
    w.addFeed(650, 400); advance(w, 2); const food = Math.hypot(s.vx, s.vy);
    expect(food).toBeGreaterThan(walking); expect(food).toBeLessThanOrEqual(20);
  });
  it('soft collision correction separates coincident sheep while allowing some wool overlap', () => {
    const w = new World(1200, 900, 2); w.sheep.forEach(s => Object.assign(s, { x: 500, y: 350, timer: 100, size: 1 }));
    advance(w, 2); const [a, b] = w.sheep;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(42);
  });
});
describe('stable state and controls', () => {
  it('adds and removes sheep, including an empty meadow and the population limit', () => {
    const w = new World(1200, 900, 0); expect(w.removeSheep()).toBe(false);
    for (let i = 0; i < 90; i++) w.addSheep(); expect(w.sheep.length).toBe(80); expect(w.addSheep()).toBe(false);
    for (let i = 0; i < 80; i++) w.removeSheep(); expect(w.sheep.length).toBe(0); w.cast('r'); advance(w, 1);
    expect(Number.isFinite(w.dog!.x)).toBe(true);
  });
  it('does not advance paused sheep, grass or active actions', () => {
    const w = new World(900, 700, 18); w.cast('q'); const s = { ...w.sheep[0] }, panic = w.panicLeft;
    w.paused = true; advance(w, 5); expect(w.sheep[0]).toEqual(s); expect(w.time).toBe(0); expect(w.panicLeft).toBe(panic); expect(w.cast('e')).toBe(false);
  });
  it('resizes creatures and keeps the whole grid filled', () => {
    const w = new World(1200, 900, 18); w.cast('w'); w.addFeed(500, 300); w.resize(412, 839);
    expect(w.sheep.length).toBe(18); expect(w.pasture.cols * w.pasture.cellW).toBeGreaterThanOrEqual(412); expect(w.pasture.rows * w.pasture.cellH).toBeGreaterThanOrEqual(839);
    expect(w.sheep.every(s => s.x > 0 && s.x < 412 && s.y > 0 && s.y < 839)).toBe(true);
    expect(w.orbitOutline().right).toBeLessThan(412);
    advance(w, 1); expect(w.dog!.targetX).toBeLessThanOrEqual(w.dogBounds.right);
  });
  it('stays finite and bounded during a minute of grazing, feeding and herding', () => {
    const w = new World(1100, 800, 36); w.toggleDog();
    for (let frame = 0; frame < 3600; frame++) {
      if (frame % 360 === 0) { w.sendDog(250 + frame % 600, 250 + frame % 200); w.cast('q'); w.addFeed(500, 350); }
      if (frame % 600 === 0) w.cast('w');
      w.step(1 / 60);
    }
    for (const s of w.sheep) { expect(Number.isFinite(s.x + s.y + s.vx + s.vy)).toBe(true); expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(SPEEDS.sheepPanic + 0.001); expect(s.x).toBeGreaterThanOrEqual(w.bounds.left); expect(s.x).toBeLessThanOrEqual(w.dogBounds.right); }
    expect([...w.pasture.grass].every(g => Number.isFinite(g) && g >= 0 && g <= 1)).toBe(true);
  });
});
