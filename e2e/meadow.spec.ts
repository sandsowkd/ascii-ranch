import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const state = (page: Page): Promise<any> => page.evaluate(() => (window as any).__meadow.snapshot());
test.beforeEach(async ({ page }) => { await page.goto('/?debug'); await page.evaluate(() => document.fonts.ready); });

test('living grass, grazing sheep, full canvas and no errors', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const before = await state(page); expect(before.count).toBe(18); expect(before.cols * before.cellW).toBeGreaterThanOrEqual(before.width); expect(before.rows * before.cellH).toBeGreaterThanOrEqual(before.height);
  const box = await page.locator('canvas').boundingBox(); expect(box?.width).toBe(before.width); expect(box?.height).toBe(before.height);
  await expect.poll(async () => (await state(page)).eaten).toBeGreaterThan(before.eaten + 0.1);
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(2);
  const coverage = await page.evaluate(() => {
    const c = document.querySelector('canvas')!, s = (window as any).__meadow.world, ctx = c.getContext('2d')!, p = s.pasture, d = c.width / s.width;
    let total = 0, ink = 0;
    for (let row = 0; row < p.rows - 1; row += 4) for (let col = 0; col < p.cols - 1; col += 4) {
      const px = ctx.getImageData(Math.ceil(col * p.cellW * d), Math.ceil(row * p.cellH * d), Math.floor(p.cellW * d), Math.floor(p.cellH * d)).data;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 27 || px[i + 1] > 34 || px[i + 2] > 29) { ink++; break; }
      total++;
    }
    return ink / total;
  });
  expect(coverage).toBeGreaterThan(0.94); expect(errors).toEqual([]);
  mkdirSync('docs', { recursive: true }); await page.screenshot({ path: `docs/${info.project.name}.png` });
});

test('left-click movement, gentler bark and immediate recasts without cooldowns', async ({ page }) => {
  const first = await state(page), x = first.width * 0.7, y = first.height * 0.4;
  await page.mouse.click(x, y); const commanded = await state(page);
  expect(commanded.dog).not.toBeNull(); expect(commanded.dog.targetX).toBeCloseTo(x, 0); expect(commanded.feed.length).toBe(0);
  const distance = Math.hypot(commanded.dog.x - x, commanded.dog.y - y);
  await expect.poll(async () => { const s = await state(page); return Math.hypot(s.dog.x - x, s.dog.y - y); }).toBeLessThan(distance - 10);
  await page.keyboard.press('e'); expect((await state(page)).dog.sprint).toBeGreaterThan(0.3);
  await page.keyboard.press('q'); await page.keyboard.press('q');
  expect((await state(page)).barks).toBe(2); expect((await state(page)).panic).toBeGreaterThan(1.8);
  await expect(page.locator('[data-ability=q]')).toBeEnabled();
});

test('W covers the entire flock; R recalls then launches straight to the cursor', async ({ page }, info) => {
  await page.keyboard.press('w'); const w = await state(page); expect(w.dog.orbit).toBe('w'); expect(w.dog.orbitPath.length).toBeGreaterThan(20);
  expect(w.sheep.every((s: any) => s.x > w.outline.left && s.x < w.outline.right && s.y > w.outline.top && s.y < w.outline.bottom)).toBe(true);
  await expect(page.locator('[data-ability=w]')).toHaveClass(/active/);
  await page.keyboard.press('r'); let s = await state(page);
  expect(s.dog.orbit).toBeNull(); expect(s.dog.recallReady).toBe(true); expect(s.dog.targetX).toBe(s.home.doorX);
  const x = s.width * 0.7, y = s.height * 0.4;
  await page.mouse.move(x, y); await page.keyboard.press('r'); s = await state(page);
  expect(s.dog.launching).toBe(true); expect(s.dog.targetX).toBeCloseTo(x, 0); expect(s.dog.targetY).toBeCloseTo(y, 0);
  await page.keyboard.press('q'); const t = (await state(page)).time;
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(t + 0.3);
  const toast = await page.locator('#toast').boundingBox(), abilities = await page.locator('.abilities').boundingBox();
  expect(toast!.y + toast!.height).toBeLessThan(abilities!.y);
  await page.screenshot({ path: `docs/${info.project.name}-herding.png` });
});

