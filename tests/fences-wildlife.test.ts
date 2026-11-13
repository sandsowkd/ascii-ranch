import { describe, expect, it } from 'vitest';
import { FieldFences, closestOnFence } from '../src/simulation/fence';
import { World } from '../src/simulation/World';
import { MouseLife, mouseExposed, type Mouse } from '../src/simulation/Mice';
import { BirdLife, type Bird } from '../src/simulation/Birds';
import { Pasture } from '../src/simulation/Pasture';
import { hash3 } from '../src/vendor/pond-math';

const advance = (w: World, seconds: number) => { for (let i = 0; i < seconds * 60; i++) w.step(1 / 60); };
const mouse = (id = 0): Mouse => ({ id, x: 600, y: 450, vx: 0, vy: 0, heading: 0, goalX: 600, goalY: 450, timer: 100, age: 0, life: 100, phase: 0, state: 'resting' });
const hawk = (roll: number): Bird => ({ id: 2, kind: 'hawk', x: 580, y: 450, heading: 0, phase: 0, state: 'swooping', age: 0, altitude: 0.1,
  landingX: 600, landingY: 450, exitX: 1300, exitY: 200, restFor: 0, color: 2, targetMouseId: 0, catchRoll: roll });

describe('drawn fences', () => {
  it('places regularly spaced posts, shares joined endpoints, and supports undo and resizing', () => {
    const fences = new FieldFences(); fences.add({ x: 200, y: 200 }, { x: 200, y: 530 });
    expect(fences.posts).toHaveLength(4); expect(fences.posts[1].y).toBe(310);
    fences.add({ x: 200, y: 530 }, { x: 420, y: 530 }); expect(fences.posts).toHaveLength(6);
    const obstacles = fences.obstacles(30); expect(obstacles.length).toBeGreaterThan(30);
    fences.resize(0.5, 0.5, 0.79); expect(fences.rails[0].b).toEqual({ x: 100, y: 265 });
    expect(fences.obstacles(30)).not.toBe(obstacles); expect(fences.undo()).toBe(true); expect(fences.rails).toHaveLength(1);
    fences.reset(); expect(fences.posts).toHaveLength(0); expect(fences.undo()).toBe(false);
  });
  it('rejects tiny or occupied rails and preserves the recall gate passage', () => {
    const w = new World(1400, 1000, 1, 0), s = w.sheep[0]; Object.assign(s, { x: 500, y: 450 });
    expect(w.addFence({ x: 450, y: 450 }, { x: 550, y: 450 })).toBe(false);
    expect(w.addFence({ x: 500, y: 450 }, { x: 600, y: 450 })).toBe(false);
    expect(w.addFence({ x: 700, y: 300 }, { x: 700, y: 310 })).toBe(false);
    expect(w.addFence({ x: w.pen.left - 100, y: w.home.y - 90 }, { x: w.pen.left - 100, y: w.home.y + 50 })).toBe(false);
    expect(w.addFence({ x: 700, y: 260 }, { x: 700, y: 600 })).toBe(true); expect(w.fieldFences.rails).toHaveLength(1);
  });
  it('routes sheep toward food around a rail and never moves a body or muzzle through it', () => {
    const w = new World(1400, 1000, 1, 0), s = w.sheep[0]; Object.assign(s, { x: 500, y: 450, heading: 0, timer: 100 });
    expect(w.addFence({ x: 650, y: 360 }, { x: 650, y: 500 })).toBe(true); w.addFeed(800, 450);
    const rail = w.fieldFences.rails[0]; let largestY = s.y;
    for (let i = 0; i < 55 * 60; i++) {
      w.step(1 / 60); largestY = Math.max(largestY, s.y);
      const q = closestOnFence(s, rail); expect(Math.hypot(q.x - s.x, q.y - s.y)).toBeGreaterThanOrEqual(49 * s.size + 5.8);
    }
    expect(s.x).toBeGreaterThan(700); expect(largestY).toBeGreaterThan(540); expect(s.ate).toBeGreaterThan(0);
  });
  it('routes the dog around a rail during movement and sprint, and reset clears construction', () => {
    const w = new World(1400, 1000, 0, 0); w.toggleDog();
    Object.assign(w.dog!, { x: 400, y: 450, targetX: 400, targetY: 450, atHome: false, arrived: true });
    expect(w.addFence({ x: 650, y: 300 }, { x: 650, y: 590 })).toBe(true); w.sendDog(850, 450); w.cast('e');
    let deviation = 0;
    for (let i = 0; i < 20 * 60; i++) {
      w.step(1 / 60); const d = w.dog!, q = closestOnFence(d, w.fieldFences.rails[0]);
      expect(Math.hypot(d.x - q.x, d.y - q.y)).toBeGreaterThanOrEqual(54.8); deviation = Math.max(deviation, Math.abs(d.y - 450));
    }
    expect(deviation).toBeGreaterThan(190); expect(Math.hypot(w.dog!.x - 850, w.dog!.y - 450)).toBeLessThan(2);
    w.reset(); expect(w.fieldFences.rails).toHaveLength(0); expect(w.mice).toHaveLength(0);
  });
  it('repels a grazer from the wider sleeping-dog buffer without causing a bark escape', () => {
    const w = new World(1400, 1000, 1, 0), s = w.sheep[0]; Object.assign(s, { x: 570, y: 450, heading: Math.PI, timer: 100 });
    w.toggleDog(); Object.assign(w.dog!, { x: 500, y: 450, targetX: 500, targetY: 450, atHome: false, arrived: true, sleeping: true, idleTime: 8 });
    advance(w, 3); expect(s.x).toBeGreaterThan(575); expect(s.barkLeft).toBe(0); expect(s.state).toBe('grazing');
  });
  it('keeps W herding routes and both sides of a divided flock clear of the fence', () => {
    const w = new World(1600, 1000, 3, 0);
    for (const [i, p] of [{ x: 550, y: 450 }, { x: 950, y: 450 }, { x: 650, y: 600 }].entries()) Object.assign(w.sheep[i], p, { timer: 100, heading: 0 });
    w.toggleDog(); Object.assign(w.dog!, { x: 400, y: 500, targetX: 400, targetY: 500, atHome: false });
    expect(w.addFence({ x: 800, y: 240 }, { x: 800, y: 680 })).toBe(true); w.cast('w'); let travel = 0;
    for (let i = 0; i < 20 * 60; i++) {
      const before = { x: w.dog!.x, y: w.dog!.y }; w.step(1 / 60); const d = w.dog!;
      travel += Math.hypot(d.x - before.x, d.y - before.y);
      const q = closestOnFence(d, w.fieldFences.rails[0]); expect(Math.hypot(d.x - q.x, d.y - q.y)).toBeGreaterThanOrEqual(54.8);
      for (const s of w.sheep) { const q = closestOnFence(s, w.fieldFences.rails[0]); expect(Math.hypot(s.x - q.x, s.y - q.y)).toBeGreaterThanOrEqual(49 * s.size + 5.8); }
    }
    expect(travel).toBeGreaterThan(250);
  });
});

