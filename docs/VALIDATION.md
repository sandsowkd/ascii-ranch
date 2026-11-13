# Validation

Verified November 13, 2026.

- Production build passed: strict TypeScript and Vite.
- 75 simulation/navigation/wildlife tests passed.
- 49 desktop/mobile Chromium browser checks passed; one desktop touch-only case is intentionally skipped.
- Dog marker fix: six focused desktop/mobile browser checks passed, including two new rendering checks covering 48 standing/running poses per device. Floating selection brackets above the coat are removed; visible paws remain underneath at all eight headings. The full browser suite was not rerun for this cosmetic change.
- Independent sheep/lamb counters, persistence, lamb-only grazing/herding, and reset are covered. Regrow restores all grass immediately, including while paused, without changing animals, food, or simulation time.
- Every exposed right-rail character contains visibly brown pixels at both 1× desktop and 2× mobile rendering resolutions. Rails use a dedicated warm-brown palette and a fractional glyph stroke; post geometry is unchanged.
- The 284 px menu contains independent sheep/lamb counters, Pause, Reset, Regrow, and a compact how-to-play guide. It has no title, close button, dog controls, or ability buttons. The settings icon, outside click, H, and Escape dismiss it; Q/W/E/R retain their keyboard actions.
- Sheep move 25% faster under dog pressure and give sleeping dogs an 88 px buffer (scaled on small screens). Normal grazing and bark escape speeds are unchanged.
- Press F once, release it, then left-drag to place one straight fence with a live preview; Backspace undoes the last rail. Sheep and dog routes go around fence ends, including food following, sprint, and W. Collision checks keep bodies and muzzles clear; construction leaves the recall passage free. Reset clears construction.
- New posts accept centered bird landings with both legs visible. Mice have a rounded body, a separate outlined snout, two round ears, two eyes, and a short pink tail. Both ears and eyes remain distinct at eight headings. At most two mice visit at once, with 26–40 seconds between arrivals.
- Every third visitor is a hawk with smaller articulated wings, a bent wrist, rounded secondaries and separate outer feathers. Deep wingbeats alternate with gliding. A hunt makes at least one banked circle, follows a curved controlled descent, briefly extends the talons to grab, then climbs away. Catch is resolved once at the strike, with a 50/50 roll; mice beneath wool remain protected and hawks without exposed prey fly over. Flight reference: [Cornell Lab hawk identification](https://www.allaboutbirds.org/guide/Red-tailed_Hawk/id).
- Fresh loads show only the ASCII settings button outside the canvas. Flock persistence, pause/reset, food placement, hover regrowth, touch feeding, bird rendering, animal overlap, and recall gate behavior remain covered.
- Local samples: 60 FPS at 1440 × 900 and at emulated 412 × 839. Mobile uses Chromium device emulation.
- Production output: approximately 72.9 kB JavaScript (26.0 kB gzip) and 3.3 kB CSS, with a bundled font and no runtime dependencies.
- README contains two sentences; acknowledgments contain two license links. Full upstream MIT and SIL OFL notices remain intact in `public/licenses/` and the production build.

`desktop-dog-paws.png` and `mobile-dog-paws.png` show the dog running at eight headings. `desktop-fences-wildlife.png` and `mobile-fences-wildlife.png` show the new wildlife and a posted fence in staged rendering scenes. `desktop-drawn-fence.png` and `mobile-drawn-fence.png` record actual F-drag placement. `press-f-fence.png` records one-press placement in the native preview; the hawk upstroke/downstroke images show distinct wing poses. `independent-flock-settings.png` shows the flock counters. `compact-pen-detail.png` shows the heavier brown rails. Other screenshots include deliberate poses for rendering checks. Physical mobile devices and Safari have not been verified.
