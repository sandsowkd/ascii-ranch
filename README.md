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

**Left-click to move the dog. Right-click to drop feed.** A food click never calls or redirects the dog. Hold the left mouse button to keep updating the destination. A small green mark shows the command. Movement interrupts automatic circling or recall.

All four actions can be used again immediately: **there are no cooldowns**.

| Key | Ability | What happens |
| --- | --- | --- |
| **Q** | **Bark** | Nearby sheep within 300 px move about two body lengths (roughly 100 px) away over 2.4 seconds. Distant sheep keep grazing. ASCII rings carry the bark; recasting gives another short nudge. |
| **W** | **Come By** | The dog joins a rounded, padded convex outline of **every** sheep, including edge strays, then makes a full lap. Curved ends and a short look-ahead avoid empty rectangular corners. The outline updates as the sheep move. |
| **E** | **Sprint** | A short sprint toward its current destination. When idle, the dog sprints toward the cursor. |
| **R** | **Recall / Release** | First press: return to the small fenced pen in the bottom-right corner. Next press: sprint all the way to the cursor, with no click required. The second press also works while the dog is on its way home. |

The bottom-right dog button calls the dog, then offers the same recall/release action as R. An idle dog dozes after seven seconds and releases drifting `z`/`Z` glyphs. Movement or an ability wakes it immediately. A sleeping dog keeps a gentle 56 px personal-space radius. A moving dog influences a wider 172 px radius (205 px during a sprint), and sheep anticipate its approach about half a second ahead. An awake stationary dog keeps a smaller 92 px zone. A recalled dog rests inside its pen. On arrival the dog keeps its last heading, including when it falls asleep.

## Feeding and other controls

| Control | Effect |
| --- | --- |
| **Right-click** | Drop a handful of feed without moving the dog |
| **F** or **feed +**, then click / tap | Place feed, including on touch screens |
| **Left-click** | Move the dog; hold to keep updating its target |
| Touch: tap / hold | Tap to move the dog; hold and release to feed, or use feed + |
| **+ / −** in the bottom-right | Add or remove one sheep, from 0 to 80 |
| **Space** or **[ grow ]** | Toggle the regrow brush; hover to restore grass, without clicking |
| **P** or **pause** | Pause / resume the entire meadow |
| **start again** | Fresh grass and sheep with the current count |
| **H** | Hide / show the interface |
| **Escape** | Close help, cancel feed or regrow placement, show the interface |
| **[ ? ]** | Open the compact control guide |

Food is shared and slowly consumed, with up to ten handfuls lasting up to 120 seconds. The sheep count persists in localStorage; the app works if storage is blocked. All other simulation state is temporary.

## A gentler pace

Ordinary sheep walk at 8–13 CSS pixels per second. Food attracts them at about 1.35 times that pace. Being chased raises their speed modestly, with a 26 px/s cap. A bark briefly allows up to 46 px/s, toward a nearby escape destination rather than a screen edge.

The dog walks at 108 px/s, circles at 138 px/s, sprints with E at 235 px/s, and launches from recall at 255 px/s. These speeds scale down on smaller screens. Grazing keeps a slow bite rate. Cutting down a plant leaves a visible patch, so sheep move toward fresh grass.

## A living pasture

Every visible grass cell starts fully grown and edible. As sheep graze, a cut plant becomes bare charcoal ground, then gradually recovers through dots, low shoots, short blades, young grass and mature grass. Brightness increases within each stage. There are no brown flecks, roads or permanent bare patches.

A freshly cropped cell rests for 32–38 seconds, using stable per-cell variation of at most six seconds. After that, growth advances continuously at 0.0032 per second. Earlier-eaten patches normally recover first, so grazing history stays visible. Full recovery takes about five to six minutes; young shoots are left alone until they reach edible maturity. Space still toggles an immediate regrow brush, including while paused.

Each sheep occasionally chooses zero, one or two nearby companions for 24–49 seconds. Their presence gives fresh grazing destinations a small preference, without a shared herd magnet. Sheep compare entire grass patches, travel distance, crowding and dog pressure; good fresh grass outweighs company. This supports loosely changing pairs and trios and independent grazers. They search farther when nearby ground is depleted.

Sheep retain different sizes, speed, courage, wool texture and grazing rhythms. Soft personal space and positional correction reduce piling up while allowing a little wool overlap. Heads and ears keep rendering priority over other bodies. Moving dogs trigger an earlier, predictive response; sleeping dogs keep a gentle local space. Food and bark interrupt ordinary grazing. The dog's extended, articulated legs and brighter tail tip make its running gait clearer.


The field uses ASCII Pond’s exact warm charcoal `#1a1917` (`DARK.page: [26, 25, 23]` in `src/pond.js`): only ASCII characters carry color, with no colored tile backgrounds on terrain or animals. Reinspection of ASCII Pond's `src/koi.js` supplied the exact `t%SX8@#` density ramp, with `#` densest. The bundled Geist Mono font, small character grid, restrained colors and local glyph textures carry its influence forward. The character grid and font are one-third smaller in both dimensions, giving each animal about 2.25 times as many character cells without shrinking its silhouette. Wool uses bright cream density glyphs and little legs. Enlarged outlined oval faces have two bright `O` eyes, separate ears, a nose and a mouth; faces keep priority over overlapping wool. The smaller collie has copper glyphs and a pale chest. The open recall pen uses ASCII rails and posts. No animal images, SVG sprites or emoji are used.

## Implementation

```text
src/
  simulation/Pasture.ts   retained grass, consumption, regrowth and trampled paths
  simulation/World.ts    sheep, food, movement, local companions and ability clocks
  simulation/route.ts    rounded flock envelopes and perimeter navigation
  engine/grass.ts        gradual grass glyph and color stages
  engine/Renderer.ts     cached glyph atlas, grass, sheep, collie, rings and markers
  interaction/Controller.ts  pointer/touch, shortcuts, ability UI and flock controls
  vendor/pond-math.ts    attributed helpers reused from ASCII Pond
  main.ts               fixed-step loop, resize and visibility handling
```

Physics runs at 60 fixed steps per second, with bounded catch-up. Typed arrays store the pasture. A device-pixel-aware atlas caches characters and colors. The renderer retains unchanged glyph pixels and repaints only changed cells, with device-aligned edges so moving figures leave no rendering trails. The app stops drawing in a hidden tab and starts paused when reduced motion is requested. Resize preserves grass and creature state, including an active outside lap or recall destination.

## Verification and limits

The project includes simulation tests and desktop/mobile Chromium browser tests. See [docs/VALIDATION.md](docs/VALIDATION.md) for results and frame samples. Screenshots are real browser captures.

Herding is a gentle simulation, not a professional livestock model. At high populations sheep can crowd, especially in a small viewport. Movement is continuous, while the glyph silhouettes occupy discrete grid cells. Physical mobile devices and Safari have not been tested; mobile validation uses Chromium device emulation. Bark is visual and does not play audio. The project remains local and has not been deployed.

## Attribution

See [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md). ASCII Pond's MIT notice and the Geist Mono SIL OFL license are included with the source and production build.
