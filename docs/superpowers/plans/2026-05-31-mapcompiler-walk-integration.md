# Map-Compiler Walk Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone Vite page in `sheet-poc/app/` where the knight walks the compiled Mountain River Village map, blocked by water/mountains/cliffs/forest/buildings and free across bridges and doors, using the compiler's per-tile `walkable` grid.

**Architecture:** Vendor the pure `ai-map-compiler` compiler into `sheet-poc/src/mapcompiler/`, add one new pure helper (`grid-collision.ts`), bundle the sample MapIR into `app/public/maps/`, and build a self-contained page (`app/mapwalk.html` + `app/src/mapwalk.ts`) that compiles the map in-browser, renders it to a background image, and walks a knight (shared loader `app/src/knight.ts`) with manual `preupdate` per-axis grid collision.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), Vite, Excalibur `^0.30.3`, zod `^4.4.3`, Vitest. Run `npm test` / `npm run typecheck` from the repo root; the app builds from inside `app/` (`npm run build`).

**Conventions:** sheet-poc uses `.js` extensions in imports (including tests). Grids are `[y][x]`. `TileCoord = [x, y]`. Movement is manual in `preupdate` (velocity zero, per-axis test) per the project invariant in CLAUDE.md.

---

## Task 1: Vendor the compiler + bundle the sample map

Copy the pure compiler from the sibling `ai-map-compiler` repo into sheet-poc, fix the one cross-dir import, bundle the sample MapIR, and prove the copy compiles with a smoke test.

**Files:**
- Create (by copy): `src/mapcompiler/{types,loadMapIR,normalizeMapIR,shapes,rasterizeLayers,compileObjects,compileCollision,compileMovementCost,buildNavigationGraph,validateMap,compile,renderSemanticMap}.ts` and `src/mapcompiler/Pathfinding.ts`
- Modify: `src/mapcompiler/Pathfinding.ts` (one import path)
- Create: `src/mapcompiler/README.md`
- Create (by copy): `app/public/maps/mountain_river_village.json`
- Test: `tests/mapcompiler/sample-compiles.test.ts`

- [ ] **Step 1: Copy the compiler + Pathfinding (flat) into `src/mapcompiler/`**
```bash
mkdir -p src/mapcompiler
cp ../ai-map-compiler/src/compiler/*.ts src/mapcompiler/
cp ../ai-map-compiler/src/game/Pathfinding.ts src/mapcompiler/
```

- [ ] **Step 2: Fix the one import in `src/mapcompiler/Pathfinding.ts`**
It was at `src/game/` and imported `../compiler/types.js`. Now flat in `src/mapcompiler/`, change its first import line:
```ts
import type { CompiledMap, TileCoord } from "./types.js";
```
(The compiler files import each other via `./x.js`, which stays correct after the flat copy. No other edits to vendored files.)