test('single right-clicks feed without calling or redirecting the dog; flock controls persist', async ({ page }) => {
  const first = await state(page);
  await page.getByRole('button', { name: 'Add a sheep', exact: true }).click(); expect((await state(page)).count).toBe(19);
  await page.reload(); expect((await state(page)).count).toBe(19);
  await page.getByRole('button', { name: 'Remove a sheep', exact: true }).click(); expect((await state(page)).count).toBe(18);
  await page.mouse.click(first.width * 0.5, first.height * 0.4, { button: 'right' });
  expect((await state(page)).feed.length).toBe(1); expect((await state(page)).dog).toBeNull();
  await page.mouse.click(first.width * 0.7, first.height * 0.4); const commanded = await state(page);
  await page.mouse.click(first.width * 0.4, first.height * 0.45, { button: 'right' }); const fed = await state(page);
  expect(fed.feed.length).toBe(2); expect(fed.dog.targetX).toBe(commanded.dog.targetX); expect(fed.dog.targetY).toBe(commanded.dog.targetY);
  await page.locator('#dog-button').click(); expect((await state(page)).dog.recallReady).toBe(true);
  await page.locator('#dog-button').click(); expect((await state(page)).dog.launching).toBe(true);
});

test('pause, help, reset, keyboard visibility, reduced motion and resize', async ({ page }) => {
  await page.locator('#help-toggle').click(); await expect(page.getByLabel('How to play')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByLabel('How to play')).toBeHidden();
  await page.locator('#pause').click(); const paused = await state(page); expect(paused.paused).toBe(true);
  await page.keyboard.press('q'); expect((await state(page)).barks).toBe(0); expect((await state(page)).time).toBe(paused.time);
  await page.locator('#pause').click(); await page.keyboard.press('h'); await expect(page.locator('body')).toHaveClass(/hide-ui/); await page.keyboard.press('h');
  await page.setViewportSize({ width: 580, height: 760 }); await expect.poll(async () => (await state(page)).width).toBe(580);
  expect((await state(page)).count).toBe(18);
  await page.locator('#reset').click(); expect((await state(page)).feed.length).toBe(0); expect((await state(page)).dog).toBeNull();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); expect((await state(page)).paused).toBe(true);
});

test('touch movement, ability buttons, long-press feeding and no scroll', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch checks run on mobile');
  const s = await state(page); await page.touchscreen.tap(s.width * 0.3, s.height * 0.4); expect((await state(page)).dog).not.toBeNull();
  await page.locator('[data-ability=q]').tap(); expect((await state(page)).barks).toBeGreaterThan(0);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.width * 0.7, y: s.height * 0.35 }] });
  // A hold is a time-based gesture; wait for its threshold explicitly.
  await page.waitForTimeout(520);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); expect((await state(page)).feed.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
});

test('records a frame sample with moving sheep and animated grass', async ({ page }, info) => {
  await expect.poll(async () => (await state(page)).time, { timeout: 10000 }).toBeGreaterThan(3.3);
  const s = await state(page); expect(s.fps).toBeGreaterThan(20);
  writeFileSync(`docs/performance-${info.project.name}.json`, JSON.stringify({ viewport: [s.width, s.height], sheep: s.count, cells: s.cols * s.rows, measuredFPS: Math.round(s.fps * 10) / 10, note: 'Local headless Chromium sample; mobile uses device emulation.' }, null, 2) + '\n');
});

test('sheep heads keep priority over overlapping wool', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world; w.paused = true; w.sheep.length = 2; w.lambs.length = 0; w.dog = null;
    const scale = w.scale, x = w.width * 0.5, y = w.height * 0.4;
    Object.assign(w.sheep[0], { x, y, heading: 0, phase: 0, size: 1, state: 'walking' });
    Object.assign(w.sheep[1], { x: x + 35 * scale, y, heading: 0, phase: 0, size: 1, state: 'walking' });
    app.renderer.render();
    return app.renderer.cellAt(x + 31.9 * scale, y - 6 * scale);
  });
  expect(result.priority).toBe(4); expect(result.tile).toBe(0); expect(result.glyph).toBe('O');
});

