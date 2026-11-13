# ASCII Meadow

A little room to roam. A full-screen meadow of grass, clover, tiny flowers and sheep, drawn entirely with ASCII glyphs. Sheep graze, leave eaten patches, move on to greener grass and follow scattered feed. Call a small sheepdog and guide the flock with point-and-click movement and four abilities.

![ASCII Meadow](docs/desktop.png)

## Run

```sh
npm install
npm run dev
```

Run these from this directory. Open the Vite URL, normally `http://127.0.0.1:5176`. Node 22 LTS or 24+ is recommended. The app uses TypeScript, Vite and Canvas 2D, with zero runtime dependencies. It has no server, accounts, external assets, React or WebGL. The font is bundled locally.

```sh
npm run test          # deterministic simulation tests
npm run test:browser  # desktop and mobile Playwright checks
npm run build        # strict TypeScript check + production output in dist/
npm run preview      # serve production output on port 4176
```

If Playwright's browser is missing, run `npx playwright install chromium` once. Browser tests expect this project on port 5176.

## Sheepdog controls

**Right-click a spot and the dog runs there.** Left-click and touch taps also work. Hold the right mouse button to keep updating its destination. The dog does not teleport. A small green command mark shows the destination. Clicking a new destination interrupts an automatic circling action. You can also drag the dog directly.

The four actions work through keyboard shortcuts and the small on-screen buttons:

| Key | Ability | What happens | Cooldown |
| --- | --- | --- | --- |
| **Q** | **Bark** | Two expanding ASCII rings travel from the dog. Sheep reached by the sound get an outward push. | 2.8 s |
| **W** | **Come By** | The dog circles the flock for 3.6 seconds, gathering distant sheep toward the group. | 7 s |
| **E** | **Sprint** | The dog races toward its destination for 0.85 seconds, with stronger herding pressure. When idle, it sprints toward the cursor. | 5 s |
| **R** | **Hold the Flock** | For six seconds the dog circles the flock's current location and keeps gathering sheep inward. | 16 s |

Casting an ability or clicking the meadow calls the dog if it is not already present. The bottom-right button can call the dog or send it home. Ability buttons show cooldowns and highlight active actions. Movement overrides W/R while their cooldowns continue to expire.

## Feeding and other controls

| Control | Effect |
| --- | --- |
| **F**, then click / tap | Place a handful of feed |
| **feed +** button, then click / tap | Place feed using the mouse or touch |
| Hold an empty patch on a touch screen | Drop feed on release after 450 ms |
| **+ / −** in the bottom-right | Add or remove one sheep, from 0 to 80 |
| **Space** or **pause** | Pause / resume the entire meadow |
| **start again** | Fresh grass and sheep with the current count |
| **H** | Hide / show the interface |
| **Escape** | Close help, cancel feed placement, show the interface |
| **[ ? ]** | Open the compact control guide |

Feeding uses F because right-click is reserved for dog movement. Food has a finite quantity, is shared and consumed by sheep, and expires after 80 seconds. Up to ten handfuls can exist at once. The sheep count persists in localStorage; the app works if storage is blocked. All other simulation state is temporary.

## A living pasture

Each visible character belongs to a grass tile. Tiles store grass quantity, a local growth capacity, soil, wildflowers and temporary flattening. Sheep eat nearby tiles while grazing; short grass becomes punctuation and bare earth. They periodically choose a new patch by comparing nearby grass quality and crowding. Grass slowly regrows toward the local capacity over roughly one to two minutes, and flattened blades recover over a few seconds. Slow wind bends longer grass without random per-frame flickering. A winding path and darker/lighter clover patches come from seeded procedural terrain.

Sheep have different sizes, speed, courage, wool texture and grazing rhythms. Separation keeps them from piling up. A nearby dog interrupts grazing and pushes sheep away; neighbors share some of that movement. Bark adds a local traveling impulse. Come By and Hold the Flock combine an actual orbiting dog with a gentle inward steering cue, so the gathering effect is reliable while remaining calm.

The visual style carries forward ASCII Pond's bundled Geist Mono, small character grid, inset glyph tiles and restrained colors. Wool is rasterized as a softly shaded oval of cream tiles with body-anchored glyphs, dark faces, ears, tails and little moving legs. The smaller collie has a copper coat and pale chest. Everything is Canvas text and character tiles; no animal images, SVG sprites or emoji are used.

## Implementation

```text
src/
  simulation/Pasture.ts   retained grass, consumption, regrowth and trampled paths
  simulation/World.ts    sheep, food, movement, herding and ability clocks
  engine/Renderer.ts     cached glyph atlas, grass, sheep, collie, rings and markers
  interaction/Controller.ts  pointer/touch, shortcuts, cooldown UI and flock controls
  vendor/pond-math.ts    attributed helpers reused from ASCII Pond
  main.ts               fixed-step loop, resize and visibility handling
```

Physics runs at 60 fixed steps per second, with bounded catch-up. Typed arrays store the pasture. A device-pixel-aware atlas caches characters and colors. The app stops drawing in a hidden tab and starts paused when reduced motion is requested. Resize preserves grass and creature state, including the anchor of an active herding orbit.

## Verification and limits

The project includes simulation tests and desktop/mobile Chromium browser tests. See [docs/VALIDATION.md](docs/VALIDATION.md) for results and frame samples. Screenshots are real browser captures.

Herding is a gentle simulation, not a professional livestock model. The circling abilities include an explicit gathering cue. At high populations sheep can crowd, especially in a small viewport. Movement is continuous, while the glyph silhouettes occupy discrete grid cells. Physical mobile devices and Safari have not been tested; mobile validation uses Chromium device emulation. Bark is visual and does not play audio. The project remains local and has not been deployed.

## Attribution

See [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md). ASCII Pond's MIT notice and the Geist Mono SIL OFL license are included with the source and production build.
