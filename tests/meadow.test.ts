import { describe, expect, it } from 'vitest';
import { World, SPEEDS, angleDelta } from '../src/simulation/World';
import { grassAppearance } from '../src/engine/grass';
import { nearestOnRoute, perimeter } from '../src/simulation/route';
import { Pasture } from '../src/simulation/Pasture';
import { BirdLife } from '../src/simulation/Birds';
import { createBark } from '../src/simulation/bark';

function advance(world: World, seconds: number) { for (let i = 0; i < seconds * 60; i++) world.step(1 / 60); }
// In the doorway the dog passes lengthwise; in the field its conservative
// navigation footprint must clear every side, including the closed gate.
function expectPenClear(w: World) {
  const d = w.dog!, p = w.pen;
  if (d.atHome || d.penTransit === 'enter' || d.penTransit === 'exit') {
    expect(d.y).toBeCloseTo(w.home.y);
    expect(Math.abs(Math.sin(d.heading))).toBeLessThan(0.001);
    expect(d.y - 21 * w.scale).toBeGreaterThan(p.top + 5 * w.scale);
    expect(d.y + 21 * w.scale).toBeLessThan(p.bottom - 5 * w.scale);
    expect(d.x + 48 * w.scale).toBeLessThan(p.right - 5 * w.scale);
    if (Math.abs(d.x - p.left) < 49 * w.scale) expect(w.gateOpen).toBe(1);
  } else for (const o of w.fence.obstacles)
    expect(Math.hypot(d.x - o.x, d.y - o.y)).toBeGreaterThanOrEqual(o.radius - 0.1);
}
describe('lambs and visiting birds', () => {
  it('keeps sheep and lamb populations independent through adding, removing, and reset', () => {
    const w = new World(1200, 900, 5, 3);
    w.addSheep(); expect(w.sheep).toHaveLength(6); expect(w.lambs).toHaveLength(3);
    w.addLamb(); w.addLamb(); expect(w.lambs).toHaveLength(5); expect(w.sheep).toHaveLength(6);
    for (const lamb of w.lambs) {
      expect(lamb.size).toBeLessThan(0.6); expect(lamb.isLamb).toBe(true);
      const parent = w.sheep.find(s => s.id === lamb.parentId)!;
      expect(parent).toBeDefined();
    }
    w.removeSheep(); expect(w.lambs).toHaveLength(5); expect(w.lambs.every(l => w.sheep.some(s => s.id === l.parentId))).toBe(true);
    w.removeLamb(); expect(w.lambs).toHaveLength(4); expect(w.sheep).toHaveLength(5);
    const ids = new Set(w.animals.map(a => a.id)); expect(ids.size).toBe(w.animals.length);
    w.reset(); expect(w.sheep).toHaveLength(5); expect(w.lambs).toHaveLength(4);
    w.reset(80, 0); expect(w.lambs).toHaveLength(0); expect(w.addSheep()).toBe(false);
    w.reset(0, 0); expect(w.animals).toHaveLength(0); expect(w.removeSheep()).toBe(false); expect(w.removeLamb()).toBe(false);
  });
  it('supports lamb-only flocks, herds them, and reconnects families when adults return', () => {
    const w = new World(1200, 900, 0, 9);
    expect(w.lambs).toHaveLength(9); expect(w.lambs.every(l => l.parentId === undefined)).toBe(true);
    advance(w, 20); expect(w.eaten).toBeGreaterThan(0);
    expect(w.lambs.every(l => Number.isFinite(l.x + l.y + l.heading))).toBe(true);
    const b = w.orbitOutline(); expect(w.lambs.every(l => l.x > b.left && l.x < b.right && l.y > b.top && l.y < b.bottom)).toBe(true);
    w.cast('w'); expect(w.dog!.orbitPath.length).toBeGreaterThan(20); advance(w, 3);
    w.addSheep(); expect(w.lambs.every(l => l.parentId === w.sheep[0].id)).toBe(true);
    w.removeSheep(); expect(w.lambs).toHaveLength(9); expect(w.lambs.every(l => l.parentId === undefined)).toBe(true);
    w.addLamb(); expect(w.lambs).toHaveLength(10);
    w.reset(); expect(w.sheep).toHaveLength(0); expect(w.lambs).toHaveLength(10);
    expect(new Set(w.animals.map(a => a.id)).size).toBe(10);
  });
  it('a separated lamb returns toward its adult and responds to the sheepdog', () => {
    const w = new World(1600, 1000, 6), lamb = w.lambs[0], parent = w.sheep.find(s => s.id === lamb.parentId)!;
    Object.assign(parent, { x: 900, y: 450, timer: 100 }); Object.assign(lamb, { x: 600, y: 450, timer: 100 });
    advance(w, 10); expect(Math.hypot(lamb.x - parent.x, lamb.y - parent.y)).toBeLessThan(230);
    w.toggleDog(); Object.assign(w.dog!, { x: lamb.x - 35, y: lamb.y, targetX: lamb.x - 35, targetY: lamb.y, arrived: true });
    w.step(1 / 60); expect(lamb.state).toBe('startled'); w.cast('q'); expect(lamb.barkLeft).toBe(0); w.step(1 / 60); expect(lamb.barkLeft).toBeGreaterThan(2);
  });
  it('pauses and resizes both generations without losing their family links', () => {
    const w = new World(1200, 900, 18), lamb = w.lambs[0], before = { x: lamb.x, y: lamb.y, parent: lamb.parentId };
    w.paused = true; advance(w, 8); expect(lamb.x).toBe(before.x); expect(w.birds).toHaveLength(0);
    w.resize(1600, 1000); expect(lamb.x).toBeCloseTo(before.x * 4 / 3); expect(lamb.parentId).toBe(before.parent);
    w.reset(); expect(w.lambs).toHaveLength(3); expect(w.birds).toHaveLength(0);
  });
  it('birds fly in, land to rest, then leave the field', () => {
    const visitors = new BirdLife(), p = new Pasture(1200, 900);
    const step = () => visitors.step(1 / 30, 1200, 900, p, [], null, []);
    for (let i = 0; i < 153; i++) step();
    const bird = visitors.birds[0]; expect(bird.state).toBe('arriving'); expect(bird.altitude).toBeGreaterThan(0);
    for (let i = 0; i < 900 && bird.state === 'arriving'; i++) step();
    expect(bird.state).toBe('landed'); expect(bird.altitude).toBe(0); expect(bird.x).toBeCloseTo(bird.landingX);
    for (let i = 0; i < 500 && bird.state === 'landed'; i++) step();
    expect(bird.state).toBe('departing');
    for (let i = 0; i < 900 && visitors.birds.includes(bird); i++) step();
    expect(visitors.birds).not.toContain(bird); expect(visitors.birds.length).toBeLessThanOrEqual(3);
  });
  it('a nearby dog or bark makes a resting bird take off', () => {
    const visitors = new BirdLife(), p = new Pasture(1200, 900);
    for (let i = 0; i < 900; i++) visitors.step(1 / 30, 1200, 900, p, [], null, []);
    const bird = visitors.birds[0]; Object.assign(bird, { state: 'landed', age: 0 });
    visitors.step(1 / 30, 1200, 900, p, [], { x: bird.x + 80, y: bird.y }, []);
    expect(bird.state).toBe('departing'); Object.assign(bird, { state: 'landed', age: 0 });
    Object.assign(bird, { x: 320, y: 400 }); const wave = createBark(120, 400, 1200, 900, 1); wave.age = 0.09;
    visitors.step(1 / 30, 1200, 900, p, [], null, [wave]);
    expect(bird.state).toBe('departing'); visitors.reset(); expect(visitors.birds).toHaveLength(0);
  });
  it('waits for open grass instead of landing in a packed flock', () => {
    const visitors = new BirdLife(), p = new Pasture(900, 700), packed: { x: number; y: number }[] = [];
    for (let y = 100; y < 700; y += 60) for (let x = 0; x <= 900; x += 60) packed.push({ x, y });
    for (let i = 0; i < 240; i++) visitors.step(1 / 30, 900, 700, p, packed, null, []);
    expect(visitors.birds).toHaveLength(0);
    for (let i = 0; i < 90; i++) visitors.step(1 / 30, 900, 700, p, [], null, []);
    expect(visitors.birds).toHaveLength(1); expect(visitors.birds[0].state).toBe('arriving');
  });
  it('chooses a new landing site if a sheep occupies the original one during approach', () => {
    const visitors = new BirdLife(), p = new Pasture(1200, 900);
    for (let i = 0; i < 153; i++) visitors.step(1 / 30, 1200, 900, p, [], null, []);
    const bird = visitors.birds[0], blocked = { x: bird.landingX, y: bird.landingY, size: 1 };
    Object.assign(bird, { x: blocked.x, y: blocked.y });
    visitors.step(1 / 30, 1200, 900, p, [blocked], null, []);
    expect(bird.state).toBe('arriving'); expect(Math.hypot(bird.landingX - blocked.x, bird.landingY - blocked.y)).toBeGreaterThanOrEqual(72);
    for (let i = 0; i < 600 && bird.state === 'arriving'; i++) visitors.step(1 / 30, 1200, 900, p, [blocked], null, []);
    expect(bird.state).toBe('landed'); expect(Math.hypot(bird.x - blocked.x, bird.y - blocked.y)).toBeGreaterThanOrEqual(72);
  });
  it('a grazing sheep walks around a resting bird instead of displacing it', () => {
    const w = new World(1200, 900, 1), s = w.sheep[0];
    Object.assign(s, { x: 500, y: 420, heading: 0, state: 'walking', goalX: 850, goalY: 420, timer: 100 });
    w.birdLife.birds.push({ id: 99, x: 650, y: 420, heading: 0, phase: 0, state: 'landed', age: 0, altitude: 0,
      landingX: 650, landingY: 420, exitX: 1300, exitY: 300, restFor: 1000, color: 0 });
    const bird = w.birds[0]; let closest = Infinity, deviation = 0;
    for (let i = 0; i < 2400; i++) { w.step(1 / 60); closest = Math.min(closest, Math.hypot(s.x - bird.x, s.y - bird.y)); deviation = Math.max(deviation, Math.abs(s.y - 420)); }
    expect(bird.state).toBe('landed'); expect(closest).toBeGreaterThan(55); expect(deviation).toBeGreaterThan(25); expect(s.x).toBeGreaterThan(690);
  });
  it('a sheep body or muzzle that enters a resting bird makes it take off', () => {
    for (const headFirst of [false, true]) {
      const visitors = new BirdLife(), p = new Pasture(1200, 900);
      for (let i = 0; i < 600; i++) visitors.step(1 / 30, 1200, 900, p, [], null, []);
      const bird = visitors.birds[0]; Object.assign(bird, { state: 'landed', age: 0, x: 600, y: 400 });
      const sheep = { x: bird.x - (headFirst ? 58 : 35), y: bird.y, size: 1, heading: headFirst ? 0 : Math.PI };
      visitors.step(1 / 30, 1200, 900, p, [sheep], null, []);
      expect(bird.state).toBe('departing'); expect(visitors.groundSpots.some(p => p.id === bird.id)).toBe(false);
    }
  });

});
describe('forward grazing and a physical recall pen', () => {
  it('keeps ordinary next-patch choices within 45 degrees, even when greener grass is behind', () => {
    const w = new World(1600, 1200, 1), s = w.sheep[0];
    for (let i = 0; i < 24; i++) {
      const heading = i * Math.PI / 12;
      w.pasture.grass.fill(0);
      w.pasture.regrow(800 - Math.cos(heading) * 100, 450 - Math.sin(heading) * 100, 90);
      Object.assign(s, { x: 800, y: 450, heading, state: 'grazing', timer: -1, searchIn: 0, vx: 0, vy: 0 });
      w.step(1 / 60);
      expect(s.state).toBe('walking');
      expect(Math.abs(angleDelta(heading, Math.atan2(s.goalY - 450, s.goalX - 800)))).toBeLessThanOrEqual(Math.PI / 4 + 1e-8);
    }
  });
  it('chooses a forward side lane when a sheep is directly ahead', () => {
    const w = new World(1600, 1100, 2), [s, other] = w.sheep;
    Object.assign(s, { x: 500, y: 450, heading: 0, state: 'grazing', timer: -1 });
    Object.assign(other, { x: 610, y: 450, heading: 0, timer: 100 }); w.step(1 / 60);
    const turn = Math.atan2(s.goalY - 450, s.goalX - 500);
    expect(s.state).toBe('walking'); expect(Math.abs(turn)).toBeGreaterThan(0.3); expect(Math.abs(turn)).toBeLessThanOrEqual(Math.PI / 4 + 1e-8);
  });
  it.each([[1200, 900], [412, 839]])('uses a compact pen and opens the gate for exit and recall at %i × %i', (width, height) => {
    const w = new World(width, height, 0); w.toggleDog();
    expect(w.dog!.x).toBe(w.home.x); expect(w.dog!.y).toBe(w.home.y); expect(w.dog!.atHome).toBe(true); expect(w.gateOpen).toBe(0);
    expect(w.fence.posts).toHaveLength(6);
    expect(w.pen.right - w.pen.left).toBeCloseTo(120 * w.scale);
    expect(w.pen.bottom - w.pen.top).toBeCloseTo(72 * w.scale);
    for (const x of [w.pen.left, w.pen.right]) expect(w.fence.posts.filter(p => p.x === x)).toHaveLength(2);
    const target = { x: width * 0.25, y: height * 0.35 };
    w.sendDog(target.x, target.y);
    for (let i = 0; i < 900; i++) { w.step(1 / 60); expectPenClear(w); }
    expect(w.dog!.arrived).toBe(true); expect(Math.hypot(w.dog!.x - target.x, w.dog!.y - target.y)).toBeLessThan(2); expect(w.gateOpen).toBe(0);
    w.cast('r'); for (let i = 0; i < 1200; i++) { w.step(1 / 60); expectPenClear(w); }
    expect(w.dog!.atHome).toBe(true); expect(w.dog!.x).toBeCloseTo(w.home.x); expect(w.gateOpen).toBe(0);
  });
  it('can reverse a release into recall, release again, and keep a resting dog inside on resize', () => {
    const w = new World(1200, 900, 0); w.toggleDog(); w.cast('r', { x: 500, y: 350 }); advance(w, 0.35);
    expect(w.dog!.penTransit).toBe('exit'); expect(w.gateOpen).toBe(1);
    w.cast('r'); advance(w, 4); expect(w.dog!.atHome).toBe(true); expect(w.gateOpen).toBe(0);
    w.resize(412, 839); expect(w.dog!.x).toBe(w.home.x); expect(w.dog!.y).toBe(w.home.y); expect(w.dog!.atHome).toBe(true);
    w.cast('r', { x: 160, y: 320 }); advance(w, 8); expect(w.dog!.arrived).toBe(true); expect(w.gateOpen).toBe(0);
    expect(Math.hypot(w.dog!.x - 160, w.dog!.y - 320)).toBeLessThan(2);
  });
  it('sprint cannot pass through a closed rail and sheep heads stay clear of the pen', () => {
    const w = new World(1200, 900, 1); w.toggleDog();
    Object.assign(w.dog!, { x: w.home.x, y: w.pen.top - 85, atHome: false }); w.sendDog(w.home.x, w.home.y); w.cast('e');
    const s = w.sheep[0]; Object.assign(s, { x: w.pen.left - 75, y: w.home.y, heading: 0, state: 'walking', goalX: w.home.x, goalY: w.home.y, timer: 100 });
    for (let i = 0; i < 1500; i++) {
      w.step(1 / 60);
      expectPenClear(w);
      expect(s.x <= w.pen.left - 66 * w.scale + 0.1 || s.y <= w.pen.top - 66 * w.scale + 0.1).toBe(true);
    }
    expect(w.dog!.arrived).toBe(true);
  });
  it('birds can perch above a fence post, stay out of grass reservations and leave when chased', () => {
    const w = new World(1200, 900, 0);
    for (let i = 0; i < 6000 && !w.birds.some(b => b.state === 'landed' && b.perchId !== undefined); i++) w.step(1 / 60);
    const bird = w.birds.find(b => b.state === 'landed' && b.perchId !== undefined)!;
    expect(bird).toBeDefined(); const post = w.fence.posts[bird.perchId!];
    expect(bird.x).toBeCloseTo(post.x); expect(bird.y).toBeCloseTo(post.y - 2 * w.pasture.cellH);
    expect(w.birdLife.groundSpots.some(p => p.id === bird.id)).toBe(false);
    w.birdLife.step(1 / 60, w.width, w.height, w.pasture, [], { x: post.x - 70, y: post.y, vx: 40, vy: 0 }, [], w.fence.posts, w.pen);
    expect(bird.state).toBe('departing');
  });
});
describe('the living pasture', () => {
  it('eats a local patch without changing distant grass', () => {
    const p = new Pasture(900, 700), near = p.index(400, 300), far = p.index(80, 80);
    const initial = p.grass[near], untouched = p.grass[far];
    expect(p.bite(400, 300, 1, 25)).toBeGreaterThan(0);
    expect(p.grass[near]).toBeLessThan(initial); expect(initial - p.grass[near]).toBeLessThanOrEqual(0.045 + 1e-6); expect(p.grass[far]).toBe(untouched);
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
    expect(p.grass[i]).toBeGreaterThan(0.16); expect(p.grass[i]).toBeLessThan(0.18); expect(p.grass[i]).toBeLessThanOrEqual(p.capacity[i]);
    expect(p.trampled[i]).toBeLessThan(tread * 0.01);
  });
  it('restores every patch instantly without resetting the paused world or its residents', () => {
    const w = new World(900, 700, 4, 7), p = w.pasture;
    advance(w, 4); w.toggleDog(); w.addFeed(250, 300); w.paused = true;
    p.grass.fill(0.2); p.cropped.fill(1); p.recoverIn.fill(110); p.trampled.fill(0.8);
    const before = { time: w.time, eaten: w.eaten, animals: structuredClone(w.animals), dog: structuredClone(w.dog), feed: structuredClone(w.feed) };
    p.regrowAll();
    expect(p.grass).toEqual(p.capacity); expect(p.cropped.every(v => v === 0)).toBe(true);
    expect(p.recoverIn.every(v => v === 0)).toBe(true); expect(p.trampled.every(v => v === 0)).toBe(true);
    expect(w.paused).toBe(true); expect(w.time).toBe(before.time); expect(w.eaten).toBe(before.eaten);
    expect(w.animals).toEqual(before.animals); expect(w.dog).toEqual(before.dog); expect(w.feed).toEqual(before.feed);
  });
  it('keeps nibbled ground cropped for minutes, preserves it on resize, and lets the brush restore it', () => {
    const p = new Pasture(900, 700), i = p.index(400, 300);
    p.bite(400, 300, 5, 25); const grass = p.grass[i];
    expect(p.cropped[i]).toBe(1);
    for (let k = 0; k < 200; k++) p.step(0.1);
    expect(p.grass[i]).toBeCloseTo(grass, 5); expect(p.cropped[i]).toBe(1);
    p.resize(1800, 1400); const next = p.index(800, 600);
    expect(p.cropped[next]).toBe(1); expect(p.recoverIn[next]).toBeGreaterThan(10);
    p.regrow(800, 600); expect(p.at(800, 600)).toBe(1); expect(p.cropped[next]).toBe(0); expect(p.recoverIn[next]).toBe(0);
  });
  it('uses a character grid exactly one-third smaller than the previous field', () => {
    const p = new Pasture(1200, 900); expect(p.cellW).toBeCloseTo(8 * 2 / 3); expect(p.cellH).toBeCloseTo(10 * 2 / 3);
    p.resize(412, 839); expect(p.cellW).toBe(4); expect(p.cellH).toBeCloseTo(8 * 2 / 3);
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
    a.toggleDog(); b.toggleDog(); Object.assign(a.dog!, { x: 300, y: 400 }); Object.assign(b.dog!, { x: 300, y: 400 });
    a.sendDog(1500, 400); b.sendDog(1500, 400); a.cast('e');
    advance(a, 0.5); advance(b, 0.5);
    expect(Math.hypot(a.dog!.x - 1500, a.dog!.y - 400)).toBeLessThan(Math.hypot(b.dog!.x - 1500, b.dog!.y - 400) - 45);
  });
  it('W encloses sheep on every pasture edge and follows a complete outside lap', () => {
    const w = new World(1200, 900, 4), b = w.bounds;
    const poses = [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: Math.min(b.right, w.pen.left - 140 * w.scale), y: b.bottom }, { x: b.left, y: b.bottom }];
    w.sheep.forEach((s, i) => Object.assign(s, poses[i], { timer: 10000 }));
    const outline = w.orbitOutline();
    expect(outline.left).toBeLessThan(b.left - 40); expect(outline.right).toBeGreaterThan(b.right + 40);
    expect(outline.top).toBeLessThan(b.top - 40); expect(outline.bottom).toBeGreaterThan(b.bottom + 40);
    w.cast('w'); const visited = new Set<string>();
    for (let frame = 0; frame < 5000 && w.dog!.orbit; frame++) {
      w.step(1 / 60); const d = w.dog!;
      if (!d.orbitEntering) expect(poses.some((a, i) => { const b = poses[(i + 1) % poses.length]; return (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x) < 0; })).toBe(true);
      if (Math.abs(d.x - outline.left) < 18) visited.add('left'); if (Math.abs(d.x - outline.right) < 18) visited.add('right');
      if (Math.abs(d.y - outline.top) < 18) visited.add('top'); if (Math.abs(d.y - outline.bottom) < 18) visited.add('bottom');
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
    advance(w, 0.2); expect(Math.hypot(w.dog!.vx, w.dog!.vy)).toBeGreaterThan(SPEEDS.dogWalk * 2);
    expect(w.dog!.recallReady).toBe(false);
  });
  it('an idle dog sleeps after seven seconds and wakes on a command or ability', () => {
    const w = new World(900, 700, 0); w.toggleDog(); advance(w, 7.2); expect(w.dog!.sleeping).toBe(true);
    w.cast('q'); expect(w.dog!.sleeping).toBe(false);
    advance(w, 7.2); expect(w.dog!.sleeping).toBe(true);
    w.sendDog(600, 300); expect(w.dog!.sleeping).toBe(false);
  });
  it('Q shows its wave before sheep react, reaches near then far sheep, and keeps the escape short', () => {
    const w = new World(1800, 1000, 2); w.toggleDog();
    Object.assign(w.dog!, { x: 500, y: 400, targetX: 500, targetY: 400 });
    Object.assign(w.sheep[0], { x: 650, y: 400, timer: 100 }); Object.assign(w.sheep[1], { x: 1300, y: 400, timer: 100 });
    w.cast('q'); expect(w.barks).toHaveLength(1); expect(w.barks[0].age).toBe(0);
    expect(w.sheep.every(s => s.barkLeft === 0 && s.state === 'grazing')).toBe(true);
    advance(w, 0.05); expect(w.sheep[0].barkLeft).toBeGreaterThan(2); expect(w.sheep[1].barkLeft).toBe(0);
    expect(w.sheep[1].state).toBe('grazing'); const goal = w.sheep[0].barkGoalX;
    advance(w, 0.35); expect(w.sheep[1].barkLeft).toBeGreaterThan(2); expect(w.sheep[1].state).toBe('startled');
    expect(w.sheep[0].barkGoalX).toBe(goal); // Each wave nudges a sheep just once.
    advance(w, 2.5);
    for (const [i, start] of [650, 1300].entries()) {
      expect(w.sheep[i].x - start).toBeGreaterThan(65); expect(w.sheep[i].x - start).toBeLessThan(115);
    }
    expect(w.barks).toHaveLength(0); expect(w.panicLeft).toBe(0);
  });
  it('a moving dog leaves its bark wave at the original position and immediate recasts stay independent', () => {
    const w = new World(1600, 900, 1); w.toggleDog();
    Object.assign(w.dog!, { x: 300, y: 400, targetX: 300, targetY: 400 });
    Object.assign(w.sheep[0], { x: 600, y: 400, timer: 100 }); w.cast('q');
    w.sendDog(200, 200); advance(w, 0.18);
    expect(w.barks[0].x).toBe(300); expect(w.barks[0].y).toBe(400);
    expect(w.barks[0].hitIds.has(w.sheep[0].id)).toBe(true);
    w.cast('q'); expect(w.barks).toHaveLength(2); expect(w.barks[1].hitIds.size).toBe(0);
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
describe('natural flock cohesion', () => {
  const spread = (w: World) => { const h = w.herdCenter(); return w.sheep.reduce((sum, s) => sum + Math.hypot(s.x - h.x, s.y - h.y), 0) / w.sheep.length; };
  it('keeps a spread-out pasture with at most two local companions per sheep', () => {
    const w = new World(1440, 900, 18), before = spread(w); advance(w, 70);
    expect(spread(w)).toBeGreaterThan(before * 0.85);
    expect(w.sheep.every(s => s.companions.length <= 2)).toBe(true);
    expect(w.sheep.some(s => s.companions.length === 1)).toBe(true);
    expect(w.sheep.some(s => s.companions.length === 2)).toBe(true);
    let closest = Infinity;
    for (let i = 0; i < w.sheep.length; i++) for (let j = i + 1; j < w.sheep.length; j++) closest = Math.min(closest, Math.hypot(w.sheep[i].x - w.sheep[j].x, w.sheep[i].y - w.sheep[j].y));
    expect(closest).toBeGreaterThan(35);
  });
  it('favors a large fresh patch over company on depleted ground', () => {
    const w = new World(1200, 900, 2), p = w.pasture; p.grass.fill(0);
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (c * p.cellW > 640 && c * p.cellW < 850) p.grass[r * p.cols + c] = 1;
    Object.assign(w.sheep[0], { x: 480, y: 400, companions: [w.sheep[1].id], socialTimer: 100, heading: 0 });
    Object.assign(w.sheep[1], { x: 400, y: 400 }); w.step(1 / 60);
    expect(w.sheep[0].state).toBe('walking'); expect(w.sheep[0].goalX).toBeGreaterThan(640);
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


describe('staged recovery and responsive controls', () => {
  it('grows through bare, dot, shoot, blade, young and mature stages', () => {
    const amounts = [0, 0.1, 0.3, 0.55, 0.8, 1], stages = amounts.map(a => grassAppearance(a, 0.8));
    expect(stages.map(s => s.stage)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(stages[0].glyph).toBe(' '); expect(stages[1].glyph).toBe('.');
    expect(stages[2].level).toBeGreaterThan(stages[1].level); expect(stages[4].family).toBe(0);
  });
  it('recovers earlier-eaten ground first with only a narrow timing variation', () => {
    const p = new Pasture(900, 700); p.bite(300, 300, 5, 25);
    for (let i = 0; i < 250; i++) p.step(0.1);
    p.bite(600, 300, 5, 25);
    for (let i = 0; i < 900; i++) p.step(0.1);
    expect(p.recoverIn[p.index(300, 300)]).toBe(0); expect(p.recoverIn[p.index(600, 300)]).toBeGreaterThan(0);
    expect(p.at(300, 300)).toBeGreaterThan(p.at(600, 300)); expect(p.edibleAt(300, 300)).toBe(0);
  });
  it('reacts ahead of an approaching dog and preserves its heading after arrival', () => {
    const w = new World(1200, 900, 1); Object.assign(w.sheep[0], { x: 650, y: 400 }); w.toggleDog();
    Object.assign(w.dog!, { x: 430, y: 400 }); w.sendDog(700, 400); w.step(1 / 60);
    expect(w.sheep[0].state).toBe('startled'); expect(w.sheep[0].vx).toBeGreaterThan(0);
    Object.assign(w.dog!, { x: 200.55, y: 400, targetX: 200, targetY: 400, heading: 2.8, arrived: false });
    advance(w, 8); expect(Math.abs(angleDelta(w.dog!.heading, 2.8))).toBeLessThan(0.001);
    expect(w.dog!.sleeping).toBe(true);
  });
  it('fits a rounded envelope to a diagonal flock instead of visiting empty rectangle corners', () => {
    const w = new World(1200, 900, 3);
    w.sheep.forEach((s, i) => Object.assign(s, { x: 250 + i * 300, y: 220 + i * 200 }));
    const route = w.orbitRoute(), b = w.orbitOutline(), rectangle = 2 * (b.right - b.left + b.bottom - b.top);
    expect(route.length).toBeGreaterThan(20); expect(perimeter(route)).toBeLessThan(rectangle * 0.85);
    for (const sheep of w.sheep) expect(nearestOnRoute(route, sheep).distance).toBeGreaterThan(55);
  });
});

describe('safe dog routes and active herding', () => {
  it('detours around a sheep instead of crossing its footprint, even during a sprint', () => {
    const w = new World(1200, 900, 1); w.toggleDog(); Object.assign(w.dog!, { x: 250, y: 400 }); w.sendDog(950, 400); w.cast('e');
    let lateral = 0;
    for (let frame = 0; frame < 720; frame++) {
      Object.assign(w.sheep[0], { x: 600, y: 400, heading: 0, size: 1, vx: 0, vy: 0, timer: 100 });
      w.step(1 / 60); const d = w.dog!;
      expect(Math.hypot(d.x - 608, d.y - 400)).toBeGreaterThanOrEqual(24.9);
      lateral = Math.max(lateral, Math.abs(d.y - 400));
    }
    expect(lateral).toBeGreaterThan(30); expect(Math.hypot(w.dog!.x - 950, w.dog!.y - 400)).toBeLessThan(3);
  });
  it('Come By runs faster and reduces flock spread compared with ordinary grazing', () => {
    const active = new World(1440, 900, 18), calm = new World(1440, 900, 18);
    const spread = (w: World) => { const h = w.herdCenter(); return w.sheep.reduce((sum, s) => sum + Math.hypot(s.x - h.x, s.y - h.y), 0) / w.sheep.length; };
    active.cast('w'); let peak = 0;
    // Compare at the end of the full pass, before the flock resumes spreading
    // out to graze. Pen dimensions change how long the completed lap takes.
    for (let i = 0; i < 3600 && active.dog!.orbit; i++) { active.step(1 / 60); calm.step(1 / 60); peak = Math.max(peak, Math.hypot(active.dog!.vx, active.dog!.vy)); }
    expect(active.dog!.orbit).toBeNull();
    expect(peak).toBeGreaterThan(180); expect(spread(active)).toBeLessThan(spread(calm) * 0.8);
  });
  it('keeps grass bare for at least a minute before staged growth begins', () => {
    const p = new Pasture(900, 700); p.bite(450, 350, 5, 25);
    for (let i = 0; i < 600; i++) p.step(0.1);
    expect(p.at(450, 350)).toBe(0); expect(p.recoverIn[p.index(450, 350)]).toBeGreaterThan(5);
  });
});


describe('shortest turns and visible grazing', () => {
  it('takes a quarter turn in either direction after any number of full laps', () => {
    for (const laps of [-20, -4, -1, 0, 1, 4, 20]) {
      const offset = laps * Math.PI * 2;
      expect(angleDelta(offset + Math.PI * 0.75, -Math.PI * 0.75)).toBeCloseTo(Math.PI / 2);
      expect(angleDelta(offset - Math.PI * 0.75, Math.PI * 0.75)).toBeCloseTo(-Math.PI / 2);
    }
  });
  it('turns the dog through 90 degrees rather than 270 at the wrap boundary', () => {
    const w = new World(1200, 900, 0); w.toggleDog();
    const heading = Math.PI * 2 + Math.PI * 0.75;
    Object.assign(w.dog!, { x: 600, y: 400, heading }); w.sendDog(500, 300);
    w.step(1 / 60); expect(angleDelta(heading, w.dog!.heading)).toBeGreaterThan(0);
    advance(w, 0.4); expect(Math.abs(angleDelta(w.dog!.heading, -Math.PI * 0.75))).toBeLessThan(0.02);
    expect(Math.abs(w.dog!.heading)).toBeLessThanOrEqual(Math.PI);
  });
  it('clears a visible mouth-sized patch that remains bare after a minute', () => {
    const p = new Pasture(900, 700); p.bite(450, 350, 3, 21);
    expect(p.at(450, 350)).toBe(0); expect(p.at(458, 350)).toBe(0);
    expect(p.at(200, 200)).toBe(1);
    for (let i = 0; i < 600; i++) p.step(0.1);
    expect(p.at(450, 350)).toBe(0); expect(p.at(458, 350)).toBe(0);
  });
});


describe('committed routes and flexible clearance', () => {
  it('keeps the same side of a moving sheep during a sprint instead of zigzagging', () => {
    const w = new World(1200, 900, 1); w.toggleDog(); Object.assign(w.dog!, { x: 250, y: 400 }); w.sendDog(950, 400); w.cast('e');
    const sides = new Set<number>(); let deviation = 0;
    for (let frame = 0; frame < 600; frame++) {
      Object.assign(w.sheep[0], { x: 600, y: 400 + Math.sin(frame * 0.18) * 8, heading: 0, size: 1, vx: 0, vy: 0, timer: 100 });
      w.step(1 / 60); const d = w.dog!;
      if (d.x > 360 && d.x < 720 && Math.abs(d.y - 400) > 7) sides.add(Math.sign(d.y - 400));
      deviation = Math.max(deviation, Math.abs(d.y - 400));
    }
    expect(sides.size).toBe(1); expect(deviation).toBeGreaterThan(25); expect(w.dog!.x).toBeGreaterThan(940);
  });
  it('brushes through an available gap between sheep instead of taking a wide detour', () => {
    const w = new World(1200, 900, 2); w.toggleDog(); Object.assign(w.dog!, { x: 250, y: 400 }); w.sendDog(950, 400); w.cast('e');
    let deviation = 0, squeezed = false;
    for (let frame = 0; frame < 600; frame++) {
      w.sheep.forEach((s, i) => Object.assign(s, { x: 600, y: i ? 432 : 368, heading: 0, size: 1, vx: 0, vy: 0, timer: 100 }));
      w.step(1 / 60); const d = w.dog!; squeezed ||= d.navMode === 'squeeze';
      deviation = Math.max(deviation, Math.abs(d.y - 400));
    }
    expect(squeezed).toBe(true); expect(deviation).toBeLessThan(18); expect(w.dog!.x).toBeGreaterThan(940);
  });
  it('can reach a necessarily occupied target instead of endlessly bouncing off it', () => {
    const w = new World(1200, 900, 1); w.toggleDog(); Object.assign(w.dog!, { x: 350, y: 400 }); w.sendDog(608, 400); w.cast('e');
    let crossing = false;
    for (let frame = 0; frame < 360; frame++) {
      Object.assign(w.sheep[0], { x: 600, y: 400, heading: 0, size: 1, vx: 0, vy: 0, timer: 100 });
      w.step(1 / 60); crossing ||= w.dog!.navMode === 'cross';
    }
    expect(crossing).toBe(true); expect(Math.hypot(w.dog!.x - 608, w.dog!.y - 400)).toBeLessThan(3);
  });
});
