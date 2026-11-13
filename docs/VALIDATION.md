# Validation

Verified November 13, 2026.

- Production build passed: strict TypeScript and Vite.
- 72 simulation/navigation/wildlife tests passed.
- 47 desktop/mobile Chromium browser checks passed; one desktop touch-only case is intentionally skipped.
- Independent sheep/lamb counters, persistence, lamb-only grazing/herding, and reset are covered. Regrow restores all grass immediately, including while paused, without changing animals, food, or simulation time.
- Every exposed right-rail character contains visibly brown pixels at both 1× desktop and 2× mobile rendering resolutions. Rails use a dedicated warm-brown palette and a fractional glyph stroke; post geometry is unchanged.
- The 284 px menu contains independent sheep/lamb counters, Pause, Reset, Regrow, and a compact how-to-play guide. It has no title, close button, dog controls, or ability buttons. The settings icon, outside click, H, and Escape dismiss it; Q/W/E/R retain their keyboard actions.
- Sheep move 25% faster under dog pressure and give sleeping dogs an 88 px buffer (scaled on small screens). Normal grazing and bark escape speeds are unchanged.
- Hold F and drag to place a straight fence with a live placement preview; Backspace undoes the last rail. Sheep and dog routes go around fence ends, including food following, sprint, and W. Collision checks keep bodies and muzzles clear; construction leaves the recall passage free. Reset clears construction.
- New posts accept centered bird landings with both legs visible. Tiny mice alternate short darts and rests and have visibly pink tails, checked against rendered pixels at both desktop and mobile resolutions.
- Every third visitor is a broad-winged hawk. Exposed mice can be targeted for a swoop with one 50/50 catch attempt; a mouse hidden beneath wool is protected, including if it hides during a dive. With no exposed prey, the hawk flies over.
- Fresh loads show only the ASCII settings button outside the canvas. Flock persistence, pause/reset, food placement, hover regrowth, touch feeding, bird rendering, animal overlap, and recall gate behavior remain covered.
- Local samples: 60 FPS at 1440 × 900 and at emulated 412 × 839. Mobile uses Chromium device emulation.
- Production output: approximately 69.4 kB JavaScript (24.7 kB gzip) and 3.3 kB CSS, with a bundled font and no runtime dependencies.
- README contains two sentences; acknowledgments contain two license links. Full upstream MIT and SIL OFL notices remain intact in `public/licenses/` and the production build.

`desktop-fences-wildlife.png` and `mobile-fences-wildlife.png` show the new wildlife and a posted fence in staged rendering scenes. `desktop-drawn-fence.png` and `mobile-drawn-fence.png` record actual F-drag placement. `independent-flock-settings.png` shows the flock counters. `compact-pen-detail.png` shows the heavier brown rails. Other screenshots include deliberate poses for rendering checks. Physical mobile devices and Safari have not been verified.
