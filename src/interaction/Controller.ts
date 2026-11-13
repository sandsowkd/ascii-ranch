import { ABILITIES, type Ability, type World } from '../simulation/World';
import type { Renderer } from '../engine/Renderer';

export class Controller {
  feedMode = false;
  regrowMode = false;
  pointer = { x: 0, y: 0 };
  private abort = new AbortController();
  private downAt = 0; private startX = 0; private startY = 0;
  private pointerId: number | null = null; private button = -1; private dragged = false;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private lastUI = -1;
  constructor(private canvas: HTMLCanvasElement, private world: World, private renderer: Renderer) {
    this.pointer.x = world.width * 0.5; this.pointer.y = world.height * 0.5;
    const opts = { signal: this.abort.signal };
    canvas.addEventListener('contextmenu', e => e.preventDefault(), opts);
    canvas.addEventListener('pointerdown', this.down, opts);
    canvas.addEventListener('pointermove', this.move, opts);
    canvas.addEventListener('pointerup', this.up, opts);
    canvas.addEventListener('pointercancel', this.cancel, opts);
    canvas.addEventListener('lostpointercapture', this.cancel, opts);
    window.addEventListener('blur', this.cancel, opts);
    document.querySelector('#add-sheep')!.addEventListener('click', () => { if (world.addSheep()) { this.toast('one more little wanderer.'); this.persist(); } this.sync(); renderer.render(); }, opts);
    document.querySelector('#remove-sheep')!.addEventListener('click', () => { world.removeSheep(); this.persist(); this.sync(); renderer.render(); }, opts);
    document.querySelector('#dog-button')!.addEventListener('click', () => { if (!world.dog) { world.toggleDog(); this.toast('left-click the meadow to send your dog there.'); } else this.cast('r'); this.sync(); renderer.render(); }, opts);
    document.querySelector('#feed-button')!.addEventListener('click', () => this.toggleFeed(), opts);
    document.querySelector('#regrow-button')!.addEventListener('click', () => this.toggleRegrow(), opts);
    document.querySelector('#pause')!.addEventListener('click', () => this.setPaused(!world.paused), opts);
    document.querySelector('#reset')!.addEventListener('click', () => { this.cancel(); world.reset(); this.sync(); renderer.render(); this.toast('a fresh patch of green.'); }, opts);
    document.querySelector('#help-toggle')!.addEventListener('click', () => {
      const el = document.querySelector<HTMLElement>('#help')!; el.hidden = !el.hidden;
      document.querySelector('#help-toggle')!.setAttribute('aria-expanded', String(!el.hidden));
    }, opts);
    for (const el of document.querySelectorAll<HTMLButtonElement>('[data-ability]')) el.addEventListener('click', () => this.cast(el.dataset.ability as Ability), opts);
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (['q', 'w', 'e', 'r'].includes(key)) { e.preventDefault(); this.cast(key as Ability); }
      if (key === 'f') this.toggleFeed();
      if (e.code === 'Space') { e.preventDefault(); this.toggleRegrow(); }
      if (key === 'p') { e.preventDefault(); this.setPaused(!world.paused); }
      if (key === 'h') document.body.classList.toggle('hide-ui');
      if (e.key === 'Escape') { this.feedMode = false; this.regrowMode = false; this.sync(); document.querySelector<HTMLElement>('#help')!.hidden = true; document.querySelector('#help-toggle')!.setAttribute('aria-expanded', 'false'); document.body.classList.remove('hide-ui'); }
      this.wake();
    }, opts);
    window.addEventListener('pointermove', this.wake, opts); window.addEventListener('pointerdown', this.wake, opts); window.addEventListener('focusin', this.wake, opts);
    this.sync(); this.wake();
  }
  private coords(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  private down = (e: PointerEvent) => {
    if (!e.isPrimary || this.pointerId !== null || ![0, 2].includes(e.button)) return;
    e.preventDefault(); this.pointerId = e.pointerId; this.button = e.button;
    this.canvas.setPointerCapture(e.pointerId); this.pointer = this.coords(e);
    this.startX = this.pointer.x; this.startY = this.pointer.y; this.downAt = performance.now(); this.dragged = false;
    if (this.regrowMode) { this.paint(this.pointer, this.pointer); return; }
    if (this.world.paused) return;
    if (e.button === 0 && e.pointerType !== 'touch' && !this.feedMode) { this.world.sendDog(this.pointer.x, this.pointer.y); this.sync(); }
  };
  private move = (e: PointerEvent) => {
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    const previous = this.pointer; this.pointer = this.coords(e);
    if (this.regrowMode) { this.paint(previous, this.pointer); return; }
    if (this.pointerId !== null && Math.hypot(this.pointer.x - this.startX, this.pointer.y - this.startY) > 6) this.dragged = true;
    if (this.world.paused) return;
    if (this.pointerId !== null && this.button === 0 && e.pointerType !== 'touch' && !this.feedMode) this.world.sendDog(this.pointer.x, this.pointer.y);
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const p = this.coords(e);
    if (!this.world.paused && !this.regrowMode) {
      const touchFeed = e.pointerType === 'touch' && !this.dragged && performance.now() - this.downAt > 450;
      if (!this.dragged && (this.button === 2 || this.feedMode || touchFeed)) {
        this.world.addFeed(p.x, p.y); this.feedMode = false; this.toast('a little something to nibble.');
      } else if (e.pointerType === 'touch' && this.button === 0 && !this.dragged) this.world.sendDog(p.x, p.y);
    }
    this.cancel(); this.sync(); this.renderer.render();
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  };
  private cancel = () => { this.pointerId = null; this.button = -1; this.canvas.classList.remove('dragging'); };
  cast(key: Ability) {
    if (this.world.cast(key, this.pointer)) {
      const text: Record<Ability, string> = { q: 'woof! a little room, please.', w: 'the long way round. every last sheep.', e: 'a quick pair of paws.', r: this.world.dog?.recallReady ? 'back to the pen. r again to race to your cursor.' : 'back to the meadow!' };
      this.toast(text[key]); this.sync(); this.renderer.render();
    }
  }
  private toggleFeed() { this.feedMode = !this.feedMode; this.regrowMode = false; this.sync(); if (this.feedMode) this.toast('click a patch of grass to scatter feed.'); }
  private toggleRegrow() {
    this.regrowMode = !this.regrowMode; this.feedMode = false; this.cancel(); this.sync();
    if (this.regrowMode) { this.paint(this.pointer, this.pointer); this.toast('regrow brush on. hover to grow; space to finish.'); }
    else this.toast('regrow brush off.');
  }
  private paint(from: { x: number; y: number }, to: { x: number; y: number }) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y), steps = Math.max(1, Math.ceil(distance / 12));
    for (let i = 0; i <= steps; i++) this.world.pasture.regrow(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, 34 * this.world.scale);
    this.renderer.render();
  }
  setPaused(paused: boolean) { this.world.paused = paused; this.cancel(); this.sync(); this.renderer.render(); }
  private persist() { try { localStorage.setItem('ascii-meadow.count.v1', String(this.world.sheep.length)); } catch { /* optional storage */ } }
  private toast(text: string) {
    const el = document.querySelector<HTMLElement>('#toast')!; el.textContent = text; el.classList.add('show');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  private wake = () => { document.body.classList.remove('idle'); clearTimeout(this.idleTimer); this.idleTimer = setTimeout(() => document.body.classList.add('idle'), 5500); };
  sync() {
    document.querySelector('#sheep-count')!.textContent = String(this.world.sheep.length);
    document.querySelector<HTMLButtonElement>('#remove-sheep')!.disabled = this.world.sheep.length === 0;
    document.querySelector<HTMLButtonElement>('#add-sheep')!.disabled = this.world.sheep.length === 80;
    const dog = document.querySelector<HTMLButtonElement>('#dog-button')!;
    dog.setAttribute('aria-pressed', String(!!this.world.dog)); dog.setAttribute('aria-label', this.world.dog ? this.world.dog.recallReady ? 'Release sheepdog' : 'Recall sheepdog' : 'Call sheepdog');
    document.querySelector('#dog-label')!.textContent = this.world.dog ? this.world.dog.recallReady ? 'send dog out' : 'recall dog' : 'call sheepdog';
    const pause = document.querySelector<HTMLButtonElement>('#pause')!;
    pause.textContent = this.world.paused ? 'resume' : 'pause'; pause.setAttribute('aria-pressed', String(this.world.paused)); pause.setAttribute('aria-label', this.world.paused ? 'Resume meadow' : 'Pause meadow');
    document.querySelector<HTMLElement>('#paused-note')!.hidden = !this.world.paused;
    document.querySelector('#feed-button')!.setAttribute('aria-pressed', String(this.feedMode)); this.canvas.classList.toggle('feed-mode', this.feedMode);
    document.querySelector('#regrow-button')!.setAttribute('aria-pressed', String(this.regrowMode));
    this.canvas.classList.toggle('regrow-mode', this.regrowMode);
    this.tick(true);
  }
  tick(force = false) {
    if (!force && this.world.time - this.lastUI < 0.1 && this.world.time >= this.lastUI) return;
    this.lastUI = this.world.time;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-ability]')) {
      const key = button.dataset.ability as Ability, d = this.world.dog;
      const active = key === 'q' ? this.world.panicLeft > 0 : key === 'w' ? !!d?.orbit : key === 'e' ? d && (d.sprint > 0 || d.launching) : d?.recallReady;
      button.classList.remove('cooling'); button.classList.toggle('active', !!active); button.disabled = this.world.paused;
      button.querySelector('.cooldown')!.textContent = '';
      button.setAttribute('aria-label', `${key.toUpperCase()} ${ABILITIES[key].name}`);
      if (key === 'r') button.querySelector('.ability-name')!.textContent = d?.recallReady ? 'release' : 'recall';
    }
    const grazing = this.world.sheep.filter(s => s.state === 'grazing').length;
    document.querySelector('#note')!.textContent = !this.world.sheep.length ? 'a quiet meadow, waiting for company.' : this.world.dog?.sleeping ? 'a good dog deserves a little nap.' : grazing > this.world.sheep.length * 0.5 ? 'nothing to do. nowhere to be.' : 'the grass is greener a little further on.';
  }
  destroy() { this.cancel(); this.abort.abort(); clearTimeout(this.toastTimer); clearTimeout(this.idleTimer); }
}