test('white outlined dark faces and pronounced ears stay clear on grazed ground in every direction', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world; w.reset(1); w.paused = true; w.pasture.grass.fill(0); w.pasture.flower.fill(-1);
    const s = w.sheep[0], p = w.pasture, scale = w.scale, x = w.width * 0.5, y = w.height * 0.4;
    Object.assign(s, { x, y, phase: 0, size: 1, state: 'walking' });
    return [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(heading => {
      s.heading = heading; app.renderer.render(); let eyes = 0, face = 0, ears = 0, rim = 0;
      for (let row = Math.floor((y - 65 * scale) / p.cellH); row < Math.ceil((y + 65 * scale) / p.cellH); row++) for (let col = Math.floor((x - 65 * scale) / p.cellW); col < Math.ceil((x + 65 * scale) / p.cellW); col++) {
        const cell = app.renderer.cellAt((col + 0.5) * p.cellW, (row + 0.5) * p.cellH);
        if (cell.glyph === 'O' && cell.priority === 4) eyes++;
        if (cell.family === 8 && cell.level <= 12) face++;
        if (cell.family === 3 && cell.priority === 3 && cell.level >= 29) rim++;
        if (['(', ')'].includes(cell.glyph) && cell.priority === 3) ears++;
      }
      return { eyes, face, ears, rim };
    });
  });
  for (const head of result) { expect(head.eyes).toBe(2); expect(head.face).toBeGreaterThan(2); expect(head.ears).toBe(2); expect(head.rim).toBeGreaterThan(8); }
});

test('small lambs accompany the flock and their counter follows adult population changes', async ({ page }) => {
  const before = await state(page); expect(before.lambs).toHaveLength(3);
  expect(before.lambs.every((l: any) => l.size < 0.6 && before.sheep.some((s: any) => s.id === l.parentId))).toBe(true);
  await expect(page.locator('#flock-caption')).toHaveText('your flock · 3 lambs');
  await page.getByRole('button', { name: 'Remove a sheep', exact: true }).click();
  expect((await state(page)).lambs).toHaveLength(2); await expect(page.locator('#flock-caption')).toHaveText('your flock · 2 lambs');
  await page.getByRole('button', { name: 'Add a sheep', exact: true }).click();
  expect((await state(page)).lambs).toHaveLength(3);
});

test('colorful visitors land in the meadow, take off near the dog, and appear with the lambs', async ({ page }, info) => {
  const landed = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world;
    w.reset(18); w.paused = false;
    for (let i = 0; i < 1500 && !w.birds.some((b: any) => b.state === 'landed'); i++) w.step(1 / 60);
    app.controller.sync(); app.renderer.render();
    const bird = w.birds.find((b: any) => b.state === 'landed'), p = w.pasture; let colored = 0, eyeRow = Infinity, wingRow = -Infinity; const profileRows = new Set<number>();
    for (let row = 0; row < p.rows; row++) for (let col = 0; col < p.cols; col++) {
      const cell = app.renderer.cellAt((col + 0.5) * p.cellW, (row + 0.5) * p.cellH);
      if (cell.family >= 9) colored++;
      if (bird && cell.priority === 1 && Math.hypot((col + 0.5) * p.cellW - bird.x, (row + 0.5) * p.cellH - bird.y) < 50) {
        profileRows.add(row); if (cell.glyph === 'o') eyeRow = row; if (cell.glyph === '#') wingRow = row;
      }
    }
    return { bird, colored, lambs: w.lambs.length, profileRows: profileRows.size, eyeAboveWing: eyeRow < wingRow };
  });
  expect(landed.bird).toBeTruthy(); expect(landed.colored).toBeGreaterThan(3); expect(landed.lambs).toBe(3); expect(landed.profileRows).toBe(4); expect(landed.eyeAboveWing).toBe(true);
  await page.screenshot({ path: `docs/${info.project.name}-families.png` });
  const departing = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, bird = w.birds.find((b: any) => b.state === 'landed');
    w.toggleDog(); Object.assign(w.dog, { x: bird.x + 60, y: bird.y, targetX: bird.x + 60, targetY: bird.y, arrived: true });
    w.paused = false; w.step(1 / 60); w.paused = true; app.renderer.render(); return bird.state;
  });
  expect(departing).toBe('departing');
});

