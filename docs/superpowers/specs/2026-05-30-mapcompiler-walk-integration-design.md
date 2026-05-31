# Map-Compiler Walk Integration — Design

**Date:** 2026-05-30
**Status:** Approved

## Purpose

Embed the AI Map Compiler's grid map into `sheet-poc` so the existing knight
character can walk around a compiled map, blocked by water/mountains/cliffs/forest
and building footprints, and able to cross bridges and walk through doors. Collision
comes from the compiler's per-tile `walkable[y][x]` grid — the JSON map is the source
of truth, exactly as in `ai-map-compiler`.

## Locked decisions (from brainstorming)

- **Hosting:** a standalone Vite page in `sheet-poc/app/` (`mapwalk.html` +
  `mapwalk.ts`) with its own Excalibur engine. Does not touch the existing
  asset-editor store/scenes.
- **Compiler source:** vendor a one-time copy of the pure compiler into
  `sheet-poc/src/mapcompiler/`. Not kept in sync with `ai-map-compiler` (that repo
  remains the source of truth).
- **Map:** the bundled Mountain River Village sample only (no file picker).
- **Knight loading:** extract a small shared `app/src/knight.ts` (new file); the
  existing `play-scene.ts` is left unchanged.

## Context

- `sheet-poc/app/` is a Vite app with Excalibur `^0.30.3` and zod `^4.4.3` — the same
  deps the compiler needs. It already bundles the knight spritesheet at
  `app/public/character/spritesheet.{png,json}` and uses a proven manual-`preupdate`
  movement pattern (velocity zero, test the target per axis before committing).
- The `ai-map-compiler` compiler is pure (only `zod`, plus `fetch` in `loadMapIR`)
  and browser-safe: `compile(mapIR) → CompiledMap` with `terrain/collision/walkable/
  movementCost` grids (`[y][x]`), `objects`, `pois`, `spawns`, `navGraph`,
  `validation`; `renderSemanticMap(ctx, compiled, opts)` draws it to a 2D canvas.
- Project invariant (CLAUDE.md): movement & collision is manual in `preupdate`. The
  vendored compiler stays pure/browser-safe.

## Architecture

```
sheet-poc/
  src/mapcompiler/                 # vendored, pure (zod + fetch only); browser-safe
    types.ts loadMapIR.ts normalizeMapIR.ts shapes.ts rasterizeLayers.ts
    compileObjects.ts compileCollision.ts compileMovementCost.ts
    buildNavigationGraph.ts validateMap.ts compile.ts renderSemanticMap.ts
    Pathfinding.ts                 # (copied alongside; unused by this page but kept whole)
    grid-collision.ts              # NEW pure helper — the only new logic
  app/
    public/maps/mountain_river_village.json   # copy of the sample MapIR
    mapwalk.html                              # standalone page (canvas + status + report)
    src/mapwalk.ts                            # bootstrap: load→compile→render→walk
    src/knight.ts                             # NEW shared knight-actor loader
    vite.config.ts                            # + mapwalk.html as a build input
  tests/mapcompiler/
    grid-collision.test.ts                    # unit tests for the new helper
    sample-compiles.test.ts                   # smoke: bundled sample validation.ok
```

A header comment at the top of each vendored file: `// Vendored from ai-map-compiler
(source of truth there); do not edit here without porting back.`

### `grid-collision.ts` (the new logic)

```ts
export interface Grid { walkable: boolean[][]; width: number; height: number; tileSize: number; }
export function worldToTile(px: number, tileSize: number): number; // floor(px / tileSize)
export function isWalkableAt(g: Grid, worldX: number, worldY: number): boolean; // bounds + walkable[ty][tx]
```

`isWalkableAt` returns `false` outside bounds. The page resolves movement per axis
using `isWalkableAt` at the knight's **feet point**.

## Data flow

`fetch("/maps/mountain_river_village.json")` → `parseMapIR` → `compile` →
`CompiledMap`. Render the map once to an offscreen `<canvas>` via
`renderSemanticMap(ctx, compiled, { tilePx: compiled.tileSize, legend })`, convert to
an `ImageSource` (`canvas.toDataURL()`), and add it as a background `Actor` anchored
top-left at `(0,0)` with a very low `z`. The semantic render already includes bridges,
red door squares, purple POI diamonds, and orange spawn circles, so no extra overlay
is needed. Engine resolution = map pixels (`width*tileSize × height*tileSize`, e.g.
640×480), whole map visible. Knight spawns at the tile-center of `spawns[0]`.

## Movement & collision

Reuse sheet-poc's pattern: knight `vel = Vector.Zero`; in the engine `preupdate`,
read WASD, compute a per-axis candidate position, and commit each axis only if
`isWalkableAt(grid, candidateX, feetY)` (then `feetX, candidateY`) is true; clamp to
map bounds. Result: blocked by water/mountain/cliff/forest and building footprints;
free across bridges and doors (both `walkable` in the compiled grid). 8-direction
facing + walk animation via `knight.ts`.

## Error handling

`mapwalk.ts` wraps load/compile in try/catch and writes any error to the page's
status line. If `compiled.validation.ok` is false it still renders and walks, but
prints the validation errors (safety net; the bundled sample is clean).

## Testing

- **Vitest (new, pure):**
  - `grid-collision.test.ts`: `worldToTile` flooring; `isWalkableAt` true on a
    walkable tile, false on a blocked tile, false out of bounds; a blocked candidate
    is rejected while a free candidate is accepted (per-axis resolution helper if one
    is extracted).
  - `sample-compiles.test.ts`: parse + compile the bundled
    `app/public/maps/mountain_river_village.json` and assert `validation.ok === true`
    (catches a broken vendor copy or a stale sample).
- The vendored compiler's own behavior is already covered by `ai-map-compiler`'s
  suite; not duplicated here.
- **Manual:** `npm run dev` in `app/`, open `/mapwalk.html`, walk with WASD — confirm
  blocked by water/mountains/buildings and free across both bridges and through doors.

## Out of scope (YAGNI)

No NPC A* movement (that is `ai-map-compiler` Milestone 2), no load-your-own-map
picker, no changes to the existing editor/play scene, no ongoing sync of the vendored
compiler, no y-sort/ellipse footprints (this page uses tile-grid collision).

## Reuse / refactor notes

- The vendored compiler is browser-safe and could later move under `src/core/`, but is
  kept in `src/mapcompiler/` to avoid entangling the `src/core/` Node-free guard with
  a subtree it doesn't currently scan.
- `app/src/knight.ts` is new shared code used by `mapwalk.ts`; adopting it in
  `play-scene.ts` is a possible later cleanup, explicitly out of scope here.