- [ ] **Step 3: Create `src/mapcompiler/README.md`**
```markdown
# src/mapcompiler — vendored

These modules are a **one-time copy** of the pure compiler from the sibling
`ai-map-compiler` repo (`src/compiler/*` + `src/game/Pathfinding.ts`). That repo is
the source of truth. `Pathfinding.ts`'s import of `./types.js` was adjusted for the
flat layout here. Do not edit these to add features — port changes from
`ai-map-compiler` instead. The only sheet-poc-original file here is
`grid-collision.ts`.
```

- [ ] **Step 4: Bundle the sample map**
```bash
mkdir -p app/public/maps
cp ../ai-map-compiler/public/assets/maps/mountain_river_village_mapir.json app/public/maps/mountain_river_village.json
```

- [ ] **Step 5: Write `tests/mapcompiler/sample-compiles.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMapIR } from "../../src/mapcompiler/loadMapIR.js";
import { compile } from "../../src/mapcompiler/compile.js";

describe("bundled sample map", () => {
  it("parses and compiles with validation.ok", () => {
    const raw = readFileSync(join(process.cwd(), "app/public/maps/mountain_river_village.json"), "utf8");
    const compiled = compile(parseMapIR(JSON.parse(raw)));
    if (!compiled.validation.ok) console.error(JSON.stringify(compiled.validation.errors, null, 2));
    expect(compiled.validation.ok).toBe(true);
    expect(compiled.width).toBeGreaterThan(0);
    expect(compiled.spawns.length).toBe(3);
  });
});
```

- [ ] **Step 6: Verify + commit**
Run: `npm test` (from repo root) → the new smoke test passes; existing suite still passes.
Run: `npm run typecheck` → clean (the vendored files typecheck under the root tsconfig, same as `src/core`).
```bash
git add src/mapcompiler app/public/maps/mountain_river_village.json tests/mapcompiler/sample-compiles.test.ts
git commit -m "feat: vendor ai-map-compiler compiler + bundle sample map"
```
If `npm run typecheck` flags an unused-locals/param error inside a vendored file, report BLOCKED with the file:line rather than editing vendored logic (we'll decide how to handle).

---

## Task 2: Grid-collision helper (the only new logic)

**Files:**
- Create: `src/mapcompiler/grid-collision.ts`
- Test: `tests/mapcompiler/grid-collision.test.ts`

- [ ] **Step 1: Write `tests/mapcompiler/grid-collision.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { worldToTile, isWalkableAt, type Grid } from "../../src/mapcompiler/grid-collision.js";

describe("worldToTile", () => {
  it("floors world pixels to a tile index", () => {
    expect(worldToTile(0, 16)).toBe(0);
    expect(worldToTile(15.9, 16)).toBe(0);
    expect(worldToTile(16, 16)).toBe(1);
    expect(worldToTile(33, 16)).toBe(2);
  });
});

describe("isWalkableAt", () => {
  const grid: Grid = {
    width: 3, height: 2, tileSize: 16,
    walkable: [[true, false, true], [true, true, false]],
  };
  it("is true on a walkable tile", () => { expect(isWalkableAt(grid, 8, 8)).toBe(true); });      // tile (0,0)
  it("is false on a blocked tile", () => { expect(isWalkableAt(grid, 24, 8)).toBe(false); });     // tile (1,0)
  it("is false out of bounds", () => {
    expect(isWalkableAt(grid, -1, 8)).toBe(false);
    expect(isWalkableAt(grid, 48, 8)).toBe(false);   // x tile 3 (>= width)
    expect(isWalkableAt(grid, 8, 32)).toBe(false);   // y tile 2 (>= height)
  });
});
```

- [ ] **Step 2: Run → fail.** `npm test grid-collision`.

- [ ] **Step 3: Write `src/mapcompiler/grid-collision.ts`**
```ts
// sheet-poc-original (not vendored): tile-grid collision sampling for walking a CompiledMap.
export interface Grid {
  walkable: boolean[][]; // [y][x] — true = passable
  width: number;
  height: number;
  tileSize: number;
}

/** Floor a world-pixel coordinate to its tile index. */
export function worldToTile(px: number, tileSize: number): number {
  return Math.floor(px / tileSize);
}

/** True if the tile under the given world point is in bounds and walkable. */
export function isWalkableAt(grid: Grid, worldX: number, worldY: number): boolean {
  const tx = worldToTile(worldX, grid.tileSize);
  const ty = worldToTile(worldY, grid.tileSize);
  if (tx < 0 || tx >= grid.width || ty < 0 || ty >= grid.height) return false;
  return grid.walkable[ty][tx];
}
```

- [ ] **Step 4: Run → pass.** `npm test grid-collision`, then `npm run typecheck`. Commit:
```bash
git add src/mapcompiler/grid-collision.ts tests/mapcompiler/grid-collision.test.ts
git commit -m "feat: tile-grid collision helper for compiled-map walking"
```

---

## Task 3: Shared knight loader

A small browser module that builds the 8-direction knight actor + animations from the
bundled spritesheet. Extracted so the new page uses it cleanly; `play-scene.ts` is left
unchanged. No unit test (Excalibur/DOM) — exercised via the manual check in Task 4.

**Files:**
- Create: `app/src/knight.ts`

- [ ] **Step 1: Write `app/src/knight.ts`**
```ts
import { Actor, Vector, ImageSource, SpriteSheet, Animation } from "excalibur";

