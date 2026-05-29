# Asset Map + Collision Editor — Design

**Date:** 2026-05-29
**Status:** Approved (pending spec review)

## Purpose

A browser application that lets a user place **pre-defined assets** onto a loaded
**base map**, automatically **generate collision** from those assets, **play-test**
the result by walking a character, and **export** the map, collision, and a
re-loadable project.

It is the interactive evolution of the existing `buildmap` CLI: same
base-footprint collision and y-sort ideas, but driven by direct manipulation in
the browser instead of a JSON spec.

## Decisions (from brainstorming)

- **Asset source:** a fixed library pre-generated with PixelLab (tree, rock,
  pond, bush, etc.), saved as PNGs + a manifest. No PixelLab calls while editing.
- **Map background:** the user loads a base map image (e.g. one made with
  `npm run map`, or any PNG).
- **Editing actions:** place / move / delete only. No rotate, scale, or snap.
- **Outputs (all four):** collision data (JSON + mask PNG), composited map PNG,
  re-loadable project file, and in-app play-test.
- **Platform:** a Vite-served web app (Excalibur as an npm dependency), vanilla
  TypeScript, single Excalibur canvas with two scenes (Edit / Play) and a DOM
  palette + toolbar.

## Architecture

One Excalibur `Engine` hosts two `Scene`s — **Edit** and **Play** — switched by a
toolbar toggle. The palette and toolbar are plain HTML/CSS positioned around the
canvas. State (loaded base map, placements) lives in a small in-memory store and
persists to/from a project JSON.

### Project layout

```
app/                        # Vite web app
  index.html
  vite.config.ts
  public/
    assets/                 # pre-generated library: *.png + manifest.json
    character/              # bundled knight spritesheet (+ manifest) for play-test
  src/
    main.ts                 # bootstraps Engine + scenes + UI wiring + store
    assets.ts               # load + validate manifest, load images
    store.ts                # in-memory state: baseMap, mapW/H, placements[], selection
    editor-scene.ts         # Edit: place/move/delete, y-sort preview, collision overlay
    play-scene.ts           # Play: walk character, reuse movement + collision sampling
    palette.ts              # DOM palette UI (asset thumbnails -> active asset)
    toolbar.ts              # DOM toolbar (load map, mode toggle, export buttons)
    collision-canvas.ts     # rasterize collision ellipses to a <canvas> -> mask PNG blob
    exporters.ts            # collision JSON+PNG, composited PNG, project JSON downloads
    project.ts              # (de)serialize a re-loadable project

src/                        # existing CLI code (Node)
  sheet/footprint.ts        # NEW pure module: rect + footprint -> ellipse params
  asset-lib-cli.ts          # NEW: `npm run assets` — PixelLab gen -> app/public/assets/
  buildmap-cli.ts           # refactored to import sheet/footprint.ts (shared math)
```

### Key boundary: shared, Node-free footprint math

`src/sheet/footprint.ts` is **pure TypeScript with no Node imports** so Vite can
bundle it into the browser. It exposes the footprint→ellipse computation:

```ts
export type Ellipse = { cx: number; cy: number; rx: number; ry: number };
export function footprintEllipse(rect: {x:number;y:number;w:number;h:number}, footprint: number): Ellipse;
export function pointInEllipse(e: Ellipse, x: number, y: number): boolean;
```

- The **CLI** rasterizes these ellipses with `sharp` (Node).
- The **app** rasterizes the identical ellipses to a `<canvas>` (browser).

Same math, two renderers → collision is consistent across CLI and app, and the
math is unit-tested once. `buildmap-cli.ts` is refactored to use this module so
there is a single source of truth.

## Asset library

Generated once by `npm run assets` (`src/asset-lib-cli.ts`), which reuses
`pixellab/object.ts` (transparent-sprite generation) and the existing
content-trim + gray-backdrop removal. Output goes to `app/public/assets/`:

```json
{
  "assets": [
    { "id": "oak-tree", "name": "Oak Tree", "file": "oak-tree.png", "footprint": 0.3, "w": 48, "h": 56 },
    { "id": "pond",     "name": "Pond",     "file": "pond.png",     "footprint": 1.0, "w": 64, "h": 52 }
  ]
}
```

