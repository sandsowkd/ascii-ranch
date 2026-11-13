import { describe, expect, it } from 'vitest';
import { World } from '../src/simulation/World';
import { Pasture } from '../src/simulation/Pasture';

function advance(world: World, seconds: number) { for (let i = 0; i < seconds * 60; i++) world.step(1 / 60); }
describe('the living pasture', () => {
  it('eats a local patch without changing distant grass', () => {
    const p = new Pasture(900, 700), near = p.index(400, 300), far = p.index(80, 80);
    const initial = p.grass[near], untouched = p.grass[far];
    expect(p.bite(400, 300, 1, 25)).toBeGreaterThan(0);
    expect(p.grass[near]).toBeLessThan(initial); expect(p.grass[far]).toBe(untouched);
  });
  it('regrows eaten grass and recovers flattened blades', () => {
    const p = new Pasture(900, 700), i = p.index(400, 300);
    p.grass[i] = 0; p.tread(400, 300, 1); const tread = p.trampled[i];
    for (let k = 0; k < 600; k++) p.step(0.1);
    expect(p.grass[i]).toBeGreaterThan(0.3); expect(p.grass[i]).toBeLessThanOrEqual(p.capacity[i]);
    expect(p.trampled[i]).toBeLessThan(tread * 0.01);
  });
  it('grazers consume actual grass and move to new patches', () => {
    const w = new World(900, 700, 1), s = w.sheep[0], before = { x: s.x, y: s.y };
    advance(w, 20); expect(s.ate).toBeGreaterThan(0); expect(w.eaten).toBeGreaterThan(0);
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
    expect(w.feed.length).toBe(10); advance(w, 81); expect(w.feed.length).toBe(0);
  });
});
describe('a controllable sheepdog', () => {
  it('moves to the command with bounded speed and arrives smoothly', () => {
    const w = new World(1200, 800, 0); w.sendDog(250, 250);
    const start = { x: w.dog!.x, y: w.dog!.y }; w.step(1 / 60);
    expect(Math.hypot(w.dog!.x - start.x, w.dog!.y - start.y)).toBeLessThanOrEqual(190 / 60 + 0.001);
    advance(w, 6); expect(Math.hypot(w.dog!.x - 250, w.dog!.y - 250)).toBeLessThan(2);
  });
  it('nearby sheep move away from the dog', () => {
    const w = new World(900, 700, 1), s = w.sheep[0]; s.x = 500; s.y = 300;
    w.toggleDog(); Object.assign(w.dog!, { x: 420, y: 300, targetX: 420, targetY: 300 });
    advance(w, 0.5); expect(s.x).toBeGreaterThan(510); expect(s.state).toBe('startled');
  });
  it('bark releases a traveling pulse that adds an outward push', () => {
    const make = () => { const w = new World(900, 700, 1); w.sheep[0].x = 570; w.sheep[0].y = 300; w.toggleDog(); Object.assign(w.dog!, { x: 400, y: 300, targetX: 400, targetY: 300 }); return w; };
    const bark = make(), calm = make(); bark.cast('q'); advance(bark, 0.8); advance(calm, 0.8);
    expect(bark.sheep[0].vx).toBeGreaterThan(calm.sheep[0].vx + 2); expect(bark.sheep[0].x).toBeGreaterThan(calm.sheep[0].x);
  });
  it('prevents repeated casts until the cooldown expires', () => {
    const w = new World(900, 700, 0); expect(w.cast('q')).toBe(true); expect(w.cast('q')).toBe(false);
    expect(w.barks.length).toBe(1); advance(w, 3); expect(w.cast('q')).toBe(true);
  });
  it('sprint travels farther than ordinary movement without teleporting', () => {
    const a = new World(1600, 1000, 0), b = new World(1600, 1000, 0);
    a.sendDog(100, 150); b.sendDog(100, 150); a.cast('e');
    advance(a, 0.5); advance(b, 0.5);
    expect(Math.hypot(a.dog!.x - 100, a.dog!.y - 150)).toBeLessThan(Math.hypot(b.dog!.x - 100, b.dog!.y - 150) - 100);
  });
  it('come by circles the flock, and a move command cancels the orbit', () => {
    const w = new World(1200, 900, 18); w.cast('w'); const angle = w.dog!.orbitAngle;
    advance(w, 1); expect(w.dog!.orbitAngle).toBeGreaterThan(angle); expect(w.dog!.orbit).toBe('w');
    w.sendDog(100, 150); expect(w.dog!.orbit).toBeNull();
  });
  it('hold flock gathers distant sheep and ends after six seconds', () => {
    const w = new World(1400, 900, 8); w.cast('r');
    const center = { x: w.dog!.anchorX, y: w.dog!.anchorY };
    const spread = () => w.sheep.reduce((n, s) => n + Math.hypot(s.x - center.x, s.y - center.y), 0) / w.sheep.length;
    const before = spread(); advance(w, 5.5); expect(spread()).toBeLessThan(before * 0.85);
    advance(w, 0.6); expect(w.dog!.orbit).toBeNull();
  });
});
describe('stable state and controls', () => {
  it('adds and removes sheep, including an empty meadow and the population limit', () => {
    const w = new World(1200, 900, 0); expect(w.removeSheep()).toBe(false);
    for (let i = 0; i < 90; i++) w.addSheep(); expect(w.sheep.length).toBe(80); expect(w.addSheep()).toBe(false);
    for (let i = 0; i < 80; i++) w.removeSheep(); expect(w.sheep.length).toBe(0); w.cast('r'); advance(w, 1);
    expect(Number.isFinite(w.dog!.x)).toBe(true);
  });
  it('does not advance paused sheep, grass, abilities or cooldowns', () => {
    const w = new World(900, 700, 18); w.cast('q'); const s = { ...w.sheep[0] }, cooldown = w.cooldowns.q;
    w.paused = true; advance(w, 5); expect(w.sheep[0]).toEqual(s); expect(w.time).toBe(0); expect(w.cooldowns.q).toBe(cooldown); expect(w.cast('e')).toBe(false);
  });
  it('resizes creatures and keeps the whole grid filled', () => {
    const w = new World(1200, 900, 18); w.cast('r'); w.addFeed(500, 300); w.resize(412, 839);
    expect(w.sheep.length).toBe(18); expect(w.pasture.cols * w.pasture.cellW).toBeGreaterThanOrEqual(412); expect(w.pasture.rows * w.pasture.cellH).toBeGreaterThanOrEqual(839);
    expect(w.sheep.every(s => s.x > 0 && s.x < 412 && s.y > 0 && s.y < 839)).toBe(true);
    expect(w.dog!.anchorX).toBeGreaterThan(0); expect(w.dog!.anchorX).toBeLessThan(412);
    advance(w, 1); expect(w.dog!.targetX).toBeLessThanOrEqual(w.bounds.right);
  });
  it('stays finite and bounded during a minute of grazing, feeding and herding', () => {
    const w = new World(1100, 800, 36); w.toggleDog();
    for (let frame = 0; frame < 3600; frame++) {
      if (frame % 360 === 0) { w.sendDog(250 + frame % 600, 250 + frame % 200); w.cast('q'); w.addFeed(500, 350); }
      if (frame % 600 === 0) w.cast('w');
      w.step(1 / 60);
    }
    for (const s of w.sheep) { expect(Number.isFinite(s.x + s.y + s.vx + s.vy)).toBe(true); expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(105.001); expect(s.x).toBeGreaterThanOrEqual(w.bounds.left); expect(s.x).toBeLessThanOrEqual(w.bounds.right); }
    expect([...w.pasture.grass].every(g => Number.isFinite(g) && g >= 0 && g <= 1)).toBe(true);
  });
});
