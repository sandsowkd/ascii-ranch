import { describe, expect, it } from 'vitest';
import { FieldFences, closestOnFence } from '../src/simulation/fence';
import { World } from '../src/simulation/World';
import { MouseLife, mouseExposed, type Mouse } from '../src/simulation/Mice';
import { BirdLife, type Bird } from '../src/simulation/Birds';
import { Pasture } from '../src/simulation/Pasture';
import { hash3 } from '../src/vendor/pond-math';
import { hawkPose, hawkWingAt } from '../src/engine/raptor';

const advance = (w: World, seconds: number) => { for (let i = 0; i < seconds * 60; i++) w.step(1 / 60); };
const mouse = (id = 0): Mouse => ({ id, x: 600, y: 450, vx: 0, vy: 0, heading: 0, goalX: 600, goalY: 450, timer: 100, age: 0, life: 100, phase: 0, state: 'resting' });
const hawk = (roll: number): Bird => ({ id: 2, kind: 'hawk', x: 588, y: 450, heading: 0, phase: 0, state: 'striking', age: 0, altitude: 0,
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
  it('moves sheep and lambs onto clear sides of a new rail, but protects the recall passage', () => {
    const w = new World(1400, 1000, 2, 1);
    Object.assign(w.sheep[0], { x: 494, y: 420 }); Object.assign(w.sheep[1], { x: 506, y: 510 }); Object.assign(w.lambs[0], { x: 500, y: 590 });
    expect(w.addFence({ x: 500, y: 300 }, { x: 500, y: 650 })).toBe(true);
    expect(w.sheep[0].x).toBeLessThan(500); expect(w.sheep[1].x).toBeGreaterThan(500);
    for (const s of w.animals) expect(w.fieldFences.clear(s, 49 * s.size)).toBe(true);
    for (let i = 0; i < 120; i++) { w.step(1 / 60); for (const s of w.animals) expect(w.fieldFences.clear(s, 49 * s.size - 0.2)).toBe(true); }
    expect(w.addFence({ x: 700, y: 300 }, { x: 700, y: 310 })).toBe(false);
    expect(w.addFence({ x: w.pen.left - 100, y: w.home.y - 90 }, { x: w.pen.left - 100, y: w.home.y + 50 })).toBe(false);
    expect(w.addFence({ x: 700, y: 260 }, { x: 700, y: 600 })).toBe(true); expect(w.fieldFences.rails).toHaveLength(2);
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
  it('leaves sheep beside an existing rail in place when another fence is built elsewhere', () => {
    const w = new World(1400, 1000, 1, 0), s = w.sheep[0]; Object.assign(s, { x: 300, y: 450 });
    expect(w.addFence({ x: 500, y: 300 }, { x: 500, y: 650 })).toBe(true);
    Object.assign(s, { x: 500 - (49 * s.size + 6.5), y: 450 }); const before = { x: s.x, y: s.y };
    expect(w.addFence({ x: 900, y: 300 }, { x: 900, y: 650 })).toBe(true); expect({ x: s.x, y: s.y }).toEqual(before);
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
  it('keeps mice sparse, with at most two and long gaps between appearances', () => {
    const life = new MouseLife(), p = new Pasture(1200, 900), seen = new Set<number>(), births: number[] = []; let total = 0;
    for (let i = 0; i < 300 * 30; i++) {
      life.step(1 / 30, 1200, 900, p, null); expect(life.mice.length).toBeLessThanOrEqual(2); total += life.mice.length;
      for (const m of life.mice) if (!seen.has(m.id)) { seen.add(m.id); births.push(i / 30); }
    }
    expect(births.length).toBeGreaterThan(6); expect(total / (300 * 30)).toBeLessThan(1.5);
    for (let i = 1; i < births.length; i++) expect(births[i] - births[i - 1]).toBeGreaterThanOrEqual(25.9);
  });
  it('mice enter from an edge and run completely offscreen instead of disappearing when their visit expires', () => {
    const life = new MouseLife(), p = new Pasture(1200, 900);
    for (let i = 0; i < 181; i++) life.step(1 / 60, 1200, 900, p, null);
    const entered = life.mice[0]; expect(entered.x < 0 || entered.x > 1200).toBe(true);
    expect(entered.state).toBe('entering');
    for (let i = 0; i < 180; i++) life.step(1 / 60, 1200, 900, p, null);
    expect(entered.x).toBeGreaterThan(0); expect(entered.x).toBeLessThan(1200);
    Object.assign(entered, { x: 600, y: 450, age: entered.life, state: 'resting' });
    life.step(1 / 60, 1200, 900, p, null); expect(life.mice).toContain(entered); expect(entered.state).toBe('leaving');
    let prior = { x: entered.x, y: entered.y }, removed = false;
    for (let i = 0; i < 12 * 60; i++) {
      life.step(1 / 60, 1200, 900, p, null);
      expect(Math.hypot(entered.x - prior.x, entered.y - prior.y)).toBeLessThanOrEqual(1.41); prior = { x: entered.x, y: entered.y };
      if (!life.mice.includes(entered)) { removed = true; break; }
      expect(entered.state).toBe('leaving');
    }
    expect(removed).toBe(true); expect(entered.x < -25 || entered.x > 1225 || entered.y < -25 || entered.y > 925).toBe(true);
  });
  it('takes a smooth variable hunting arc before a curved dive and a brief feet-first catch', () => {
    const life = new BirdLife(), mice = new MouseLife(), p = new Pasture(1200, 900), b = hawk(0.1);
    Object.assign(b, { x: 200, y: 400, state: 'soaring', altitude: 1.8 }); life.birds.push(b); mice.mice.push(mouse());
    const states = new Set<string>(); let movement = 0, circleSweep = 0;
    for (let i = 0; i < 30 * 60 && !b.caughtMouse; i++) {
      const before = { x: b.x, y: b.y, heading: b.heading }; states.add(b.state);
      life.step(1 / 60, 1200, 900, p, [], null, [], [], undefined, mice);
      const d = Math.hypot(b.x - before.x, b.y - before.y); movement += d; expect(d).toBeLessThan(6);
      expect(Math.abs(Math.atan2(Math.sin(b.heading - before.heading), Math.cos(b.heading - before.heading)))).toBeLessThan(0.06);
      circleSweep = Math.max(circleSweep, b.hunt?.sweep ?? 0);
      if (b.state === 'striking' && b.age < 0.2) expect(mice.mice).toHaveLength(1);
    }
    expect([...states]).toEqual(['soaring', 'circling', 'swooping', 'striking']); expect(circleSweep).toBeGreaterThanOrEqual(Math.PI);
    expect(circleSweep).toBeLessThan(Math.PI * 4 + 0.05); expect(circleSweep).toBeGreaterThanOrEqual(b.hunt!.plannedSweep!);
    expect(b.state).toBe('departing'); expect(b.caughtMouse).toBe(true); expect(mice.mice).toHaveLength(0); expect(movement).toBeGreaterThan(500);
    const low = b.altitude; life.step(0.1, 1200, 900, p, [], null, [], [], undefined, mice); expect(b.altitude).toBeGreaterThan(low);
  });
  it('varies hunt radius and arc length, and never starts a search loop without exposed prey', () => {
    const p = new Pasture(1200, 900), mice = new MouseLife(); mice.mice.push(mouse());
    const radii: number[] = [], sweeps: number[] = [];
    for (let id = 2; id < 32; id += 3) {
      const b = { ...hawk(0), id, x: -35, y: 300, state: 'soaring' as const, heading: 0, altitude: 1.8 };
      const life = new BirdLife(); life.birds.push(b); life.step(1 / 60, 1200, 900, p, [], null, [], [], undefined, mice);
      radii.push(b.hunt!.radius); sweeps.push(b.hunt!.plannedSweep!);
    }
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(35);
    expect(Math.min(...sweeps)).toBeLessThan(Math.PI * 1.6); expect(Math.max(...sweeps)).toBeGreaterThan(Math.PI * 3);
    for (const hidden of [false, true]) {
      const life = new BirdLife(), b: Bird = { ...hawk(0), x: -35, y: 300, state: 'soaring', heading: 0, targetMouseId: hidden ? 0 : undefined };
      life.birds.push(b); const animals = hidden ? [{ x: 600, y: 450, size: 0.55 }] : [];
      for (let i = 0; i < 120; i++) { life.step(1 / 60, 1200, 900, p, animals, null, [], [], undefined, mice); expect(b.hunt).toBeUndefined(); expect(b.state).not.toBe('circling'); }
    }
  });
  it('has deep slow wingbeats, broad inner wings and separate feather tips', () => {
    const b = hawk(0); b.state = 'soaring';
    const up = hawkPose(0.3, b), down = hawkPose(0.83, b);
    expect(up.spread - down.spread).toBeGreaterThan(0.3);
    expect(hawkWingAt(0, 18, up)).toBeTruthy(); expect(hawkWingAt(-12, 19, up)).toBeTruthy();
    expect(hawkWingAt(-2, 42 * up.spread, up)?.feather).toBe(true);
    b.state = 'striking'; expect(hawkPose(0.83, b).spread).toBe(1);
  });
  it('resolves one 50/50 catch attempt, and a missed mouse remains alive and darts away', () => {
    const p = new Pasture(1200, 900);
    for (const roll of [0.1, 0.4999, 0.5, 0.9]) {
      const life = new BirdLife(), mice = new MouseLife(), b = hawk(roll); mice.mice.push(mouse()); life.birds.push(b);
      for (let i = 0; i < 3; i++) life.step(0.1, 1200, 900, p, [], null, [], [], undefined, mice);
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
