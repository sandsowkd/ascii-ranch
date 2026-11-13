# Validation

Verified on November 12, 2026.

| Check | Result |
| --- | --- |
| Production build | Strict TypeScript + Vite build passed |
| Simulation tests | 23 passing |
| Browser checks | 21 passing, desktop and mobile Chromium |
| Touch-only desktop check | Intentionally skipped; tested on the mobile project |
| Runtime errors | None observed in browser checks |
| Full-screen character field | Canvas fills the viewport; more than 94% of sampled cell interiors contain ink |
| Local frame samples | 60 FPS at 1440 × 900; 60 FPS at emulated 412 × 839 |

Simulation checks cover local grass consumption, regrowth, tread recovery, grazing movement, greener-patch seeking, food attraction and consumption, food lifetime/cap, commanded movement and arrival, dog repulsion, gentle sleeping-dog avoidance and larger chase radius, an initially full edible map, local brush restoration, flock-wide bark escape, immediate recasts without cooldowns, slower speed limits, a complete outside lap including edge strays, command cancellation, recall and cursor launch, idle sleeping, soft overlap correction, empty/maximum sheep counts, pause, resizing an active orbit, and a minute of bounded herding with 36 sheep.

Browser checks cover visible grass and sheep, canvas coverage, left-click movement, Q/E shortcuts, traveling bark rings, immediate recasts, whole-flock W coverage, R recall and cursor launch, right-click food without dog redirection, feeding by F and button, adding/removing sheep, persistence, calling and recalling/releasing the dog, help, pause, reset, hidden UI, resize, reduced motion, touch commands and ability buttons, long-press feeding, and scroll prevention. Head priority was checked with deliberately overlapping sheep. Fresh light green and much darker grazed glyphs were checked separately. Pixel checks verify a pure black background, no fresh brown cells, and fewer than 7% scattered brown accents in depleted terrain. Space brush checks verify continuous hover strokes, isolated changes, toggle-off behavior and painting while paused. P pauses independently. Idle dogs were advanced to sleep, and their actual z/Z glyph cells were verified. Temporary status copy was checked for overlap with the ability bar.

The screenshots in this directory are actual captures of the application, inspected during development. The in-app browser was also used directly to call the dog, issue left-click commands and bark.

Raw frame samples are saved in `performance-desktop.json` and `performance-mobile.json`. The default desktop has 16,200 grass cells and 18 sheep. Production JavaScript is approximately 33 kB (11.7 kB gzip), with 6.7 kB CSS and a 9.9 kB local font. There are no runtime package dependencies.

These are samples from this computer, not a hardware-independent FPS guarantee. Mobile checks use Chromium emulation; native Safari and physical touch devices remain unverified. The meadow is a local project and has not been deployed.
