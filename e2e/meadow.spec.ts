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

test('right-click movement, bark ripple and sprint shortcuts', async ({ page }) => {
  const first = await state(page), x = first.width * 0.3, y = first.height * 0.4;
  await page.mouse.click(x, y, { button: 'right' }); const commanded = await state(page);
  expect(commanded.dog).not.toBeNull(); expect(commanded.dog.targetX).toBeCloseTo(x, 0); expect(commanded.feed.length).toBe(0);
  const distance = Math.hypot(commanded.dog.x - x, commanded.dog.y - y);
  await expect.poll(async () => { const s = await state(page); return Math.hypot(s.dog.x - x, s.dog.y - y); }).toBeLessThan(distance - 10);
  await page.keyboard.press('e'); expect((await state(page)).dog.sprint).toBeGreaterThan(0.3);
  await page.keyboard.press('q'); await expect.poll(async () => (await state(page)).barks).toBeGreaterThan(0);
  expect((await state(page)).cooldowns.q).toBeGreaterThan(2);
  await expect(page.locator('[data-ability=q]')).toBeDisabled();
  await expect.poll(async () => (await state(page)).cooldowns.q, { timeout: 5000 }).toBe(0);
  await expect(page.locator('[data-ability=q]')).toBeEnabled();
});

test('W and R produce different timed flock-circling actions', async ({ page }, info) => {
  await page.keyboard.press('w'); expect((await state(page)).dog.orbit).toBe('w');
  const before = await state(page); await expect.poll(async () => (await state(page)).dog.orbitAngle).toBeGreaterThan(before.dog.orbitAngle + 0.1);
  await page.keyboard.press('r'); expect((await state(page)).dog.orbit).toBe('r');
  await expect(page.locator('[data-ability=r]')).toHaveClass(/active/);
  await page.keyboard.press('q'); const t = (await state(page)).time;
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(t + 0.3);
  const toast = await page.locator('#toast').boundingBox(), abilities = await page.locator('.abilities').boundingBox();
  expect(toast!.y + toast!.height).toBeLessThan(abilities!.y);
  await page.screenshot({ path: `docs/${info.project.name}-herding.png` });
  const s = await state(page); await page.mouse.click(s.width * 0.25, s.height * 0.4, { button: 'right' });
  expect((await state(page)).dog.orbit).toBeNull();
});

test('feeding, add/remove sheep, persistence and sending the dog home', async ({ page }) => {
  const first = await state(page);
  await page.getByRole('button', { name: 'Add a sheep', exact: true }).click(); expect((await state(page)).count).toBe(19);
  await page.reload(); expect((await state(page)).count).toBe(19);
  await page.getByRole('button', { name: 'Remove a sheep', exact: true }).click(); expect((await state(page)).count).toBe(18);
  await page.keyboard.press('f'); expect((await state(page)).feedMode).toBe(true);
  await page.mouse.click(first.width * 0.5, first.height * 0.4); expect((await state(page)).feed.length).toBe(1); expect((await state(page)).feedMode).toBe(false);
  await page.locator('#feed-button').click(); await page.mouse.click(first.width * 0.6, first.height * 0.45); expect((await state(page)).feed.length).toBe(2);
  await page.locator('#dog-button').click(); expect((await state(page)).dog).not.toBeNull();
  await page.locator('#dog-button').click(); expect((await state(page)).dog).toBeNull();
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