type Manifest = {
  frameSize: number; columns: number; rows: number; directions: string[];
  actions: Record<string, { frameCount: number; durationMs: number; rowByDirection: Record<string, number> }>;
};

// Clockwise sectors from +x, used to map a movement vector to one of 8 facings.
const SECTORS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

export interface Knight {
  actor: Actor;
  /** Offset from the actor's center down to its feet, where collision is sampled. */
  footY: number;
  directions: string[];
  /** Pick an 8-way facing name from a movement vector. */
  dirFromVec(vx: number, vy: number): string;
  /** Swap the displayed animation for the given facing + moving state. */
  setState(facing: string, moving: boolean): void;
}

/** Load the knight spritesheet (from /character/) and build a ready-to-add Excalibur actor. */
export async function loadKnight(opts: { scale?: number } = {}): Promise<Knight> {
  const scale = opts.scale ?? 0.4;
  const manifest: Manifest = await (await fetch("/character/spritesheet.json")).json();
  const image = new ImageSource("/character/spritesheet.png");
  await image.load();

  const sheet = SpriteSheet.fromImageSource({
    image,
    grid: { columns: manifest.columns, rows: manifest.rows, spriteWidth: manifest.frameSize, spriteHeight: manifest.frameSize },
  });
  const walkName = manifest.actions.walk ? "walk" : Object.keys(manifest.actions)[0];
  const idleName = manifest.actions.idle ? "idle" : walkName;
  const build = (action: string, dir: string): Animation => {
    const act = manifest.actions[action];
    const row = act.rowByDirection[dir] ?? act.rowByDirection[manifest.directions[0]];
    const frames = [];
    for (let c = 0; c < act.frameCount; c++) frames.push({ graphic: sheet.getSprite(c, row), duration: act.durationMs });
    const anim = new Animation({ frames });
    anim.scale = new Vector(scale, scale);
    return anim;
  };
  const anims: Record<string, Record<string, Animation>> = {};
  for (const dir of manifest.directions) anims[dir] = { walk: build(walkName, dir), idle: build(idleName, dir) };

  const footY = manifest.frameSize * scale * 0.25;
  let facing = manifest.directions.includes("south") ? "south" : manifest.directions[0];
  const actor = new Actor({ pos: new Vector(0, 0), z: 1 });
  actor.graphics.use(anims[facing].idle);

  const dirFromVec = (vx: number, vy: number): string => {
    let deg = (Math.atan2(vy, vx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const want = SECTORS[Math.round(deg / 45) % 8];
    return manifest.directions.includes(want) ? want : manifest.directions[0];
  };
  const setState = (f: string, moving: boolean): void => {
    facing = f;
    actor.graphics.use(anims[facing][moving ? "walk" : "idle"]);
  };

  return { actor, footY, directions: manifest.directions, dirFromVec, setState };
}
```

- [ ] **Step 2: Typecheck** — `cd app && npx tsc --noEmit && cd ..`. Expected: no errors (this also confirms Excalibur's types resolve for the new file). Note: this may flag `mapwalk.ts` as missing until Task 4 — if so, that's expected; just confirm `knight.ts` itself has no type errors (no errors mentioning `knight.ts`).

- [ ] **Step 3: Commit**
```bash
git add app/src/knight.ts
git commit -m "feat: shared 8-direction knight loader for the app"
```

---

## Task 4: The mapwalk page + Vite wiring + manual verification

**Files:**
- Create: `app/mapwalk.html`
- Create: `app/src/mapwalk.ts`
- Modify: `app/vite.config.ts` (add `mapwalk.html` as a second build input)
- Modify: `app/tsconfig.json` (`include` the vendored dir)

- [ ] **Step 1: Create `app/mapwalk.html`**
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Walk the Compiled Map</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 16px; background: #1d1d1f; color: #eee; }
      #status { margin-bottom: 8px; font-size: 14px; }
      #report { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px;
                margin-top: 8px; max-height: 160px; overflow: auto; }
      .ok { color: #7bd88f; } .bad { color: #ff6b6b; }
      canvas { border: 1px solid #555; image-rendering: pixelated; }
      .hint { opacity: 0.7; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Walk the Compiled Map</h1>
    <div id="status">loading…</div>
    <div class="hint">WASD / arrow keys to walk. Water, mountains, cliffs, forest, and buildings block; bridges and doors are walkable.</div>
    <canvas id="game"></canvas>
    <div id="report"></div>
    <script type="module" src="/src/mapwalk.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `app/src/mapwalk.ts`**
```ts
import { Engine, Actor, Vector, ImageSource, Color, Keys, DisplayMode } from "excalibur";
import { loadMapIR } from "../../src/mapcompiler/loadMapIR.js";
import { compile } from "../../src/mapcompiler/compile.js";
import { renderSemanticMap } from "../../src/mapcompiler/renderSemanticMap.js";
import { isWalkableAt, type Grid } from "../../src/mapcompiler/grid-collision.js";
import { loadKnight } from "./knight.js";

const MAP_URL = "/maps/mountain_river_village.json";
const SPEED = 70; // world px / second

function setStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}
function setReport(text: string, ok: boolean): void {
  const el = document.getElementById("report");
  if (!el) return;
  el.textContent = text;
  el.className = ok ? "ok" : "bad";
}

async function main(): Promise<void> {
  const mapIR = await loadMapIR(MAP_URL);
  const compiled = compile(mapIR);
  const tile = compiled.tileSize;
  const W = compiled.width * tile, H = compiled.height * tile;

  // Render the semantic map once to an offscreen canvas → background image.
  const off = document.createElement("canvas");
  const ctx = off.getContext("2d")!;
  renderSemanticMap(ctx, compiled, { tilePx: tile, legend: mapIR.legend });
  const bg = new ImageSource(off.toDataURL());
  await bg.load();

  const game = new Engine({
    canvasElementId: "game",
    width: W, height: H,
    displayMode: DisplayMode.Fixed,
    pixelArt: true,
    backgroundColor: Color.fromHex("#101014"),
    suppressPlayButton: true,
  });

  const bgActor = new Actor({ pos: new Vector(0, 0), anchor: new Vector(0, 0), z: -100000 });
  bgActor.graphics.use(bg.toSprite());
  game.currentScene.add(bgActor);

  const knight = await loadKnight({ scale: 0.4 });
  const spawn = compiled.spawns[0];
  knight.actor.pos = spawn
    ? new Vector((spawn.x + 0.5) * tile, (spawn.y + 0.5) * tile)
    : new Vector(W / 2, H / 2);
  game.currentScene.add(knight.actor);

  // Whole map visible (engine resolution == map pixels); center the camera.
  game.currentScene.camera.pos = new Vector(W / 2, H / 2);
  game.currentScene.camera.zoom = 1;

  const grid: Grid = { walkable: compiled.walkable, width: compiled.width, height: compiled.height, tileSize: tile };
  let facing = knight.directions.includes("south") ? "south" : knight.directions[0];

  game.on("preupdate", (evt) => {
    const dt = (evt && typeof (evt as { delta?: number }).delta === "number" ? (evt as { delta: number }).delta : 16) / 1000;
    const kb = game.input.keyboard;
    let vx = 0, vy = 0;
    if (kb.isHeld(Keys.A) || kb.isHeld(Keys.Left)) vx -= 1;
    if (kb.isHeld(Keys.D) || kb.isHeld(Keys.Right)) vx += 1;
    if (kb.isHeld(Keys.W) || kb.isHeld(Keys.Up)) vy -= 1;
    if (kb.isHeld(Keys.S) || kb.isHeld(Keys.Down)) vy += 1;
    const moving = vx !== 0 || vy !== 0;
    const p = knight.actor;
    if (moving) {
      const len = Math.hypot(vx, vy), step = SPEED * dt;
      const nx = Math.max(0, Math.min(W - 1, p.pos.x + (vx / len) * step));
      const ny = Math.max(0, Math.min(H - 1, p.pos.y + (vy / len) * step));
      // Per-axis test at the feet point (project invariant: manual preupdate collision).
      if (isWalkableAt(grid, nx, p.pos.y + knight.footY)) p.pos.x = nx;
      if (isWalkableAt(grid, p.pos.x, ny + knight.footY)) p.pos.y = ny;
      facing = knight.dirFromVec(vx, vy);
    }
    knight.setState(facing, moving);
  });

  const v = compiled.validation;
  setStatus(`${compiled.name} (${compiled.width}×${compiled.height}) — spawn: ${spawn?.npcId ?? "center"}. WASD to walk.`);
  setReport(
    v.ok ? "validation OK — 0 errors" : v.errors.map((e) => `${e.rule}: ${e.message}`).join("\n"),
    v.ok,
  );

  await game.start();
}

main().catch((err) => {
  setStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
});
```

- [ ] **Step 3: Update `app/vite.config.ts`** (add the second page as a build input)
```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { fs: { allow: [".."] } }, // permit importing ../src/* (core + mapcompiler)
  build: {
    target: "es2022", // top-level await / es2022 features
    rollupOptions: {
      input: { main: "index.html", mapwalk: "mapwalk.html" },
    },
  },
});
```

- [ ] **Step 4: Update `app/tsconfig.json` `include`** so the app's `tsc --noEmit` sees the vendored modules. Change the `include` line to:
```json
  "include": ["src", "../src/core", "../src/mapcompiler"]
