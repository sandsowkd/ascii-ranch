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
  expect(coverage).toBeGreaterThan(0.96); expect(errors).toEqual([]);
  mkdirSync('docs', { recursive: true }); await page.screenshot({ path: `docs/${info.project.name}.png` });
});

test('right-click movement, stronger bark and immediate recasts without cooldowns', async ({ page }) => {
  const first = await state(page), x = first.width * 0.7, y = first.height * 0.4;
  await page.mouse.click(x, y, { button: 'right' }); const commanded = await state(page);
  expect(commanded.dog).not.toBeNull(); expect(commanded.dog.targetX).toBeCloseTo(x, 0); expect(commanded.feed.length).toBe(0);
  const distance = Math.hypot(commanded.dog.x - x, commanded.dog.y - y);
  await expect.poll(async () => { const s = await state(page); return Math.hypot(s.dog.x - x, s.dog.y - y); }).toBeLessThan(distance - 10);
  await page.keyboard.press('e'); expect((await state(page)).dog.sprint).toBeGreaterThan(0.3);
  await page.keyboard.press('q'); await page.keyboard.press('q');
  expect((await state(page)).barks).toBe(2); expect((await state(page)).panic).toBeGreaterThan(5);
  await expect(page.locator('[data-ability=q]')).toBeEnabled();
  await expect.poll(async () => (await state(page)).sheep.every((s: any) => s.state === 'startled')).toBe(true);
});

test('W covers the entire flock; R recalls then launches straight to the cursor', async ({ page }, info) => {
  await page.keyboard.press('w'); const w = await state(page); expect(w.dog.orbit).toBe('w');
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

test('single left-clicks feed without calling or redirecting the dog; flock controls persist', async ({ page }) => {
  const first = await state(page);
  await page.getByRole('button', { name: 'Add a sheep', exact: true }).click(); expect((await state(page)).count).toBe(19);
  await page.reload(); expect((await state(page)).count).toBe(19);
  await page.getByRole('button', { name: 'Remove a sheep', exact: true }).click(); expect((await state(page)).count).toBe(18);
  await page.mouse.click(first.width * 0.5, first.height * 0.4);
  expect((await state(page)).feed.length).toBe(1); expect((await state(page)).dog).toBeNull();
  await page.mouse.click(first.width * 0.7, first.height * 0.4, { button: 'right' }); const commanded = await state(page);
  await page.mouse.click(first.width * 0.4, first.height * 0.45); const fed = await state(page);
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
    const app = (window as any).__meadow, w = app.world; w.paused = true; w.sheep.length = 2; w.dog = null;
    const scale = w.scale, x = w.width * 0.5, y = w.height * 0.4;
    Object.assign(w.sheep[0], { x, y, heading: 0, phase: 0, size: 1, state: 'walking' });
    Object.assign(w.sheep[1], { x: x + 35 * scale, y, heading: 0, phase: 0, size: 1, state: 'walking' });
    app.renderer.render();
    return app.renderer.cellAt(x + 25.5 * scale + 4 - 4.4 * scale, y - 5.4 * scale);
  });
  expect(result.priority).toBe(2); expect(result.tile).toBe(3); expect(result.glyph).toBe('o');
});

test('uneaten turf is green, grazed soil is brown, and idle dogs show drifting Zs', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, p = w.pasture;
    w.paused = true; w.sheep.length = 0;
    const x = w.width * 0.5, y = w.height * 0.4, a = p.index(x, y), b = p.index(x + 50, y);
    p.capacity[a] = p.capacity[b] = 0.8; p.grass[a] = 0.8; p.grass[b] = 0.02; p.soil[a] = p.soil[b] = 0; p.flower[a] = p.flower[b] = -1;
    app.renderer.render(); return { full: app.renderer.cellAt(x, y), eaten: app.renderer.cellAt(x + 50, y) };
  });
  expect(result.full.family).toBe(0); expect(result.eaten.family).toBe(1);
  expect(result.full.tile).toBe(6); expect(result.eaten.tile).toBe(7);
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
