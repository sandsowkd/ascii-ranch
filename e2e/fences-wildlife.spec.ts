import { test, expect, type Page } from '@playwright/test';

const state = (page: Page): Promise<any> => page.evaluate(() => (window as any).__meadow.snapshot());
test.beforeEach(async ({ page }) => { await page.goto('/?debug'); await page.evaluate(() => document.fonts.ready); });

test('pressing F once arms a straight fence with a preview, consumes the dog click, and supports undo', async ({ page }, info) => {
  await page.evaluate(() => { const a = (window as any).__meadow; a.world.reset(0, 0); a.world.toggleDog(); a.controller.setPaused(true); });
  const before = await state(page), x = before.width * 0.42, y1 = before.height * 0.28, y2 = before.height * 0.6;
  await page.locator('#settings-toggle').click(); await page.keyboard.press('f'); await expect(page.locator('#settings-panel')).toBeHidden(); expect((await state(page)).fenceMode).toBe(true);
  await page.mouse.move(x, y1); await page.mouse.down(); await page.mouse.move(x, y2, { steps: 12 });
  const draft = await state(page); expect(draft.fencePreview.valid).toBe(true); expect(draft.fences).toHaveLength(0);
  expect(draft.dog.targetX).toBe(before.dog.targetX); expect(draft.dog.targetY).toBe(before.dog.targetY);
  await page.mouse.up();
  const built = await state(page); expect(built.fences).toHaveLength(1); expect(built.fencePreview).toBeNull(); expect(built.fenceMode).toBe(false);
  expect(built.fences[0].a.x).toBeCloseTo(built.fences[0].b.x); expect(built.fencePosts.length).toBeGreaterThan(before.fencePosts.length + 1);
  const wood = await page.evaluate(({ x, y }) => (window as any).__meadow.renderer.cellAt(x, y), { x, y: (y1 + y2) / 2 });
  expect([5, 7]).toContain(wood.family); expect(wood.priority).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: `docs/${info.project.name}-drawn-fence.png` });
  await page.keyboard.press('f'); await page.mouse.move(x + 55, y1); await page.mouse.down(); await page.mouse.move(x + 55, y2);
  await page.keyboard.press('Escape'); await page.mouse.up(); expect((await state(page)).fences).toHaveLength(1);
  await page.keyboard.press('Backspace'); expect((await state(page)).fences).toHaveLength(0);
  await page.keyboard.press('p'); await page.mouse.click(before.width * 0.3, before.height * 0.4, { button: 'right' });
  expect((await state(page)).feed).toHaveLength(1); expect((await state(page)).dog.atHome).toBe(true);
  await page.mouse.click(before.width * 0.3, before.height * 0.4); expect((await state(page)).dog.atHome).toBe(false);
});

test('mouse faces stay distinct at every heading and the hawk visibly folds and spreads its smaller wings', async ({ page }, info) => {
  const result = await page.evaluate(() => {
    const a = (window as any).__meadow, w = a.world, r = a.renderer, p = w.pasture;
    w.reset(0, 0); w.paused = true; p.flower.fill(-1);
    const m = { id: 40, x: w.width * 0.4, y: w.height * 0.5, vx: 0, vy: 0, heading: 0, phase: 0, state: 'resting', age: 0, timer: 100, life: 100, goalX: 0, goalY: 0 };
    w.mouseLife.mice = [m]; const faces: any[] = [];
    for (let i = 0; i < 8; i++) {
      m.heading = i * Math.PI / 4; r.render();
      const dx = Math.cos(m.heading), dy = Math.sin(m.heading), scale = w.scale;
      const cell = (along: number, side: number) => r.cellAt(m.x + (dx * along - dy * side) * scale, m.y + (dy * along + dx * side) * scale);
      faces.push({ ears: [-1, 1].map(s => cell(1, s * 11)), eyes: [-1, 1].map(s => cell(10, s * 5)), nose: cell(17, 0) });
    }
    w.mouseLife.mice = []; w.birdLife.birds = [{ id: 2, kind: 'hawk', x: w.width * 0.5, y: w.height * 0.5, heading: 0, phase: 0, state: 'soaring', age: 3, altitude: 1,
      landingX: 0, landingY: 0, exitX: 2000, exitY: 150, restFor: 0, color: 2 }];
    const poses = [];
    for (const time of [0.3, 0.83]) {
      w.time = time; r.render(); let top = Infinity, bottom = -Infinity; const ink: number[] = [];
      for (let row = 0; row < p.rows; row++) for (let col = 0; col < p.cols; col++) {
        const c = r.cellAt((col + 0.5) * p.cellW, (row + 0.5) * p.cellH);
        if (c.priority === 5) { top = Math.min(top, row * p.cellH); bottom = Math.max(bottom, row * p.cellH); ink.push(row * p.cols + col); }
      }
      poses.push({ span: bottom - top, ink });
    }
    return { faces, poses };
  });
  for (const face of result.faces) {
    for (const ear of face.ears) expect(ear).toMatchObject({ glyph: 'O', family: 3 });
    for (const eye of face.eyes) expect(eye).toMatchObject({ glyph: 'o', family: 3 });
    expect(face.nose).toMatchObject({ glyph: '.', family: 12 });
  }
  expect(result.poses[0].span - result.poses[1].span).toBeGreaterThan(15);
  expect(result.poses[0].span).toBeLessThan(100); expect(result.poses[0].ink).not.toEqual(result.poses[1].ink);
  await page.screenshot({ path: `docs/${info.project.name}-hawk-upstroke.png` });
  await page.evaluate(() => { const a = (window as any).__meadow; a.world.time = 0.3; a.renderer.render(); });
  await page.screenshot({ path: `docs/${info.project.name}-hawk-downstroke.png` });
});