```

- [ ] **Step 5: App typecheck + build**
Run: `cd app && npm run build && cd ..`
Expected: `tsc --noEmit` clean and `vite build` succeeds, emitting BOTH `dist/index.html` and `dist/mapwalk.html` (plus JS chunks). Report the build output listing both HTML entries.

- [ ] **Step 6: Manual verification (the real acceptance check)**
Run: `cd app && npm run dev`, open the printed URL with `/mapwalk.html` appended (e.g. `http://localhost:5173/mapwalk.html`). Confirm:
- The Mountain River Village map renders (terrain colors, river, lake/pond, mountains, forest, plaza, roads, building outlines, red doors, purple POI diamonds, orange spawn circles).
- Status shows the map name + dims; report shows "validation OK — 0 errors".
- The knight appears at Anna's spawn and walks with WASD.
- The knight is **blocked** by water, mountains, the forest, and building footprints.
- The knight can **cross both bridges** over the river and **walk through doors**.
Stop the dev server when confirmed.

- [ ] **Step 7: Final gates + commit**
Run (repo root): `npm test` (all pass, incl. mapcompiler tests) and `npm run typecheck` (clean).
```bash
git add app/mapwalk.html app/src/mapwalk.ts app/vite.config.ts app/tsconfig.json
git commit -m "feat: standalone page to walk the compiled map (mapwalk)"
```

---

## Done

`npm run dev` in `app/` + `/mapwalk.html` shows the knight walking the compiled
Mountain River Village map with tile-grid collision (blocked by terrain/buildings,
free across bridges/doors). The compiler is vendored and smoke-tested; the new
`grid-collision` helper is unit-tested. Finish with
`superpowers:finishing-a-development-branch`.