describe('mice and hawks', () => {
  it('mice make intermittent short darts, pause, respect pause, and survive resizing', () => {
    const w = new World(1400, 1000, 0, 0); advance(w, 3.1); expect(w.mice).toHaveLength(1);
    const m = w.mice[0], x = m.x, y = m.y; advance(w, 0.5); expect(Math.hypot(m.x - x, m.y - y)).toBeGreaterThan(20);
    advance(w, 2.5); expect(m.state).toBe('resting'); const paused = { x: m.x, y: m.y };
    w.paused = true; advance(w, 10); expect(m.x).toBe(paused.x); expect(m.y).toBe(paused.y);
    w.resize(700, 500); expect(m.x).toBeCloseTo(paused.x / 2); expect(m.y).toBeCloseTo(paused.y / 2);
  });
  it('one visitor in every three is a large bird that flies over with no prey', () => {
    const life = new BirdLife(), p = new Pasture(1400, 1000), seen = new Map<number, Bird>();
    for (let i = 0; i < 300 * 30; i++) { life.step(1 / 30, 1400, 1000, p, [], null, []); for (const b of life.birds) seen.set(b.id, b); }
    expect(seen.size).toBeGreaterThan(8);
    for (const b of seen.values()) { expect(b.kind === 'hawk').toBe(b.id % 3 === 2); if (b.kind === 'hawk') { expect(b.caughtMouse).not.toBe(true); expect(b.targetMouseId).toBeUndefined(); } }
    expect([...seen.values()].some(b => b.kind === 'songbird')).toBe(true);
  });
  it('resolves one 50/50 catch attempt, and a missed mouse remains alive and darts away', () => {
    const p = new Pasture(1200, 900);
    for (const roll of [0.1, 0.4999, 0.5, 0.9]) {
      const life = new BirdLife(), mice = new MouseLife(), b = hawk(roll); mice.mice.push(mouse()); life.birds.push(b);
      life.step(0.1, 1200, 900, p, [], null, [], [], undefined, mice);
      expect(b.state).toBe('departing'); expect(!!b.caughtMouse).toBe(roll < 0.5); expect(mice.mice.length).toBe(roll < 0.5 ? 0 : 1);
      if (roll >= 0.5) expect(mice.mice[0].state).toBe('darting');
      life.step(0.1, 1200, 900, p, [], null, [], [], undefined, mice); expect(mice.mice.length).toBe(roll < 0.5 ? 0 : 1);
    }
    const rolls = Array.from({ length: 300 }, (_, i) => hash3(i * 3 + 2, 8, 781));
    expect(rolls.filter(n => n < 0.5).length).toBeGreaterThan(120); expect(rolls.filter(n => n < 0.5).length).toBeLessThan(180);
  });
  it('protects a mouse beneath a lamb, including when it hides during the dive', () => {
    const p = new Pasture(1200, 900), life = new BirdLife(), mice = new MouseLife(), m = mouse(), b = hawk(0);
    const lamb = { x: 600, y: 450, size: 0.55, heading: 0 }; mice.mice.push(m); life.birds.push(b);
    expect(mouseExposed(m, [lamb], 1)).toBe(false); expect(mouseExposed({ ...m, x: 635 }, [lamb], 1)).toBe(true);
    life.step(0.1, 1200, 900, p, [lamb], null, [], [], undefined, mice);
    expect(mice.mice).toHaveLength(1); expect(b.state).toBe('departing'); expect(b.caughtMouse).not.toBe(true);
    expect(life.groundSpots).toHaveLength(0);
  });
});
