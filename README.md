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
| **Q** | **Bark** | A thin, broken ripple appears immediately outside the dog and crosses the entire field in 0.55 seconds, fading by 0.67 seconds. Sheep and lambs start their short, roughly 100 px escape only as the visible wave touches their bodies; each wave nudges an animal once. Recasting creates a new wave. |
| **W** | **Come By** | The dog joins a rounded, padded convex outline of **every** sheep, including edge strays, then makes a full lap. Curved ends and a short look-ahead avoid empty rectangular corners. The faster pass applies inward herding pressure only while W is active. The outline updates as the sheep move. |
| **E** | **Sprint** | A short sprint toward its current destination. When idle, the dog sprints toward the cursor. |
| **R** | **Recall / Release** | First press: return to the small fenced pen in the bottom-right corner. Next press: sprint all the way to the cursor, with no click required. The second press also works while the dog is on its way home. |

The bottom-right dog button calls the dog, then offers the same recall/release action as R. An idle dog dozes after seven seconds and releases drifting `z`/`Z` glyphs. Movement or an ability wakes it immediately. A sleeping dog keeps a gentle 56 px personal-space radius. A moving dog influences a wider 172 px radius (205 px during a sprint), and sheep anticipate its approach about half a second ahead. An awake stationary dog keeps a smaller 92 px zone. A recalled dog rests inside its pen. On arrival the dog keeps its last heading, including when it falls asleep. Heading updates use the signed shortest angle and stay normalized, so repeated Come By laps never produce a 270-degree turn at a 90-degree corner.

## Feeding and other controls

| Control | Effect |
| --- | --- |
| **Right-click** | Drop a handful of feed without moving the dog |
| **F** or **feed +**, then click / tap | Place feed, including on touch screens |
| **Left-click** | Move the dog; hold to keep updating its target |
| Touch: tap / hold | Tap to move the dog; hold and release to feed, or use feed + |
| **+ / −** in the bottom-right | Add or remove one adult sheep, from 0 to 80; lambs accompany every six adults |
| **Space** or **[ grow ]** | Toggle the regrow brush; hover to restore grass, without clicking |
| **P** or **pause** | Pause / resume the entire meadow |
| **start again** | Fresh grass and sheep with the current count |
| **H** | Hide / show the interface |
| **Escape** | Close help, cancel feed or regrow placement, show the interface |
| **[ ? ]** | Open the compact control guide |

Food is shared and slowly consumed, with up to ten handfuls lasting up to 120 seconds. The sheep count persists in localStorage; the app works if storage is blocked. All other simulation state is temporary.

## A gentler pace

Ordinary sheep walk at 7–10.5 CSS pixels per second. Food attracts them at about 1.35 times that pace. Being chased raises their speed modestly, with a 26 px/s cap. A bark briefly allows up to 46 px/s, toward a nearby escape destination rather than a screen edge.

The dog walks at 116 px/s, circles at 210 px/s, sprints with E at 248 px/s, and launches from recall at 270 px/s. These speeds scale down on smaller screens. Grazing is about one-third slower than the previous version, with a broad center to each bite so sheep leave a clear mouth-sized eaten patch. Cutting down a plant leaves a lasting trail as sheep move toward fresh grass.

## A living pasture