test('uneaten turf is light green, grazed turf is dark green on charcoal, and idle dogs show drifting Zs', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, p = w.pasture;
    w.paused = true; w.sheep.length = 0; w.lambs.length = 0;
    const x = w.width * 0.5, y = w.height * 0.4, a = p.index(x, y), b = p.index(x + 50, y);
    p.capacity[a] = p.capacity[b] = 0.8; p.grass[a] = 0.8; p.grass[b] = 0.02; p.soil[a] = p.soil[b] = 0; p.flower[a] = p.flower[b] = -1;
    app.renderer.render(); return { full: app.renderer.cellAt(x, y), eaten: app.renderer.cellAt(x + 50, y) };
  });
  expect(result.full.family).toBe(0); expect([6, 1]).toContain(result.eaten.family);
  expect(result.full.tile).toBe(0); expect(result.eaten.tile).toBe(0); expect(result.full.level).toBeGreaterThan(result.eaten.level + 6);
  const asleep = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world; w.reset(18); w.paused = false; w.toggleDog();
    for (let frame = 0; frame < 450; frame++) w.step(1 / 60);
    app.controller.sync(); app.renderer.render();
    let zs = 0; const p = w.pasture, d = w.dog;
    for (let y = d.y - 70; y < d.y; y += p.cellH / 2) for (let x = d.x; x < d.x + 50; x += p.cellW / 2) {
      const cell = app.renderer.cellAt(x, y); if (cell.glyph === 'z' || cell.glyph === 'Z') zs++;
    }
    return { sleeping: d.sleeping, zs };
  });
  expect(asleep.sleeping).toBe(true); expect(asleep.zs).toBeGreaterThan(0);
  await page.screenshot({ path: `docs/${info.project.name}-sleep.png` });
});


test('Space toggles a continuous hover regrow brush; P pauses independently', async ({ page }) => {
  const first = await state(page), x = first.width * 0.3, end = first.width * 0.7, y = first.height * 0.4;
  await page.keyboard.press('p'); expect((await state(page)).paused).toBe(true);
  await page.evaluate(() => { const p = (window as any).__meadow.world.pasture; p.grass.fill(0); p.trampled.fill(1); });
  await page.mouse.move(x, y); await page.keyboard.press('Space');
  expect((await state(page)).regrowMode).toBe(true); expect((await state(page)).paused).toBe(true);
  await page.mouse.move(end, y);
  const painted = await page.evaluate(({ x, end, y }) => {
    const p = (window as any).__meadow.world.pasture;
    return { start: p.at(x, y), middle: p.at((x + end) / 2, y), end: p.at(end, y), far: p.at(x, y + 80) };
  }, { x, end, y });
  expect(painted).toEqual({ start: 1, middle: 1, end: 1, far: 0 });
  await page.keyboard.press('Space'); await page.mouse.move(x, y + 80);
  expect((await state(page)).regrowMode).toBe(false);
  expect(await page.evaluate(({ x, y }) => (window as any).__meadow.world.pasture.at(x, y + 80), { x, y })).toBe(0);
  await page.keyboard.press('p'); expect((await state(page)).paused).toBe(false);
  expect((await state(page)).dog).toBeNull(); expect((await state(page)).feed).toHaveLength(0);
});

