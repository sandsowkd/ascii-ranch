# Validation

Verified on November 12, 2026.

| Check | Result |
| --- | --- |
| Production build | Strict TypeScript + Vite build passed |
| Simulation tests | 17 passing |
| Browser checks | 13 passing, desktop and mobile Chromium |
| Touch-only desktop check | Intentionally skipped; tested on the mobile project |
| Runtime errors | None observed in browser checks |
| Full-screen character field | Canvas fills the viewport; more than 96% of sampled cell interiors contain ink |
| Local frame samples | 60 FPS at 1440 × 900 and emulated 412 × 839 |

Simulation checks cover local grass consumption, regrowth, tread recovery, grazing movement, greener-patch seeking, food attraction and consumption, food lifetime/cap, commanded movement and arrival, dog repulsion, traveling bark impulses, cooldowns, sprint speed, circling and command cancellation, gathering and ability duration, empty/maximum sheep counts, pause, resizing an active orbit, and a minute of bounded herding with 36 sheep.

Browser checks cover visible grass and sheep, canvas coverage, right-click movement, Q/E shortcuts, traveling bark rings, cooldown buttons, W/R orbit state and movement, canceling an orbit with a new command, feeding by F and button, adding/removing sheep, persistence, calling/sending home the dog, help, pause, reset, hidden UI, resize, reduced motion, touch commands and ability buttons, long-press feeding, and scroll prevention. Cooldown text and temporary status copy were checked for overlap with the ability bar.

The screenshots in this directory are actual captures of the application, inspected during development. The in-app browser was also used directly to call the dog, issue right-click commands and bark.

Raw frame samples are saved in `performance-desktop.json` and `performance-mobile.json`. The default desktop has 16,200 grass cells and 18 sheep. Production JavaScript is approximately 28.7 kB (10.6 kB gzip), with 6.5 kB CSS and a 9.9 kB local font. There are no runtime package dependencies.

These are samples from this computer, not a hardware-independent FPS guarantee. Mobile checks use Chromium emulation; native Safari and physical touch devices remain unverified. The meadow is a local project and has not been deployed.