- `footprint` — base-collision fraction (flat props like water = 1.0; tall props ≈ 0.3).
- `w`/`h` — natural placement size in map pixels (the trimmed content size).

The set of assets to generate is defined by a small spec list inside
`asset-lib-cli.ts` (prompt + footprint per asset). The manifest is validated with
zod when loaded by the app.

## Data model

```ts
type Placement = { assetId: string; x: number; y: number }; // (x,y) = feet (bottom-center), map coords

type Project = {
  baseMap: string;   // data URL (embedded so the project is self-contained)
  mapW: number;
  mapH: number;
  placements: Placement[];
};
```

## Edit mode

- **Load base map:** file picker → read PNG → set `mapW/mapH` to image dims, draw
  as background actor at `z = -100000`.
- **Palette:** thumbnails from the manifest; clicking sets the active asset.
- **Place:** click the map → append a `Placement` at the cursor; create an actor
  anchored bottom-center at the feet, `z = feetY` (y-sorts with other placements).
- **Select / move / delete:** click a placed asset to select (outline); drag to
  move (updates its `Placement`); `Delete`/`Backspace` removes it.
- **Camera:** mouse wheel zooms; pan via middle-drag (or hold-space + drag) for
  maps larger than the viewport.
- **Collision overlay:** a toggle that draws the live footprint ellipses in
  translucent red, so the user sees the collision being generated.

## Collision generation

Each `Placement` → an ellipse via `footprintEllipse({x: feetX - w/2, y: feetY - h, w, h}, footprint)`
(rect reconstructed from feet + asset `w/h`). Used three ways:

1. **Live overlay** in Edit mode (drawn each frame on the toggle).
2. **Play-test sampling** — the Play scene samples "is this world point solid?" by
   testing the point against all ellipses (or against a rasterized mask; ellipse
   test is simplest and exact).
3. **Export** — rasterized to a black/white mask PNG via `<canvas>` (white =
   blocked), plus a JSON of placements + resolved colliders.

## Play-test mode

Toggle Edit → Play. Spawn the bundled knight at a free spot. Reuse the proven
movement model from the game template: move the player manually in the engine
`preupdate` (velocity zero, order-independent), test the target position per axis
against the collision (ellipse test), and y-sort the character (`z = feetY`)
against the placed assets so it walks behind tall props. Toggle back to Edit;
placements persist in the store.

## Exports (toolbar, client-side blob downloads)

1. **Collision** → `collision.json` (`{ mapW, mapH, placements, colliders }`) +
   `collision.png` (black/white mask).
2. **Composited map** → `map-composited.png` (base + all assets flattened, drawn
   to a `<canvas>` at map resolution).
3. **Project** → `project.json` (re-loadable; base map embedded as data URL).
4. **Load project** → the same file picker accepts `project.json` and restores
   base map + placements.

## Testing

- **Unit (vitest, Node):**
  - `footprint.ts` — ellipse params for representative rects/footprints; point-in-ellipse.
  - manifest parse/validate (zod) — accepts valid, rejects malformed.
  - project round-trip — serialize → deserialize yields the same placements/dims.
  - collision JSON generation — placements → expected colliders.
- **Headless collision sim** (Node, no browser): drive a virtual player into
  colliders and assert blocking + free movement, as done for the game scene.
- **Manual:** canvas rendering, drag UX, and play-test feel — verified by running
  the Vite dev server and opening the app.

## Scope guardrails (YAGNI — explicitly out)

No rotate / scale / snap-to-grid, no layers, no undo/redo, single play-test
character, fixed pre-generated asset library (no in-app generation). These can be
added later without reworking the core.

## Reuse / refactor notes

- Extract footprint math from `buildmap-cli.ts` into `src/sheet/footprint.ts`;
  `buildmap` imports it (single source of truth). No other CLI behavior changes.
- `asset-lib-cli.ts` reuses `pixellab/object.ts`, `sheet/transparency.ts`, and the
  content-trim logic (extract the trim helper alongside if convenient).
- The Play scene mirrors `src/game/template.html`'s movement/y-sort, ported to
  TypeScript modules against the Excalibur npm package.