test('terrain matches Pond charcoal; bare grass rests on charcoal before growing through stages', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, p = w.pasture; w.paused = true; w.sheep.length = 0; w.lambs.length = 0;
    p.flower.fill(-1); p.grass.fill(1); app.renderer.render();
    let freshBrown = 0, brown = 0, dark = 0, full = 0, dots = 0;
    for (let r = 10; r < p.rows - 20; r++) for (let c = 5; c < p.cols - 5; c++) {
      if (app.renderer.cellAt(c * p.cellW, r * p.cellH).family === 1) freshBrown++;
    }
    p.grass.fill(0.02); app.renderer.render();
    for (let r = 10; r < p.rows - 20; r++) for (let c = 5; c < p.cols - 5; c++) {
      const cell = app.renderer.cellAt(c * p.cellW, r * p.cellH); full++;
      if (cell.family === 1) brown++; if (cell.family === 6) dark++; if (cell.glyph === ' ') dots++;
    }
    const ctx = app.renderer.canvas.getContext('2d'), d = app.renderer.canvas.width / w.width;
    const pixels = ctx.getImageData(Math.floor(w.width * 0.3 * d), Math.floor(w.height * 0.3 * d), 100, 100).data;
    let black = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 26 && pixels[i+1] === 25 && pixels[i+2] === 23) black++;
    return { dots: dots / full, freshBrown, ratio: brown / full, dark: dark / full, black: black / (pixels.length / 4) };
  });
  expect(result.freshBrown).toBe(0); expect(result.ratio).toBe(0); expect(result.dots).toBeGreaterThan(0.99); expect(result.dark).toBeGreaterThan(0.92); expect(result.black).toBeGreaterThan(0.8);
  await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, p = w.pasture; w.reset(18); w.paused = true;
    for (const s of w.sheep) { for (let i = 0; i < 10; i++) p.bite(s.x - 22 + i * 4, s.y + 10, 25, 24); }
    w.toggleDog(); Object.assign(w.dog, { x: w.width * 0.64, y: w.height * 0.6, targetX: w.width * 0.64, targetY: w.height * 0.6, heading: -2.5 });
    app.controller.sync(); app.renderer.render();
  });
  await page.screenshot({ path: `docs/${info.project.name}-grass.png` });
});

test('sheep graze in loose groups and leave lasting cropped patches', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world;
    w.reset(18); w.paused = false;
    const spread = () => { const h = w.herdCenter(); return w.sheep.reduce((sum: number, s: any) => sum + Math.hypot(s.x - h.x, s.y - h.y), 0) / w.sheep.length; };
    const before = spread();
    for (let frame = 0; frame < 90 * 60; frame++) w.step(1 / 60);
    app.controller.sync(); app.renderer.render();
    const p = w.pasture; let cropped = 0, visibleDots = 0;
    for (let i = 0; i < p.grass.length; i++) if (p.cropped[i]) {
      cropped++;
      const cell = app.renderer.cellAt((i % p.cols + 0.5) * p.cellW, (Math.floor(i / p.cols) + 0.5) * p.cellH);
      if (cell.family === 6 && [' ', '.', ',', "'"].includes(cell.glyph)) visibleDots++;
    }
    return { before, after: spread(), cropped, visibleDots, cellW: p.cellW, cellH: p.cellH };
  });
  expect(result.after).toBeGreaterThan(result.before * 0.85); expect(result.cropped).toBeGreaterThan(100); expect(result.visibleDots).toBeGreaterThan(40);
  await page.screenshot({ path: `docs/${info.project.name}-flock.png` });
});


test('incremental glyph painting leaves no movement trails', async ({ page }) => {
  const changed = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, r = app.renderer; w.paused = false;
    w.sendDog(w.width * 0.4, w.height * 0.4); w.cast('q');
    for (let frame = 0; frame < 60; frame++) { w.step(1 / 60); r.render(); }
    w.dog = null; w.barks.length = 0; w.marker = null; r.render();
    const canvas = r.canvas, ctx = canvas.getContext('2d');
    const incremental = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    r.resize(); r.render(); const full = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let different = 0; for (let i = 0; i < full.length; i++) if (full[i] !== incremental[i]) different++;
    return different;
  });
  expect(changed).toBe(0);
});