test('birds perch centrally on drawn posts; tiny pink-tailed mice and broad-winged hawks retain clear ASCII silhouettes', async ({ page }, info) => {
  if (info.project.name === 'desktop') { await page.setViewportSize({ width: 960, height: 720 }); await expect.poll(async () => (await state(page)).width).toBe(960); }
  const result = await page.evaluate(() => {
    const a = (window as any).__meadow, w = a.world, r = a.renderer, p = w.pasture;
    w.reset(0, 0); w.toggleDog(); w.paused = true;
    w.addFence({ x: w.width * 0.42, y: w.height * 0.28 }, { x: w.width * 0.42, y: w.height * 0.6 });
    const perchId = w.fence.posts.length + 1, post = w.fencePosts[perchId];
    w.birdLife.birds = [{ id: 99, kind: 'songbird', perchId, x: post.x, y: post.y - 2 * p.cellH, heading: 0, phase: 0, state: 'landed', age: 0, altitude: 0,
      landingX: post.x, landingY: post.y - 2 * p.cellH, exitX: w.width + 70, exitY: 150, restFor: 20, color: 0 }];
    const mx = w.width * 0.68, my = w.height * 0.6;
    w.mouseLife.mice = [{ id: 50, x: mx, y: my, vx: 0, vy: 0, heading: 0, goalX: mx, goalY: my, phase: 0, state: 'resting', age: 0, timer: 100, life: 100 }];
    const h = { id: 2, kind: 'hawk', x: w.width * 0.68, y: w.height * 0.36, heading: 0, phase: 0, state: 'soaring', age: 0, altitude: 1.2,
      landingX: 0, landingY: 0, exitX: w.width + 70, exitY: 150, restFor: 0, color: 2 };
    w.birdLife.birds.push(h); r.render();
    let tail = 0, body = 0, hawkCells = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = my - 12; y <= my + 12; y += p.cellH) for (let x = mx - 26; x <= mx + 15; x += p.cellW) {
      const cell = r.cellAt(x, y); if (cell.family === 12) tail++; if (cell.family === 2) body++;
    }
    for (let row = 0; row < p.rows; row++) for (let col = 0; col < p.cols; col++) {
      const cell = r.cellAt((col + 0.5) * p.cellW, (row + 0.5) * p.cellH);
      if (cell.priority === 5) { hawkCells++; minX = Math.min(minX, col * p.cellW); maxX = Math.max(maxX, col * p.cellW); minY = Math.min(minY, row * p.cellH); maxY = Math.max(maxY, row * p.cellH); }
    }
    const c = Math.floor(post.x / p.cellW), row = Math.floor(post.y / p.cellH) - 2;
    const legs = [-1, 1].map(dc => r.cellAt((c + dc + 0.5) * p.cellW, (row + 0.5) * p.cellH));
    const dpr = r.canvas.width / w.width, pixels = r.canvas.getContext('2d').getImageData(Math.floor((mx - 25) * dpr), Math.floor((my - 12) * dpr), Math.ceil(42 * dpr), Math.ceil(24 * dpr)).data;
    let pinkPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 90 && pixels[i] > pixels[i + 1] + 20 && pixels[i + 2] > pixels[i + 1] + 4) pinkPixels++;
    // A mouse beneath a lamb is hidden by wool rather than being drawn on top.
    w.addLamb(); Object.assign(w.lambs[0], { x: mx, y: my, heading: 0 }); r.render();
    const cover = r.cellAt(mx, my).family;
    w.lambs.length = 0;
    for (let i = 0; i < 3; i++) { w.addSheep(); Object.assign(w.sheep[i], { x: w.width * 0.22, y: w.height * (0.32 + i * 0.14), heading: 0, state: 'grazing', timer: 100 }); }
    a.controller.sync(); r.render();
    return { tail, body, pinkPixels, hawkCells, hawkSpan: Math.max(maxX - minX, maxY - minY), legs, cover };
  });
  expect(result.tail).toBeGreaterThanOrEqual(2); expect(result.body).toBeGreaterThanOrEqual(2); expect(result.hawkCells).toBeGreaterThan(35);
  expect(result.hawkSpan).toBeGreaterThan(45); expect(result.hawkSpan).toBeLessThan(100); expect(result.cover).toBe(2);
  expect(result.pinkPixels).toBeGreaterThan(2);
  for (const leg of result.legs) expect(leg).toMatchObject({ glyph: '|', family: 3, priority: 8 });
  await page.screenshot({ path: `docs/${info.project.name}-fences-wildlife.png` });
});
