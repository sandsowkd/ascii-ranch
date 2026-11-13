# Validation

Verified November 13, 2026.

- Production build passed: strict TypeScript and Vite.
- 60 simulation/navigation tests passed.
- 43 desktop/mobile Chromium browser checks passed; one desktop touch-only case is intentionally skipped.
- The rail fix was rechecked with gate movement and incremental rendering after the full browser run.
- Every exposed right-rail character contains visibly brown pixels at both 1× desktop and 2× mobile rendering resolutions. Rails use a dedicated warm-brown palette and a fractional glyph stroke; post geometry is unchanged.
- The 284 px menu contains flock size, four small meadow buttons, and a compact how-to-play guide. It has no title, close button, dog controls, ability buttons, or F shortcut. The settings icon, outside click, H, and Escape dismiss it; Q/W/E/R retain their keyboard actions.
- Fresh loads show only the ASCII settings button outside the canvas. Flock persistence, pause/reset, food placement, hover regrowth, touch feeding, bird rendering, animal overlap, and recall gate behavior remain covered.
- Local samples: 60 FPS at 1440 × 900 and at emulated 412 × 839. Mobile uses Chromium device emulation.
- Production output: approximately 56.9 kB JavaScript (20.6 kB gzip) and 3.4 kB CSS, with a bundled font and no runtime dependencies.
- README contains two sentences; acknowledgments contain two license links. Full upstream MIT and SIL OFL notices remain intact in `public/licenses/` and the production build.

`compact-settings.png` shows the menu and pen. `compact-pen-detail.png` shows the heavier brown rails. Other screenshots include deliberate poses for rendering checks. Physical mobile devices and Safari have not been verified.