test('regrowth gains characters and color gradually, and running dogs have tucked paws and visible tails', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, p = w.pasture; w.paused = true; w.sheep.length = 0; w.lambs.length = 0;
    const amounts = [0, 0.1, 0.3, 0.55, 0.8, 1]; p.flower.fill(-1); p.trampled.fill(0);
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) p.grass[r * p.cols + c] = amounts[Math.min(5, Math.floor(c / p.cols * 6))];
    app.renderer.render();
    const stages = amounts.map((_, j) => app.renderer.cellAt((j + 0.5) / 6 * w.width, w.height * 0.4));
    w.toggleDog(); const d = w.dog, x = w.width * 0.5, y = w.height * 0.4;
    Object.assign(d, { x, y, targetX: x + 100, targetY: y, heading: 0, vx: 108, vy: 0 }); w.time = 0.25;
    app.renderer.render(); let tail = 0, feet = 0;
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
      const px = (c + 0.5) * p.cellW, py = (r + 0.5) * p.cellH, cell = app.renderer.cellAt(px, py);
      if (![3, 4].includes(cell.family)) continue;
      if (px < x - 23 * w.scale && px > x - 47 * w.scale && Math.abs(py - y) < 16 * w.scale) tail++;
      if (Math.abs(px - x) < 20 * w.scale && py - y > 9 * w.scale && py - y < 19 * w.scale && ((px - x) / (22 * w.scale)) ** 2 + ((py - y) / (11.5 * w.scale)) ** 2 > 1 && !['[', ']'].includes(cell.glyph)) feet++;
    }
    return { stages, tail, feet };
  });
  expect(result.stages[0].glyph).toBe(' '); expect(result.stages[1].glyph).toBe('.');
  expect(result.stages[2].family).toBe(6); expect(result.stages[3].family).toBe(0);
  expect(result.stages[5].level).toBeGreaterThan(result.stages[3].level);
  expect(result.tail).toBeGreaterThan(3); expect(result.feet).toBeGreaterThan(0); expect(result.feet).toBeLessThan(8);
  await page.screenshot({ path: `docs/${info.project.name}-regrowth.png` });
});

test('Q has a visible first frame and a subtle wave that crosses the field quickly', async ({ page }, info) => {
  const ripple = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, p = w.pasture; w.reset(0); w.toggleDog();
    const x = w.width * 0.5, y = w.height * 0.4;
    Object.assign(w.dog, { x, y, targetX: x, targetY: y, arrived: true }); p.flower.fill(-1); app.renderer.render();
    const before = Array.from({ length: p.cols * p.rows }, (_, i) => JSON.stringify(app.renderer.cellAt((i % p.cols + 0.5) * p.cellW, (Math.floor(i / p.cols) + 0.5) * p.cellH)));
    const measure = () => {
      let changed = 0, nearest = Infinity, farthest = 0, brightest = 0;
      for (let i = 0; i < before.length; i++) {
        const px = (i % p.cols + 0.5) * p.cellW, py = (Math.floor(i / p.cols) + 0.5) * p.cellH, cell = app.renderer.cellAt(px, py);
        if (before[i] !== JSON.stringify(cell)) { changed++; const distance = Math.hypot(px - x, py - y); nearest = Math.min(nearest, distance); farthest = Math.max(farthest, distance); brightest = Math.max(brightest, cell.level); }
      }
      return { changed, nearest, farthest, brightest };
    };
    app.controller.cast('q'); // Includes the synchronous first-frame render used by the Q key.
    const immediate = measure(); w.barks[0].age = 0.2; app.renderer.render(); const traveling = measure();
    w.barks[0].age = 0.7; app.renderer.render(); const finished = measure();
    const result = { immediate, traveling, finished, scale: w.scale, cells: before.length, width: w.width, height: w.height };
    w.reset(18); w.toggleDog(); Object.assign(w.dog, { x, y, targetX: x, targetY: y, arrived: true });
    app.controller.cast('q'); for (let i = 0; i < 7; i++) w.step(1 / 60);
    app.controller.sync(); app.renderer.render(); w.paused = true;
    return result;
  });
  expect(ripple.immediate.changed).toBeGreaterThan(4); expect(ripple.immediate.nearest).toBeGreaterThan(35 * ripple.scale);
  expect(ripple.immediate.farthest).toBeLessThan(53 * ripple.scale);
  expect(ripple.traveling.farthest).toBeGreaterThan(Math.min(ripple.width, ripple.height) * 0.35);
  expect(ripple.traveling.farthest - ripple.traveling.nearest).toBeLessThan(10);
  expect(ripple.traveling.changed).toBeLessThan(ripple.cells * 0.03); expect(ripple.traveling.brightest).toBeLessThanOrEqual(10);
  expect(ripple.finished.changed).toBe(0);
  await page.screenshot({ path: `docs/${info.project.name}-bark.png` });
});
