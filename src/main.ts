import './style.css';
import { World } from './simulation/World';
import { Renderer } from './engine/Renderer';
import { Controller } from './interaction/Controller';

let count = 18;
try { const saved = localStorage.getItem('ascii-meadow.count.v1'); if (saved !== null && Number.isFinite(Number(saved))) count = Math.max(0, Math.min(80, Math.round(Number(saved)))); } catch { /* optional storage */ }
const canvas = document.querySelector<HTMLCanvasElement>('#meadow')!;
const world = new World(Math.max(200, innerWidth), Math.max(300, innerHeight), count);
const renderer = new Renderer(canvas, world);
const controller = new Controller(canvas, world, renderer);
const resize = new ResizeObserver(() => { world.resize(Math.max(200, innerWidth), Math.max(300, innerHeight)); renderer.resize(); renderer.render(); });
resize.observe(document.documentElement);
let raf = 0, last = 0, accumulator = 0, frames = 0, fps = 60, fpsAt = 0;
const step = 1 / 60;
function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const elapsed = last ? Math.min(0.1, (now - last) / 1000) : step; last = now;
  if (world.paused) { accumulator = 0; return; }
  accumulator += elapsed; let steps = 0;
  while (accumulator >= step && steps < 6) { world.step(step); accumulator -= step; steps++; }
  if (steps === 6) accumulator = 0;
  renderer.render(); controller.tick(); frames++;
  if (now - fpsAt > 1000) { fps = frames * 1000 / (now - fpsAt); frames = 0; fpsAt = now; }
}
function visibility() { cancelAnimationFrame(raf); last = 0; accumulator = 0; if (!document.hidden) raf = requestAnimationFrame(frame); }
document.addEventListener('visibilitychange', visibility);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motion = () => controller.setPaused(reduced.matches);
reduced.addEventListener('change', motion); if (reduced.matches) motion();
renderer.render(); void renderer.ready(); raf = requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has('debug')) Object.defineProperty(window, '__meadow', { value: { world, controller, renderer, snapshot: () => ({
  time: world.time, paused: world.paused, count: world.sheep.length, width: world.width, height: world.height,
  cols: world.pasture.cols, rows: world.pasture.rows, cellW: world.pasture.cellW, cellH: world.pasture.cellH,
  grass: world.pasture.grass.reduce((a, b) => a + b, 0), eaten: world.eaten,
  feed: world.feed.map(f => ({ ...f })), sheep: world.sheep.map(s => ({ ...s })), dog: world.dog ? { ...world.dog } : null,
  home: world.home, pen: world.pen, regrowMode: controller.regrowMode, outline: world.orbitOutline(), panic: world.panicLeft, barks: world.barks.length, feedMode: controller.feedMode, fps,
}) } });
if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(raf); resize.disconnect(); controller.destroy(); reduced.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); });
