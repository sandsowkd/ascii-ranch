# Validation

Verified November 13, 2026.

- Production build passed: strict TypeScript and Vite.
- 62 simulation/navigation tests passed.
- 43 desktop/mobile Chromium browser checks passed; one desktop touch-only case is intentionally skipped.
- Independent sheep/lamb counters, persistence, lamb-only grazing/herding, and reset are covered. Regrow restores all grass immediately, including while paused, without changing animals, food, or simulation time.
- Every exposed right-rail character contains visibly brown pixels at both 1× desktop and 2× mobile rendering resolutions. Rails use a dedicated warm-brown palette and a fractional glyph stroke; post geometry is unchanged.
- The 284 px menu contains independent sheep/lamb counters, Pause, Reset, Regrow, and a compact how-to-play guide. It has no title, close button, dog controls, ability buttons, or F shortcut. The settings icon, outside click, H, and Escape dismiss it; Q/W/E/R retain their keyboard actions.
- Fresh loads show only the ASCII settings button outside the canvas. Flock persistence, pause/reset, food placement, hover regrowth, touch feeding, bird rendering, animal overlap, and recall gate behavior remain covered.
- Local samples: 60 FPS at 1440 × 900 and at emulated 412 × 839. Mobile uses Chromium device emulation.
- Production output: approximately 57.6 kB JavaScript (20.8 kB gzip) and 3.3 kB CSS, with a bundled font and no runtime dependencies.
- README contains two sentences; acknowledgments contain two license links. Full upstream MIT and SIL OFL notices remain intact in `public/licenses/` and the production build.

`independent-flock-settings.png` shows the updated menu and pasture. `compact-pen-detail.png` shows the heavier brown rails. Other screenshots include deliberate poses for rendering checks. Physical mobile devices and Safari have not been verified.