Every visible grass cell starts fully grown and edible. As sheep graze, a cut plant becomes bare charcoal ground, then gradually recovers through dark green `.`, brighter `:`, upright `!`/`;` shoots, leafy `v`/`/`/`\` grass and mature grass. Brightness increases within each stage. There are no brown flecks, roads or permanent bare patches.

A freshly cropped cell rests for 105–114 seconds, using stable per-cell variation of at most nine seconds. After that, growth advances continuously at 0.0014 per second. Earlier-eaten patches normally recover first, so grazing history stays visible. Full recovery takes about fourteen minutes; young shoots are left alone until they reach edible maturity. Space still toggles an immediate regrow brush, including while paused.

Each sheep occasionally chooses zero, one or two nearby companions for 24–49 seconds. Their presence gives fresh grazing destinations a small preference, without a shared herd magnet. Sheep compare entire grass patches, travel distance, crowding and dog pressure; good fresh grass outweighs company. This supports loosely changing pairs and trios and independent grazers. They search farther when nearby ground is depleted.

Sheep retain different sizes, speed, courage, wool texture and grazing rhythms. Soft personal space and positional correction reduce piling up while allowing a little wool overlap. Heads and ears keep rendering priority over other bodies. Moving dogs trigger an earlier, predictive response; sleeping dogs keep a gentle local space. Food and bark interrupt ordinary grazing. The dog has two short visible paw strokes that point vertically downward beneath the rotated coat at every heading, a compact collie face and a wider tail wag. Sheep and lambs also keep their paws beneath the wool. Only small paw tips peek below the bodies while walking, rather than long legs extending sideways. Animals cast no ground shadows and do not flatten or darken surrounding grass; only grazing changes the pasture. Movement commits to a chosen route for about a second and blends steering, so shifting sheep do not cause left-right zigzags during E. Smaller clearance zones allow the dog to brush wool. It prefers a clear detour, uses a tighter gap when that avoids a wide detour, and permits overlap only when a clear or tight route cannot reach the destination or the dog is stuck. Occupied destinations can be reached without repeatedly bouncing off the sheep. Nearby sheep still anticipate the dog's approach during acceleration. Sheep use wider personal space and three separation passes, with a 50 px minimum center distance for average-size sheep.


The field uses ASCII Pond’s exact warm charcoal `#1a1917` (`DARK.page: [26, 25, 23]` in `src/pond.js`): only ASCII characters carry color, with no colored tile backgrounds on terrain or animals. Reinspection of ASCII Pond's `src/koi.js` supplied the exact `t%SX8@#` density ramp, with `#` densest. The bundled Geist Mono font, small character grid, restrained colors and local glyph textures carry its influence forward. The character grid and font are one-third smaller in both dimensions, giving each animal about 2.25 times as many character cells without shrinking its silhouette. Wool uses bright cream density glyphs and small paws tucked beneath the body. Faces and ears are 20% smaller than the previous version. Dark charcoal faces retain a continuous, bright white outline that follows the whole face and both larger, closed, floppy ears. A heavier outline font keeps the contour visible at the small character size. A woolly forelock, bright uppercase `O` eyes, paired nostrils and a split `Y` lip complete the head; faces keep priority over overlapping wool. The smaller collie has copper glyphs and a pale chest. The open recall pen uses ASCII rails and posts. No animal images, SVG sprites or emoji are used.

## Little families and visitors

Each six adult sheep bring one lamb: the default meadow has 18 adults and 3 lambs. Lambs are roughly half adult size, nibble smaller patches more slowly, and choose grazing spots near their own adult. They catch up when separated and respond to the same dog, bark and herding controls. Adding or removing adults adjusts the lamb count automatically; the flock caption shows the number of lambs. The adult counter and saved population keep their existing meaning.

Small turquoise, coral and gold birds occasionally fly into the field, settle on fresh open grass, rest for a few seconds, and fly away. Broad, filled wings flap in flight. On the ground, a stable side profile shows the head and beak above a folded wing, with a tail and two feet; character rows align to the grid so the head and body cannot collapse together. Landing sites must clear sheep, lambs, other birds and the dog. Birds reserve a site and re-check it during approach, choosing another if it becomes occupied; they leave if no safe site exists. Sheep choose grazing patches away from these sites and gently steer around resting birds. A nearby dog, bark, or accidental contact from a sheep’s body or muzzle sends the bird airborne early. The first visit starts after about five seconds, subsequent visits are spaced 17–30 seconds apart, and no more than three birds visit at once. Pause, reset and resize include both lambs and birds.

## Implementation

```text
src/
  simulation/Pasture.ts   retained grass, consumption and staged regrowth
  simulation/World.ts    adults, lamb families, food, movement and ability clocks
  simulation/Birds.ts    occasional bird visits, landing and takeoff
  simulation/bark.ts     shared wavefront timing for rendering and animal contact
  simulation/navigation.ts  obstacle-aware paths and continuous collision checks
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
