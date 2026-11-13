# Attribution

## ASCII Pond

This companion to ASCII Flock continues the visual approach and reused building blocks from [stqfdyr/ascii-pond](https://github.com/stqfdyr/ascii-pond), inspected at commit `b52e6e45a36247c1b6afa87859b1b87c6d596217` during development of ASCII Flock.

- `src/vendor/pond-math.ts` retains typed adaptations of `clamp`, `smoothstep`, `hash3`, `valueNoise` and `lineGlyph` from Pond's `src/util.js`.
- Character cells, small monospace typography, tangent-oriented ASCII rings and the restrained interface continue the source's rendering approach. The exact `t%SX8@#` density ramp comes from `src/koi.js` (`TILE_GLYPHS`). The latest version deliberately renders only colored glyphs on black, omitting the optional tile backgrounds found in the source.
- The Geist Mono font is the exact bundled font from the Pond repository.

ASCII Pond is MIT licensed, Copyright (c) 2026 stqfdyr. The complete notice is included in [public/licenses/ascii-pond-MIT.txt](public/licenses/ascii-pond-MIT.txt) and copied into `dist/licenses/` by Vite.

## Geist Mono

Geist Mono by Vercel is under the SIL Open Font License 1.1. Its complete copyright and license text is included in [public/licenses/Geist-Mono.txt](public/licenses/Geist-Mono.txt), alongside the bundled font and in the production output.

## New implementation

The grass ecology, terrain, sheep and dog characters, movement, grazing, feeding, ability behavior, gesture handling and interface are new for ASCII Meadow. No League of Legends assets, names, artwork or code are included; the user's reference informs the point-and-click movement and Q/W/E/R action convention.
