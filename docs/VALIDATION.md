# Validation

Verified on November 12, 2026.

| Check | Result |
| --- | --- |
| Production build | Strict TypeScript + Vite build passed |
| Simulation tests | 43 passing |
| Browser checks | 29 passing, desktop and mobile Chromium |
| Touch-only desktop check | Intentionally skipped; tested on the mobile project |
| Runtime errors | None observed in browser checks |
| Full-screen character field | Canvas fills the viewport; more than 94% of sampled cell interiors contain ink |
| Local frame samples | 60 FPS at 1440 × 900; 60 FPS at emulated 412 × 839 |

Simulation checks cover local grass consumption, regrowth, tread recovery, grazing movement, greener-patch seeking, food attraction and consumption, food lifetime/cap, commanded movement and arrival, dog repulsion, gentle sleeping-dog avoidance and larger chase radius, an initially full edible map, local brush restoration, persistent cropped state through resizing, ordered recovery with 82–90 second delays and continuous growth, one-third smaller character cells, loose local companions with retained spacing, fresh-patch preference over company, limited nearby bark escape, immediate recasts without cooldowns, sheep speed limits and faster dog movement, a complete rounded outside lap including edge strays and a snug diagonal-flock route, command cancellation, recall and cursor launch, idle sleeping with preserved heading, predictive dog avoidance, wider personal space and stronger overlap correction, empty/maximum sheep counts, pause, resizing an active orbit, and a minute of bounded herding with 36 sheep.

Browser checks cover visible grass and sheep, canvas coverage, left-click movement, Q/E shortcuts, traveling bark rings, immediate recasts, whole-flock W coverage, R recall and cursor launch, right-click food without dog redirection, feeding by F and button, adding/removing sheep, persistence, calling and recalling/releasing the dog, help, pause, reset, hidden UI, resize, reduced motion, touch commands and ability buttons, long-press feeding, and scroll prevention. Head priority was checked with deliberately overlapping sheep. Fresh light green and much darker grazed glyphs were checked separately. Pixel checks verify Pond’s exact charcoal background ([26, 25, 23]), bare ground followed by dots, shoots, blades and mature green glyphs, and no brown flecks. Higher-priority O eyes remain visible over overlapping wool. Space brush checks verify continuous hover strokes, isolated changes, toggle-off behavior and painting while paused. P pauses independently. Idle dogs were advanced to sleep, and their actual z/Z glyph cells were verified. Temporary status copy was checked for overlap with the ability bar. A 90-second simulation verifies visible crop marks without collapse into a single flock. Compact dog feet and tail glyphs are checked outside the body silhouette. The bark ripple is confined to 86 px and vanishes by 1.2 seconds. Navigation checks cover a joined cluster, an occupied destination, sprint-speed collision sweeps, and a dog detouring around a fixed sheep with closer clearance. New cases verify that a sprint stays on one side of a moving sheep, passes through a narrow two-sheep gap, and reaches an occupied target through last-resort overlap. Come By exceeds 180 px/s and measurably reduces flock spread compared with ordinary grazing. Incremental rendering was compared byte-for-byte to a clean full repaint after moving sheep, a dog and bark rings, with no differences. Turn regression checks cover quarter-turns after positive and negative accumulated laps, the actual dog turn across the wrap boundary, and normalization of its heading. Grazing checks verify a full mouth-sized bare patch remains visible after a minute.

The screenshots in this directory are actual captures of the application, inspected during development. The in-app browser was also used directly to call the dog, issue left-click commands and bark.

Raw frame samples are saved in `performance-desktop.json` and `performance-mobile.json`. The default desktop has 36,450 grass cells and 18 sheep. Production JavaScript is approximately 43.6 kB (15.4 kB gzip), with 6.7 kB CSS and a 9.9 kB local font. There are no runtime package dependencies.

These are samples from this computer, not a hardware-independent FPS guarantee. Mobile checks use Chromium emulation; native Safari and physical touch devices remain unverified. The meadow is a local project and has not been deployed.
