import { test, expect } from '@playwright/test';

test('dog paws stay underneath the coat at every heading and gait phase, without floating brackets', async ({ page }, info) => {
  await page.goto('/?debug'); await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const app = (window as any).__meadow, w = app.world, r = app.renderer, p = w.pasture;
    w.reset(0, 0); w.toggleDog(); w.paused = true; p.flower.fill(-1);
    const d = w.dog, x = w.width * 0.45, y = w.height * 0.4, scale = w.scale;
    Object.assign(d, { x, y, targetX: x, targetY: y, atHome: false, penTransit: null, sleeping: false, barkAge: 99 });
    const cases: any[] = [];
    const sheet = document.createElement('canvas'); sheet.width = 960; sheet.height = 480;
    const ctx = sheet.getContext('2d')!; ctx.fillStyle = '#1a1917'; ctx.fillRect(0, 0, sheet.width, sheet.height); ctx.imageSmoothingEnabled = false;
    const dpr = r.canvas.width / w.width;
    for (let heading = 0; heading < 8; heading++) for (const running of [false, true]) for (const time of [0, 0.12, 0.24]) {
      const angle = heading * Math.PI / 4;
      Object.assign(d, { heading: angle, vx: running ? Math.cos(angle) * 116 : 0, vy: running ? Math.sin(angle) * 116 : 0 }); w.time = time;
      r.render(); let brackets = 0; const toes: { x: number; y: number }[] = [], stems: { x: number; y: number }[] = [];
      for (let row = Math.floor((y - 55 * scale) / p.cellH); row <= Math.ceil((y + 55 * scale) / p.cellH); row++) for (let col = Math.floor((x - 60 * scale) / p.cellW); col <= Math.ceil((x + 60 * scale) / p.cellW); col++) {
        const px = (col + 0.5) * p.cellW, py = (row + 0.5) * p.cellH, c = r.cellAt(px, py);
        if (['[', ']'].includes(c.glyph)) brackets++;
        if (c.priority === 0 && c.family === 3 && c.level === 17 && c.glyph === '.') toes.push({ x: px - x, y: py - y });
        if (c.priority === 0 && c.family === 4 && c.level === 19 && c.glyph === '|') stems.push({ x: px - x, y: py - y });
      }
      cases.push({ heading, running, time, brackets, toes, stems });
      if (running && time === 0.12) {
        const column = heading % 4, row = Math.floor(heading / 4), width = 116 * scale, height = 94 * scale;
        ctx.drawImage(r.canvas, (x - width / 2) * dpr, (y - height / 2) * dpr, width * dpr, height * dpr, column * 240 + 4, row * 240 + 26, 232, 188);
        ctx.fillStyle = '#b8b69c'; ctx.font = '12px monospace'; ctx.fillText(`${heading * 45} degrees`, column * 240 + 12, row * 240 + 18);
      }
    }
    const proof = sheet.toDataURL();
    // Display a contact sheet made only from actual rendered game pixels.
    sheet.style.cssText = 'position:fixed;inset:0;z-index:20;width:100vw;height:auto'; document.body.append(sheet);
    return { cases, proof };
  });
  for (const frame of result.cases) {
    expect(frame.brackets).toBe(0); expect(frame.toes.length).toBeLessThanOrEqual(2);
    // When facing down, the muzzle can correctly cover the near paws. Side-on
    // poses must show them; every visible paw still has to remain below the coat.
    if (frame.heading === 0 || frame.heading === 4) expect(frame.toes.length).toBeGreaterThan(0);
    for (const toe of frame.toes) { expect(toe.y).toBeGreaterThan(0); expect(Math.abs(toe.x)).toBeLessThan(16); expect(toe.y).toBeLessThan(30); }
    for (const stem of frame.stems) { expect(stem.y).toBeGreaterThan(0); expect(Math.abs(stem.x)).toBeLessThan(16); }
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`docs/${info.project.name}-dog-paws.png`, Buffer.from(result.proof.split(',')[1], 'base64'));
});
