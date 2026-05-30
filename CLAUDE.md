# CLAUDE.md

Agent guide for `sheet-poc`. Read this first.

## What this is
Pixel-art game-asset tooling on the **PixelLab API** + **Excalibur.js 0.30.3**:
sprite sheets, maps, tilesets, a walkable top-down scene with collision, and a
browser editor (`app/`) for placing assets and generating collision.

## Two build systems
- **Root** — TypeScript run directly with `tsx`. CLIs in `src/*-cli.ts`, exposed as
  npm scripts: `gen`, `map`, `buildmap`, `assets`, `tileset`. Tests: `npm test`
  (vitest). Typecheck: `npm run typecheck`.
- **`app/`** — a **Vite** web app with Excalibur as an npm dependency. Run from
  inside `app/`: `npm run dev` / `npm run build` (`tsc --noEmit && vite build`).
  It imports pure logic from the root via `../../src/core/*.js`.

## Directory map
- `src/core/` — **pure, browser-safe** logic (no `node:`/`sharp`/`fs`). Footprint
  math, collision model, manifest + project zod schemas. **Imported by both the CLIs
  and the `app/`.** A vitest guard (`tests/core/no-node-imports.test.ts`) fails if a
  Node import leaks in here — keep it pure.
- `src/sheet/` — **Node-only imaging** (`sharp`): spritesheet pack, mask PNGs,
  transparency/flood-fill.
- `src/pixellab/` — PixelLab API wrappers (one file per endpoint). See
  `docs/pixellab-notes.md` for endpoint quirks.
- `src/buildmap/` — the `buildmap` world builder, split into `spec.ts` (zod schema +
  helpers), `build-sprite.ts`, `build-inpaint.ts`. `src/buildmap-cli.ts` is the thin
  orchestrator.
- `src/game|editor|preview/` — HTML emitters; each `template.html` pulls Excalibur
  from esm.sh.
- `app/` — the Vite editor (see its own scenes/store/exporters).
- `examples/` — sample CLI specs. `output/` — generated artifacts (gitignored).

## Key invariants (don't break these)
- **`src/core/` stays Node-free.** The browser app bundles it. No `sharp`, no `fs`,
  no `node:*`. The guard test enforces this.
- **Movement & collision** in the game/play scenes is **manual in `preupdate`**
  (velocity stays zero; test the target position per axis before committing). Using
  Excalibur velocity + post-update reverts does **not** collide reliably.
- **Collision model** is a **base-footprint ellipse** at each asset's feet
  (`footprintEllipse`), combined with **y-sort** (`z = feetY`) so the character walks
  behind tall props. Same `src/core/` math is rasterized by `sharp` (CLI) and
  `<canvas>` (app).
- **PixelLab caps:** pixflux ≤ 400px, inpaint ≤ 200px, `text_guidance_scale` ≤ 10
  (use 8). Characters need `removeFlatBackground` (baked gray `(128,128,128)`).

## Working offline
`buildmap` caches each result by spec hash under `output/buildmap/.cache/`, so
re-running an unchanged spec needs no `PIXELLAB_API_KEY`. Use this to verify changes
without spending credits.

## More
- `docs/pixellab-notes.md` — full PixelLab API behavior.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design + plan history.
