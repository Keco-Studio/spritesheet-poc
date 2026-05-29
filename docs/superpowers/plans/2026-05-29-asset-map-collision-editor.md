# Asset Map + Collision Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vite web app where a user loads a base map, places pre-defined PixelLab assets, auto-generates collision from their footprints, play-tests by walking a character, and exports collision (JSON + mask PNG), a composited map PNG, and a re-loadable project.

**Architecture:** Pure, Node-free logic lives in `src/sheet/` (footprint math, collision model, manifest + project schemas) and is unit-tested with vitest and shared by both the existing CLI and the new browser app. The app (`app/`) is vanilla TypeScript + Vite with one Excalibur `Engine` hosting an Edit scene and a Play scene, plus a DOM palette/toolbar. The CLI rasterizes collision with `sharp`; the browser rasterizes the identical ellipses to a `<canvas>`.

**Tech Stack:** TypeScript (ESM), Vite, Excalibur 0.30.x (npm), zod, sharp (CLI only), vitest. Spec: `docs/superpowers/specs/2026-05-29-asset-map-collision-editor-design.md`.

---

## File Structure

Pure shared modules (Node-free, imported by CLI + app + tests):
- `src/sheet/footprint.ts` — `Rect`, `Ellipse`, `footprintEllipse`, `pointInEllipse`
- `src/sheet/scene-collision.ts` — placements → colliders, `isSolid`, collision export
- `src/sheet/manifest-schema.ts` — asset manifest zod schema + `parseManifest`, `toAssetLookup`
- `src/sheet/project-model.ts` — project zod schema + `serializeProject` / `parseProject`

CLI:
- `src/asset-lib-cli.ts` — `npm run assets`: generate the library into `app/public/assets/`, bundle character
- `src/sheet/mask.ts`, `src/buildmap-cli.ts` — refactored to import `footprint.ts`

App (`app/`):
- `app/index.html`, `app/vite.config.ts`, `app/tsconfig.json`, `app/package.json`
- `app/src/main.ts` — bootstrap Engine + scenes + UI + store
- `app/src/assets.ts` — fetch + validate manifest, load images
- `app/src/store.ts` — in-memory state
- `app/src/editor-scene.ts` — Edit: place/move/delete, y-sort, collision overlay
- `app/src/play-scene.ts` — Play: walk character, collision sampling
- `app/src/palette.ts`, `app/src/toolbar.ts` — DOM UI
- `app/src/collision-canvas.ts` — rasterize ellipses → mask PNG blob; composited PNG
- `app/src/exporters.ts` — download collision JSON+PNG, composited PNG, project JSON

Tests:
- `tests/sheet/footprint.test.ts`, `tests/sheet/scene-collision.test.ts`
- `tests/sheet/manifest-schema.test.ts`, `tests/sheet/project-model.test.ts`
- `tests/sheet/collision-sim.test.ts` — headless walk-into-collider sim

---

## Task 1: Pure footprint math (`src/sheet/footprint.ts`)

Extract the footprint→ellipse math currently inlined in `buildmap-cli.ts` into a pure module with no Node imports, so Vite can bundle it for the browser.

**Files:**
- Create: `src/sheet/footprint.ts`
- Test: `tests/sheet/footprint.test.ts`
- Modify: `src/sheet/mask.ts` (import `Rect` from footprint), `src/buildmap-cli.ts` (use `footprintEllipse`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/sheet/footprint.test.ts
import { describe, it, expect } from "vitest";
import { footprintEllipse, pointInEllipse } from "../../src/sheet/footprint.js";

describe("footprintEllipse", () => {
  it("centers a full-footprint ellipse on the rect", () => {
    const e = footprintEllipse({ x: 0, y: 0, w: 100, h: 80 }, 1.0);
    expect(e).toEqual({ cx: 50, cy: 40, rx: 50, ry: 40 });
  });

  it("puts a partial footprint at the base (bottom band)", () => {
    const e = footprintEllipse({ x: 10, y: 20, w: 40, h: 100 }, 0.3);
    expect(e.cx).toBe(30); // x + w/2
    expect(e.rx).toBe(20); // w/2
    expect(e.ry).toBe(15); // h*0.3/2
    expect(e.cy).toBe(20 + 100 - 15); // base: rect bottom minus ry
  });

  it("clamps ry to at least 1", () => {
    expect(footprintEllipse({ x: 0, y: 0, w: 10, h: 10 }, 0).ry).toBe(1);
  });
});

describe("pointInEllipse", () => {
  const e = { cx: 50, cy: 50, rx: 20, ry: 10 };
  it("is true at the center and inside", () => {
    expect(pointInEllipse(e, 50, 50)).toBe(true);
    expect(pointInEllipse(e, 60, 50)).toBe(true);
  });
  it("is false outside", () => {
    expect(pointInEllipse(e, 50, 65)).toBe(false);
    expect(pointInEllipse(e, 75, 50)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sheet/footprint.test.ts`
Expected: FAIL — cannot find module `../../src/sheet/footprint.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/sheet/footprint.ts
// Pure, Node-free: safe to bundle into the browser (no sharp/fs imports).

export type Rect = { x: number; y: number; w: number; h: number };
export type Ellipse = { cx: number; cy: number; rx: number; ry: number };

/**
 * Base-footprint ellipse at an object's feet (bottom-center). Height is
 * `footprint` × the rect height; width spans the rect. footprint 1.0 fills the
 * rect (flat props like water); small footprints sit at the base (tall props).
 */
export function footprintEllipse(rect: Rect, footprint: number): Ellipse {
  const rx = rect.w / 2;
  const ry = Math.max(1, (rect.h * footprint) / 2);
  return { cx: rect.x + rx, cy: rect.y + rect.h - ry, rx, ry };
}

export function pointInEllipse(e: Ellipse, x: number, y: number): boolean {
  const nx = (x - e.cx) / e.rx;
  const ny = (y - e.cy) / e.ry;
  return nx * nx + ny * ny <= 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sheet/footprint.test.ts`
Expected: PASS (3 + 2 assertions across the suites).

- [ ] **Step 5: Refactor `mask.ts` to import `Rect` from footprint (avoid duplicate type)**

In `src/sheet/mask.ts`, replace the local `export type Rect = {...}` with a re-export and import:

```ts
// src/sheet/mask.ts  (top of file)
import sharp from "sharp";
import type { Rect } from "./footprint.js";
export type { Rect };
```

Leave the rest of `mask.ts` unchanged.

- [ ] **Step 6: Refactor `buildmap-cli.ts` to use `footprintEllipse`**

In `src/buildmap-cli.ts`, update the import line and replace the body of `stampFootprint` to use the shared math (same result, single source of truth):

```ts
// add to imports
import { footprintEllipse } from "./sheet/footprint.js";
```

```ts
// replace the existing stampFootprint body
function stampFootprint(collision: Uint8Array, size: number, rect: Rect, footprint: number): void {
  const e = footprintEllipse(rect, footprint);
  const y0 = Math.max(0, Math.floor(e.cy - e.ry));
  const y1 = Math.min(size - 1, Math.ceil(e.cy + e.ry));
  const x0 = Math.max(0, Math.floor(e.cx - e.rx));
  const x1 = Math.min(size - 1, Math.ceil(e.cx + e.rx));
  for (let my = y0; my <= y1; my++) {
    for (let mx = x0; mx <= x1; mx++) {
      const nx = (mx + 0.5 - e.cx) / e.rx, ny = (my + 0.5 - e.cy) / e.ry;
      if (nx * nx + ny * ny <= 1) collision[my * size + mx] = 255;
    }
  }
}
```

- [ ] **Step 7: Verify nothing broke**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all existing tests + the new footprint tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/sheet/footprint.ts tests/sheet/footprint.test.ts src/sheet/mask.ts src/buildmap-cli.ts
git commit -m "refactor: extract pure footprint math into sheet/footprint.ts"
```

---

## Task 2: Collision model (`src/sheet/scene-collision.ts`)

Pure logic turning placements + asset dimensions into colliders, a solidity test, and the collision export object. Shared by the app (overlay, play, export) and the headless sim.

**Files:**
- Create: `src/sheet/scene-collision.ts`
- Test: `tests/sheet/scene-collision.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/sheet/scene-collision.test.ts
import { describe, it, expect } from "vitest";
import { placementRect, colliders, isSolid, buildCollisionExport } from "../../src/sheet/scene-collision.js";

const lookup = {
  tree: { w: 40, h: 60, footprint: 0.3 },
  pond: { w: 80, h: 50, footprint: 1.0 },
};

describe("placementRect", () => {
  it("reconstructs the rect from feet (bottom-center) + asset size", () => {
    expect(placementRect({ assetId: "tree", x: 100, y: 200 }, lookup.tree)).toEqual({ x: 80, y: 140, w: 40, h: 60 });
  });
});

describe("colliders", () => {
  it("makes one ellipse per known, placed asset", () => {
    const cs = colliders([{ assetId: "tree", x: 100, y: 200 }], lookup);
    expect(cs).toHaveLength(1);
    expect(cs[0].cx).toBe(100);
  });
  it("skips placements whose assetId is unknown", () => {
    expect(colliders([{ assetId: "ghost", x: 0, y: 0 }], lookup)).toHaveLength(0);
  });
});

describe("isSolid", () => {
  it("is true inside a collider and false outside", () => {
    const cs = colliders([{ assetId: "pond", x: 100, y: 100 }], lookup);
    expect(isSolid(cs, 100, 90)).toBe(true);    // inside pond ellipse
    expect(isSolid(cs, 300, 300)).toBe(false);  // far away
  });
});

describe("buildCollisionExport", () => {
  it("includes dims, placements with footprint, and colliders", () => {
    const out = buildCollisionExport(256, 256, [{ assetId: "tree", x: 100, y: 200 }], lookup);
    expect(out).toMatchObject({ mapW: 256, mapH: 256 });
    expect(out.placements[0]).toEqual({ assetId: "tree", x: 100, y: 200, footprint: 0.3 });
    expect(out.colliders).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sheet/scene-collision.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/sheet/scene-collision.ts
import { footprintEllipse, pointInEllipse, type Rect, type Ellipse } from "./footprint.js";

/** A placed asset. (x,y) is the FEET point (bottom-center) in map coords. */
export type Placement = { assetId: string; x: number; y: number };
export type AssetDim = { w: number; h: number; footprint: number };
export type AssetLookup = Record<string, AssetDim>;

export function placementRect(p: Placement, a: AssetDim): Rect {
  return { x: p.x - a.w / 2, y: p.y - a.h, w: a.w, h: a.h };
}

export function placementEllipse(p: Placement, a: AssetDim): Ellipse {
  return footprintEllipse(placementRect(p, a), a.footprint);
}

export function colliders(placements: Placement[], lookup: AssetLookup): Ellipse[] {
  return placements
    .filter((p) => lookup[p.assetId])
    .map((p) => placementEllipse(p, lookup[p.assetId]));
}

export function isSolid(ellipses: Ellipse[], x: number, y: number): boolean {
  return ellipses.some((e) => pointInEllipse(e, x, y));
}

export type CollisionExport = {
  mapW: number;
  mapH: number;
  placements: Array<Placement & { footprint: number }>;
  colliders: Ellipse[];
};

export function buildCollisionExport(
  mapW: number,
  mapH: number,
  placements: Placement[],
  lookup: AssetLookup,
): CollisionExport {
  const known = placements.filter((p) => lookup[p.assetId]);
  return {
    mapW,
    mapH,
    placements: known.map((p) => ({ ...p, footprint: lookup[p.assetId].footprint })),
    colliders: known.map((p) => placementEllipse(p, lookup[p.assetId])),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sheet/scene-collision.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sheet/scene-collision.ts tests/sheet/scene-collision.test.ts
git commit -m "feat: scene-collision pure model (placements -> colliders, isSolid, export)"
```

---

## Task 3: Asset manifest schema (`src/sheet/manifest-schema.ts`)

**Files:**
- Create: `src/sheet/manifest-schema.ts`
- Test: `tests/sheet/manifest-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/sheet/manifest-schema.test.ts
import { describe, it, expect } from "vitest";
import { parseManifest, toAssetLookup } from "../../src/sheet/manifest-schema.js";

const good = {
  assets: [
    { id: "tree", name: "Tree", file: "tree.png", footprint: 0.3, w: 40, h: 60 },
    { id: "pond", name: "Pond", file: "pond.png", footprint: 1.0, w: 80, h: 50 },
  ],
};

describe("parseManifest", () => {
  it("accepts a valid manifest", () => {
    expect(parseManifest(good).assets).toHaveLength(2);
  });
  it("rejects footprint out of range", () => {
    expect(() => parseManifest({ assets: [{ ...good.assets[0], footprint: 2 }] })).toThrow();
  });
  it("rejects a missing file field", () => {
    expect(() => parseManifest({ assets: [{ id: "x", name: "X", footprint: 0.5, w: 1, h: 1 }] })).toThrow();
  });
});

describe("toAssetLookup", () => {
  it("maps id -> {w,h,footprint}", () => {
    expect(toAssetLookup(parseManifest(good)).tree).toEqual({ w: 40, h: 60, footprint: 0.3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sheet/manifest-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/sheet/manifest-schema.ts
import { z } from "zod";
import type { AssetLookup } from "./scene-collision.js";

export const AssetEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  file: z.string().min(1),
  footprint: z.number().min(0.05).max(1),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export const ManifestSchema = z.object({ assets: z.array(AssetEntrySchema).min(1) });

export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type AssetManifest = z.infer<typeof ManifestSchema>;

export function parseManifest(raw: unknown): AssetManifest {
  return ManifestSchema.parse(raw);
}

export function toAssetLookup(m: AssetManifest): AssetLookup {
  const lookup: AssetLookup = {};
  for (const a of m.assets) lookup[a.id] = { w: a.w, h: a.h, footprint: a.footprint };
  return lookup;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sheet/manifest-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sheet/manifest-schema.ts tests/sheet/manifest-schema.test.ts
git commit -m "feat: asset manifest schema + toAssetLookup"
```

---

## Task 4: Project model (`src/sheet/project-model.ts`)

**Files:**
- Create: `src/sheet/project-model.ts`
- Test: `tests/sheet/project-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/sheet/project-model.test.ts
import { describe, it, expect } from "vitest";
import { serializeProject, parseProject } from "../../src/sheet/project-model.js";

const project = {
  baseMap: "data:image/png;base64,AAAA",
  mapW: 256,
  mapH: 256,
  placements: [{ assetId: "tree", x: 10, y: 20 }],
};

describe("project round-trip", () => {
  it("serialize then parse yields the same project", () => {
    const json = serializeProject(project);
    expect(parseProject(json)).toEqual(project);
  });
  it("rejects malformed JSON", () => {
    expect(() => parseProject("{not json")).toThrow();
  });
  it("rejects a project missing mapW", () => {
    expect(() => parseProject(JSON.stringify({ baseMap: "x", mapH: 1, placements: [] }))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sheet/project-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/sheet/project-model.ts
import { z } from "zod";

export const PlacementSchema = z.object({
  assetId: z.string().min(1),
  x: z.number(),
  y: z.number(),
});
export const ProjectSchema = z.object({
  baseMap: z.string().min(1), // data URL
  mapW: z.number().int().positive(),
  mapH: z.number().int().positive(),
  placements: z.array(PlacementSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export function serializeProject(p: Project): string {
  return JSON.stringify(ProjectSchema.parse(p));
}

export function parseProject(json: string): Project {
  return ProjectSchema.parse(JSON.parse(json));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sheet/project-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sheet/project-model.ts tests/sheet/project-model.test.ts
git commit -m "feat: project model (zod schema + serialize/parse)"
```

---

## Task 5: Vite app scaffold (`app/`)

Stand up the Vite app that imports the shared `src/sheet/*` modules and Excalibur from npm.

**Files:**
- Create: `app/package.json`, `app/vite.config.ts`, `app/tsconfig.json`, `app/index.html`, `app/src/main.ts`

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "map-collision-editor",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "excalibur": "^0.30.3",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "typescript": "^6.0.3",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `app/vite.config.ts`**

Allow importing the shared modules from the repo root (one level up).

```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { fs: { allow: [".."] } }, // permit importing ../src/sheet/*
});
```

- [ ] **Step 3: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "../src/sheet"]
}
```

- [ ] **Step 4: Create `app/index.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Map + Collision Editor</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #1a1a1a; color: #ddd; display: flex; height: 100vh; }
    #sidebar { width: 200px; background: #222; padding: 10px; overflow-y: auto; flex-shrink: 0; }
    #sidebar h2 { font-size: 12px; text-transform: uppercase; opacity: 0.6; margin: 12px 0 6px; }
    #palette { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .pal-item { background: #333; border: 2px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; text-align: center; font-size: 10px; }
    .pal-item.active { border-color: #4af; }
    .pal-item img { width: 100%; image-rendering: pixelated; height: 48px; object-fit: contain; }
    #main { flex: 1; display: flex; flex-direction: column; }
    #toolbar { background: #222; padding: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    #toolbar button, #toolbar label { background: #333; border: 1px solid #444; color: #ddd; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    #toolbar button.active { background: #4af; color: #000; }
    #game { image-rendering: pixelated; flex: 1; }
    .hint { font-size: 11px; opacity: 0.6; padding: 6px 8px; }
  </style>
</head>
<body>
  <div id="sidebar">
    <h2>Assets</h2>
    <div id="palette"></div>
  </div>
  <div id="main">
    <div id="toolbar"></div>
    <canvas id="game"></canvas>
    <div class="hint" id="hint">Load a base map to begin.</div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Create a minimal `app/src/main.ts`**

```ts
// app/src/main.ts — temporary smoke bootstrap; replaced in Task 15.
import { Engine, Color } from "excalibur";

const game = new Engine({
  canvasElementId: "game",
  width: 800,
  height: 600,
  backgroundColor: Color.fromHex("#0c0c0c"),
  antialiasing: false,
  pixelArt: true,
});
await game.start();
console.log("editor booted");
```

- [ ] **Step 6: Install and smoke-test the dev server**

Run:
```bash
cd app && npm install && npm run dev
```
Expected: Vite serves at `http://localhost:5173`; opening it shows a dark canvas and `editor booted` in the console with no errors. Stop the server (Ctrl-C).

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/vite.config.ts app/tsconfig.json app/index.html app/src/main.ts
git commit -m "chore: scaffold Vite editor app (excalibur, shared sheet imports)"
```

---

## Task 6: Asset library CLI (`src/asset-lib-cli.ts`)

Generate the fixed asset library into `app/public/assets/` and bundle a transparent character into `app/public/character/`. Reuses `generateObject`, `removeFlatBackground`, and the content-trim already proven in `buildmap-cli.ts`.

**Files:**
- Create: `src/asset-lib-cli.ts`
- Modify: `package.json` (root) — add `"assets"` script

- [ ] **Step 1: Add the root npm script**

In the root `package.json` `scripts`, add after `"buildmap"`:

```json
    "assets": "tsx src/asset-lib-cli.ts",
```

- [ ] **Step 2: Write `src/asset-lib-cli.ts`**

```ts
// src/asset-lib-cli.ts
import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { generateObject } from "./pixellab/object.js";
import { removeFlatBackground } from "./sheet/transparency.js";

// The fixed starter library. prompt is generated transparent; footprint is the
// base-collision fraction; genSize is the square generation size in px.
const LIBRARY = [
  { id: "oak-tree", name: "Oak Tree", prompt: "a single round leafy oak tree seen from directly above", footprint: 0.3, genSize: 80 },
  { id: "pine-tree", name: "Pine Tree", prompt: "a single tall green pine tree seen from above", footprint: 0.3, genSize: 80 },
  { id: "bush", name: "Bush", prompt: "a small round green bush seen from above", footprint: 0.6, genSize: 48 },
  { id: "rock", name: "Rock", prompt: "a single gray boulder seen from above", footprint: 0.7, genSize: 48 },
  { id: "boulders", name: "Boulders", prompt: "a pile of gray stone boulders seen from above", footprint: 0.6, genSize: 72 },
  { id: "pond", name: "Pond", prompt: "a small round blue pond of water seen from above", footprint: 1.0, genSize: 80 },
  { id: "flowers", name: "Flowers", prompt: "a small patch of pink flowers seen from above", footprint: 0.4, genSize: 48 },
  { id: "stump", name: "Stump", prompt: "a brown tree stump seen from above", footprint: 0.8, genSize: 40 },
  { id: "barrel", name: "Barrel", prompt: "a wooden barrel seen from above", footprint: 0.9, genSize: 40 },
  { id: "crate", name: "Crate", prompt: "a wooden crate seen from above", footprint: 0.9, genSize: 40 },
] as const;

function die(msg: string): never { console.error(msg); process.exit(1); }

/** Crop a PNG to its non-transparent content; return png + content size. */
async function trim(png: Buffer): Promise<{ png: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) return { png, w, h };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = await sharp(png).extract({ left: x0, top: y0, width: cw, height: ch }).png().toBuffer();
  return { png: out, w: cw, h: ch };
}

async function main(): Promise<void> {
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) die("PIXELLAB_API_KEY missing (populate .env)");
  const client = createClient(apiKey);

  const outDir = resolve("app/public/assets");
  mkdirSync(outDir, { recursive: true });
  const cacheDir = join(outDir, ".cache");
  mkdirSync(cacheDir, { recursive: true });

  const manifestAssets: Array<{ id: string; name: string; file: string; footprint: number; w: number; h: number }> = [];

  for (const a of LIBRARY) {
    const file = `${a.id}.png`;
    const cachePath = join(cacheDir, `${a.id}.json`);
    let trimmed: { png: Buffer; w: number; h: number };
    if (existsSync(cachePath)) {
      console.log(`▸ ${a.id}: cached`);
      const c = JSON.parse(readFileSync(cachePath, "utf8")) as { b64: string; w: number; h: number };
      trimmed = { png: Buffer.from(c.b64, "base64"), w: c.w, h: c.h };
    } else {
      console.log(`▸ ${a.id}: generating "${a.prompt}"...`);
      const obj = await generateObject(client, { description: a.prompt, size: a.genSize });
      trimmed = await trim(Buffer.from(obj.pngBase64, "base64"));
      writeFileSync(cachePath, JSON.stringify({ b64: trimmed.png.toString("base64"), w: trimmed.w, h: trimmed.h }));
    }
    writeFileSync(join(outDir, file), trimmed.png);
    manifestAssets.push({ id: a.id, name: a.name, file, footprint: a.footprint, w: trimmed.w, h: trimmed.h });
  }

  writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ assets: manifestAssets }, null, 2));
  console.log(`▸ wrote ${outDir}/manifest.json (${manifestAssets.length} assets)`);

  // Bundle a transparent character for play-test (key out the gray backdrop).
  const charDir = resolve("app/public/character");
  mkdirSync(charDir, { recursive: true });
  const srcChar = resolve("output/knight");
  if (existsSync(join(srcChar, "spritesheet.png")) && existsSync(join(srcChar, "spritesheet.json"))) {
    const clean = await removeFlatBackground(readFileSync(join(srcChar, "spritesheet.png")));
    writeFileSync(join(charDir, "spritesheet.png"), clean);
    writeFileSync(join(charDir, "spritesheet.json"), readFileSync(join(srcChar, "spritesheet.json")));
    console.log(`▸ bundled character from ${srcChar}`);
  } else {
    console.log(`! no character at ${srcChar}; run \`npm run gen examples/knight.json\` then re-run \`npm run assets\``);
  }
}

main().catch((err) => {
  if (err instanceof PixelLabError) { console.error(`error: ${err.message}`); if (err.body) console.error(err.body.slice(0, 1000)); }
  else console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Generate the library**

Run: `npm run assets`
Expected: 10 PNGs + `manifest.json` in `app/public/assets/`, and `app/public/character/spritesheet.{png,json}` bundled. (Costs ~10 PixelLab generations; re-runs use the `.cache`.)

- [ ] **Step 5: Commit (assets + character are gitignored under `output/` but NOT under `app/public/` — commit them)**

```bash
git add src/asset-lib-cli.ts package.json app/public/assets app/public/character
git commit -m "feat: asset-lib CLI + generated starter library and character"
```

Note: confirm `app/public/` is not covered by `.gitignore` (only `output/` is). If a `.cache` dir was created under `app/public/assets/`, add `app/public/assets/.cache/` to `.gitignore` and do not commit it.

---

## Task 7: Browser asset loading (`app/src/assets.ts`)

**Files:**
- Create: `app/src/assets.ts`

- [ ] **Step 1: Write `app/src/assets.ts`**

```ts
// app/src/assets.ts
import { ImageSource } from "excalibur";
import { parseManifest, toAssetLookup, type AssetManifest, type AssetEntry } from "../../src/sheet/manifest-schema.js";
import type { AssetLookup } from "../../src/sheet/scene-collision.js";

export type LoadedLibrary = {
  manifest: AssetManifest;
  lookup: AssetLookup;
  images: Record<string, ImageSource>; // assetId -> ImageSource
  entry: (id: string) => AssetEntry;
};

/** Fetch /assets/manifest.json, validate it, and load every asset image. */
export async function loadLibrary(): Promise<LoadedLibrary> {
  const res = await fetch("/assets/manifest.json");
  if (!res.ok) throw new Error(`failed to load asset manifest: ${res.status}`);
  const manifest = parseManifest(await res.json());

  const images: Record<string, ImageSource> = {};
  for (const a of manifest.assets) images[a.id] = new ImageSource(`/assets/${a.file}`);
  await Promise.all(Object.values(images).map((img) => img.load()));

  const byId = new Map(manifest.assets.map((a) => [a.id, a]));
  return {
    manifest,
    lookup: toAssetLookup(manifest),
    images,
    entry: (id) => {
      const e = byId.get(id);
      if (!e) throw new Error(`unknown asset id: ${id}`);
      return e;
    },
  };
}
```

- [ ] **Step 2: Typecheck the app**

Run: `cd app && npm run build`
Expected: `tsc --noEmit` passes (vite build may warn about the unused module; that's fine). No type errors in `assets.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/src/assets.ts
git commit -m "feat(app): asset library loader"
```

---

## Task 8: Editor store (`app/src/store.ts`)

**Files:**
- Create: `app/src/store.ts`

- [ ] **Step 1: Write `app/src/store.ts`**

```ts
// app/src/store.ts
import type { Placement } from "../../src/sheet/scene-collision.js";

export type Mode = "edit" | "play";

export type EditorState = {
  mode: Mode;
  baseMapDataUrl: string | null;
  mapW: number;
  mapH: number;
  placements: Placement[];
  activeAssetId: string | null; // selected palette asset to place
  selectedIndex: number | null; // selected placed instance
  showCollision: boolean;
};

export function createStore() {
  const state: EditorState = {
    mode: "edit",
    baseMapDataUrl: null,
    mapW: 0,
    mapH: 0,
    placements: [],
    activeAssetId: null,
    selectedIndex: null,
    showCollision: false,
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    state,
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
    update(patch: Partial<EditorState>) { Object.assign(state, patch); emit(); },
    addPlacement(p: Placement) { state.placements.push(p); emit(); },
    movePlacement(i: number, x: number, y: number) { state.placements[i].x = x; state.placements[i].y = y; emit(); },
    removePlacement(i: number) { state.placements.splice(i, 1); state.selectedIndex = null; emit(); },
  };
}
export type Store = ReturnType<typeof createStore>;
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/src/store.ts
git commit -m "feat(app): editor state store"
```

---

## Task 9: Edit scene (`app/src/editor-scene.ts`)

Excalibur scene that renders the base map, the placed assets (y-sorted), a selection outline, and an optional collision overlay; handles place/move/delete via pointer + keyboard.

**Files:**
- Create: `app/src/editor-scene.ts`

- [ ] **Step 1: Write `app/src/editor-scene.ts`**

```ts
// app/src/editor-scene.ts
import { Scene, Actor, Vector, ImageSource, Color, Rectangle, Circle, Engine, Keys } from "excalibur";
import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";
import { colliders } from "../../src/sheet/scene-collision.js";

export class EditorScene extends Scene {
  private store: Store;
  private lib: LoadedLibrary;
  private baseActor: Actor | null = null;
  private placementActors: Actor[] = [];
  private overlayActors: Actor[] = [];

  constructor(store: Store, lib: LoadedLibrary) {
    super();
    this.store = store;
    this.lib = lib;
  }

  onInitialize(engine: Engine): void {
    // Place active asset on pointer down on empty space; select on a placed asset.
    engine.input.pointers.primary.on("down", (evt) => {
      if (this.store.state.mode !== "edit") return;
      const wp = evt.worldPos;
      const hit = this.hitTest(wp.x, wp.y);
      if (hit !== null) {
        this.store.update({ selectedIndex: hit });
      } else if (this.store.state.activeAssetId) {
        this.store.addPlacement({ assetId: this.store.state.activeAssetId, x: wp.x, y: wp.y });
      }
    });

    // Drag selected placement.
    engine.input.pointers.primary.on("move", (evt) => {
      if (this.store.state.mode !== "edit") return;
      const i = this.store.state.selectedIndex;
      if (i !== null && evt.nativeEvent instanceof MouseEvent && (evt.nativeEvent as MouseEvent).buttons === 1) {
        this.store.movePlacement(i, evt.worldPos.x, evt.worldPos.y);
      }
    });

    engine.input.keyboard.on("press", (evt) => {
      if (this.store.state.mode !== "edit") return;
      if ((evt.key === Keys.Delete || evt.key === Keys.Backspace) && this.store.state.selectedIndex !== null) {
        this.store.removePlacement(this.store.state.selectedIndex);
      }
    });

    // Wheel zoom.
    engine.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const cam = this.camera;
      cam.zoom = Math.max(0.5, Math.min(8, cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    }, { passive: false });

    // Middle-mouse drag to pan (so large maps are reachable under zoom).
    let panning = false;
    let last = { x: 0, y: 0 };
    engine.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 1) { panning = true; last = { x: e.clientX, y: e.clientY }; e.preventDefault(); }
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 1) panning = false; });
    window.addEventListener("mousemove", (e) => {
      if (!panning) return;
      const dx = (e.clientX - last.x) / this.camera.zoom;
      const dy = (e.clientY - last.y) / this.camera.zoom;
      this.camera.pos = new Vector(this.camera.pos.x - dx, this.camera.pos.y - dy);
      last = { x: e.clientX, y: e.clientY };
    });

    this.store.subscribe(() => this.rebuild());
    this.rebuild();
  }

  /** Returns the index of the topmost placement under (x,y), or null. */
  private hitTest(x: number, y: number): number | null {
    const ps = this.store.state.placements;
    for (let i = ps.length - 1; i >= 0; i--) {
      const e = this.lib.entry(ps[i].assetId);
      const left = ps[i].x - e.w / 2, top = ps[i].y - e.h;
      if (x >= left && x <= left + e.w && y >= top && y <= top + e.h) return i;
    }
    return null;
  }

  /** Rebuild all actors from store state (simple + correct for this scale). */
  private rebuild(): void {
    const s = this.store.state;

    // Base map.
    if (this.baseActor) { this.baseActor.kill(); this.baseActor = null; }
    if (s.baseMapDataUrl) {
      const img = new ImageSource(s.baseMapDataUrl);
      const actor = new Actor({ pos: new Vector(0, 0), anchor: new Vector(0, 0), z: -100000 });
      img.load().then(() => actor.graphics.use(img.toSprite()));
      this.add(actor);
      this.baseActor = actor;
    }

    // Placed assets (y-sorted by feet via z).
    for (const a of this.placementActors) a.kill();
    this.placementActors = [];
    s.placements.forEach((p, i) => {
      const e = this.lib.entry(p.assetId);
      const actor = new Actor({ pos: new Vector(p.x, p.y), anchor: new Vector(0.5, 1), z: p.y });
      const sprite = this.lib.images[p.assetId].toSprite();
      sprite.destSize = { width: e.w, height: e.h };
      actor.graphics.use(sprite);
      if (i === s.selectedIndex) {
        const outline = new Rectangle({ width: e.w, height: e.h, color: Color.Transparent, strokeColor: Color.fromHex("#4af"), lineWidth: 2 });
        actor.graphics.layers.create({ name: "sel", order: 1 }).use(outline, { offset: new Vector(0, -e.h / 2) });
      }
      this.add(actor);
      this.placementActors[i] = actor;
    });

    // Collision overlay: one translucent-red ellipse actor per collider.
    // (A Circle graphic scaled on Y becomes an ellipse — version-stable, no
    // low-level draw hooks.) Tracked in `overlayActors` so we can clear them.
    for (const a of this.overlayActors) a.kill();
    this.overlayActors = [];
    if (s.showCollision) {
      for (const c of colliders(s.placements, this.lib.lookup)) {
        const a = new Actor({ pos: new Vector(c.cx, c.cy), z: 99999 });
        a.graphics.use(new Circle({ radius: c.rx, color: Color.fromRGB(255, 0, 0, 0.3) }));
        a.scale = new Vector(1, c.ry / c.rx);
        this.add(a);
        this.overlayActors.push(a);
      }
    }
  }
}
```

- [ ] **Step 2: Note for the implementer — Excalibur API checks**

This scene uses a few Excalibur APIs whose exact names can differ slightly by 0.30.x patch: `sprite.destSize`, `graphics.layers.create(...)`, and the pointer `evt.worldPos`. When `tsc` (Step 3) flags any, consult the installed `excalibur` types and adjust (e.g. set sprite size via `sprite.width/height`, or draw the selection outline as a child `Actor`). The collision *data* (`colliders(...)`) and the per-collider ellipse overlay are version-stable; keep those as written.

- [ ] **Step 3: Verify in the browser (after Task 15 wires it up)**

This scene is exercised end-to-end in Task 15's verification. For now just typecheck:

Run: `cd app && npm run build`
Expected: passes (resolve any API mismatch flagged by `tsc` against the installed Excalibur types).

- [ ] **Step 4: Commit**

```bash
git add app/src/editor-scene.ts
git commit -m "feat(app): edit scene (place/move/delete, y-sort, collision overlay)"
```

---

## Task 10: Palette UI (`app/src/palette.ts`)

**Files:**
- Create: `app/src/palette.ts`

- [ ] **Step 1: Write `app/src/palette.ts`**

```ts
// app/src/palette.ts
import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";

/** Render the DOM palette of assets; clicking sets the active asset to place. */
export function mountPalette(container: HTMLElement, store: Store, lib: LoadedLibrary): void {
  container.innerHTML = "";
  const items: Record<string, HTMLElement> = {};
  for (const a of lib.manifest.assets) {
    const el = document.createElement("div");
    el.className = "pal-item";
    el.innerHTML = `<img src="/assets/${a.file}" alt="${a.name}"><div>${a.name}</div>`;
    el.addEventListener("click", () => store.update({ activeAssetId: a.id }));
    container.appendChild(el);
    items[a.id] = el;
  }
  const refresh = () => {
    for (const [id, el] of Object.entries(items)) el.classList.toggle("active", store.state.activeAssetId === id);
  };
  store.subscribe(refresh);
  refresh();
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/src/palette.ts
git commit -m "feat(app): DOM asset palette"
```

---

## Task 11: Toolbar UI (`app/src/toolbar.ts`)

**Files:**
- Create: `app/src/toolbar.ts`

- [ ] **Step 1: Write `app/src/toolbar.ts`**

```ts
// app/src/toolbar.ts
import type { Store } from "./store.js";

export type ToolbarHandlers = {
  onLoadMap: (file: File) => void;
  onLoadProject: (file: File) => void;
  onExportCollision: () => void;
  onExportComposite: () => void;
  onExportProject: () => void;
};

/** Build the toolbar: load map/project, mode toggle, collision overlay, exports. */
export function mountToolbar(container: HTMLElement, store: Store, h: ToolbarHandlers): void {
  container.innerHTML = "";

  const fileButton = (label: string, accept: string, cb: (f: File) => void) => {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => { if (input.files?.[0]) cb(input.files[0]); input.value = ""; });
    wrap.appendChild(input);
    container.appendChild(wrap);
  };

  const button = (label: string, cb: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", cb);
    container.appendChild(b);
    return b;
  };

  fileButton("Load Map", "image/png,image/*", h.onLoadMap);
  fileButton("Load Project", "application/json,.json", h.onLoadProject);

  const modeBtn = button("Mode: Edit", () => store.update({ mode: store.state.mode === "edit" ? "play" : "edit", selectedIndex: null }));
  const collBtn = button("Collision: off", () => store.update({ showCollision: !store.state.showCollision }));

  button("Export Collision", h.onExportCollision);
  button("Export Map PNG", h.onExportComposite);
  button("Export Project", h.onExportProject);

  const refresh = () => {
    modeBtn.textContent = `Mode: ${store.state.mode === "edit" ? "Edit" : "Play"}`;
    modeBtn.classList.toggle("active", store.state.mode === "play");
    collBtn.textContent = `Collision: ${store.state.showCollision ? "on" : "off"}`;
    collBtn.classList.toggle("active", store.state.showCollision);
  };
  store.subscribe(refresh);
  refresh();
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/src/toolbar.ts
git commit -m "feat(app): DOM toolbar (load, mode, exports)"
```

---

## Task 12: Collision + composite rasterization (`app/src/collision-canvas.ts`)

**Files:**
- Create: `app/src/collision-canvas.ts`

- [ ] **Step 1: Write `app/src/collision-canvas.ts`**

```ts
// app/src/collision-canvas.ts
import type { Ellipse } from "../../src/sheet/footprint.js";
import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";
import { colliders } from "../../src/sheet/scene-collision.js";

function newCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

function drawEllipse(ctx: CanvasRenderingContext2D, e: Ellipse, fill: string): void {
  ctx.beginPath();
  ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Black/white collision mask PNG (white = blocked). */
export async function collisionMaskBlob(store: Store, lib: LoadedLibrary): Promise<Blob> {
  const { mapW, mapH, placements } = store.state;
  const { c, ctx } = newCanvas(mapW, mapH);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, mapW, mapH);
  for (const e of colliders(placements, lib.lookup)) drawEllipse(ctx, e, "#fff");
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
}

/** Composited map PNG: base map + all placed assets flattened. */
export async function compositeBlob(store: Store, lib: LoadedLibrary): Promise<Blob> {
  const { mapW, mapH, baseMapDataUrl, placements } = store.state;
  const { c, ctx } = newCanvas(mapW, mapH);
  if (baseMapDataUrl) {
    const base = new Image();
    base.src = baseMapDataUrl;
    await base.decode();
    ctx.drawImage(base, 0, 0, mapW, mapH);
  }
  // y-sort so overlaps composite correctly.
  const sorted = [...placements].sort((a, b) => a.y - b.y);
  for (const p of sorted) {
    const e = lib.entry(p.assetId);
    const img = new Image();
    img.src = `/assets/${e.file}`;
    await img.decode();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, p.x - e.w / 2, p.y - e.h, e.w, e.h);
  }
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/src/collision-canvas.ts
git commit -m "feat(app): canvas rasterization of collision mask + composite"
```

---

## Task 13: Exporters + project IO (`app/src/exporters.ts`)

**Files:**
- Create: `app/src/exporters.ts`

- [ ] **Step 1: Write `app/src/exporters.ts`**

```ts
// app/src/exporters.ts
import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";
import { buildCollisionExport } from "../../src/sheet/scene-collision.js";
import { serializeProject, parseProject, type Project } from "../../src/sheet/project-model.js";
import { collisionMaskBlob, compositeBlob } from "./collision-canvas.js";

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportCollision(store: Store, lib: LoadedLibrary): Promise<void> {
  const { mapW, mapH, placements } = store.state;
  const json = buildCollisionExport(mapW, mapH, placements, lib.lookup);
  download("collision.json", new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
  download("collision.png", await collisionMaskBlob(store, lib));
}

export async function exportComposite(store: Store, lib: LoadedLibrary): Promise<void> {
  download("map-composited.png", await compositeBlob(store, lib));
}

export function exportProject(store: Store): void {
  const { baseMapDataUrl, mapW, mapH, placements } = store.state;
  if (!baseMapDataUrl) { alert("Load a base map first."); return; }
  const project: Project = { baseMap: baseMapDataUrl, mapW, mapH, placements };
  download("project.json", new Blob([serializeProject(project)], { type: "application/json" }));
}

export async function loadProjectFile(store: Store, file: File): Promise<void> {
  const project = parseProject(await file.text());
  store.update({
    baseMapDataUrl: project.baseMap,
    mapW: project.mapW,
    mapH: project.mapH,
    placements: project.placements,
    selectedIndex: null,
  });
}

/** Read an image File into a data URL + its pixel dimensions. */
export async function readMapFile(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const dataUrl = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { dataUrl, w: img.naturalWidth, h: img.naturalHeight };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/src/exporters.ts
git commit -m "feat(app): exporters (collision, composite, project) + map/project IO"
```

---

## Task 14: Play scene (`app/src/play-scene.ts`)

Port the proven movement + collision sampling from `src/game/template.html` to a TypeScript Excalibur scene that samples the live colliders.

**Files:**
- Create: `app/src/play-scene.ts`

- [ ] **Step 1: Write `app/src/play-scene.ts`**

```ts
// app/src/play-scene.ts
import { Scene, Actor, Vector, ImageSource, SpriteSheet, Animation, Engine, Keys } from "excalibur";
import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";
import { colliders, isSolid, type AssetLookup } from "../../src/sheet/scene-collision.js";
import type { Ellipse } from "../../src/sheet/footprint.js";

type Manifest = {
  frameSize: number; columns: number; rows: number; directions: string[];
  actions: Record<string, { frameCount: number; durationMs: number; rowByDirection: Record<string, number> }>;
};

const SECTORS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
const CHAR_SCALE = 0.9, SPEED = 70, ZOOM = 2;

export class PlayScene extends Scene {
  private store: Store;
  private lib: LoadedLibrary;
  private charImage = new ImageSource("/character/spritesheet.png");
  private manifest: Manifest | null = null;
  private player: Actor | null = null;
  private ellipses: Ellipse[] = [];
  private anims: Record<string, Record<string, Animation>> = {};
  private facing = "south";
  private footY = 0;

  constructor(store: Store, lib: LoadedLibrary) { super(); this.store = store; this.lib = lib; }

  async onActivate(): Promise<void> {
    // Build colliders fresh from current placements each time we enter Play.
    this.ellipses = colliders(this.store.state.placements, this.lib.lookup);
    if (!this.manifest) {
      this.manifest = await (await fetch("/character/spritesheet.json")).json();
      await this.charImage.load();
      this.buildPlayer();
    } else if (this.player) {
      this.player.pos = new Vector(this.store.state.mapW / 2, this.store.state.mapH / 2);
    }
    // Re-add the base map + props as static visuals (y-sorted) so the world looks right.
    this.rebuildVisuals();
  }

  private rebuildVisuals(): void {
    this.clear(); // remove previous actors
    const s = this.store.state;
    if (s.baseMapDataUrl) {
      const img = new ImageSource(s.baseMapDataUrl);
      const a = new Actor({ pos: new Vector(0, 0), anchor: new Vector(0, 0), z: -100000 });
      img.load().then(() => a.graphics.use(img.toSprite()));
      this.add(a);
    }
    for (const p of s.placements) {
      const e = this.lib.entry(p.assetId);
      const a = new Actor({ pos: new Vector(p.x, p.y), anchor: new Vector(0.5, 1), z: p.y });
      const sprite = this.lib.images[p.assetId].toSprite();
      sprite.destSize = { width: e.w, height: e.h };
      a.graphics.use(sprite);
      this.add(a);
    }
    if (this.player) this.add(this.player);
  }

  private buildPlayer(): void {
    const m = this.manifest!;
    const sheet = SpriteSheet.fromImageSource({
      image: this.charImage,
      grid: { columns: m.columns, rows: m.rows, spriteWidth: m.frameSize, spriteHeight: m.frameSize },
    });
    const walkName = m.actions.walk ? "walk" : Object.keys(m.actions)[0];
    const idleName = m.actions.idle ? "idle" : walkName;
    const build = (action: string, dir: string) => {
      const act = m.actions[action];
      const row = act.rowByDirection[dir] ?? act.rowByDirection[m.directions[0]];
      const frames = [];
      for (let c = 0; c < act.frameCount; c++) frames.push({ graphic: sheet.getSprite(c, row), duration: act.durationMs });
      const anim = new Animation({ frames });
      anim.scale = new Vector(CHAR_SCALE, CHAR_SCALE);
      return anim;
    };
    for (const dir of m.directions) this.anims[dir] = { walk: build(walkName, dir), idle: build(idleName, dir) };
    this.footY = m.frameSize * CHAR_SCALE * 0.25;
    this.facing = m.directions.includes("south") ? "south" : m.directions[0];
    const player = new Actor({ pos: new Vector(this.store.state.mapW / 2, this.store.state.mapH / 2), z: 0 });
    player.graphics.use(this.anims[this.facing].idle);
    this.player = player;
  }

  onInitialize(_engine: Engine): void { this.camera.zoom = ZOOM; }

  onPreUpdate(engine: Engine, deltaMs: number): void {
    if (this.store.state.mode !== "play" || !this.player) return;
    const kb = engine.input.keyboard;
    const dt = deltaMs / 1000;
    let vx = 0, vy = 0;
    if (kb.isHeld(Keys.A) || kb.isHeld(Keys.Left)) vx -= 1;
    if (kb.isHeld(Keys.D) || kb.isHeld(Keys.Right)) vx += 1;
    if (kb.isHeld(Keys.W) || kb.isHeld(Keys.Up)) vy -= 1;
    if (kb.isHeld(Keys.S) || kb.isHeld(Keys.Down)) vy += 1;
    const moving = vx !== 0 || vy !== 0;
    const p = this.player;
    if (moving) {
      const len = Math.hypot(vx, vy), step = SPEED * dt;
      const nx = Math.max(0, Math.min(this.store.state.mapW, p.pos.x + (vx / len) * step));
      const ny = Math.max(0, Math.min(this.store.state.mapH, p.pos.y + (vy / len) * step));
      if (!isSolid(this.ellipses, nx, p.pos.y + this.footY)) p.pos.x = nx;
      if (!isSolid(this.ellipses, p.pos.x, ny + this.footY)) p.pos.y = ny;
      this.facing = this.dirFromVec(vx, vy);
    }
    p.graphics.use(this.anims[this.facing][moving ? "walk" : "idle"]);
    p.z = p.pos.y + this.footY;
    this.camera.pos = p.pos.clone();
  }

  private dirFromVec(vx: number, vy: number): string {
    let deg = (Math.atan2(vy, vx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const want = SECTORS[Math.round(deg / 45) % 8];
    return this.manifest!.directions.includes(want) ? want : this.manifest!.directions[0];
  }
}

export type { AssetLookup };
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run build`
Expected: passes (reconcile any Excalibur API differences flagged by `tsc`, e.g. `Scene.clear()` vs removing actors individually).

- [ ] **Step 3: Commit**

```bash
git add app/src/play-scene.ts
git commit -m "feat(app): play-test scene (walk + collision sampling + y-sort)"
```

---

## Task 15: Wire everything together (`app/src/main.ts`)

**Files:**
- Modify: `app/src/main.ts` (replace the Task 5 smoke bootstrap)

- [ ] **Step 1: Replace `app/src/main.ts`**

```ts
// app/src/main.ts
import { Engine, Color } from "excalibur";
import { loadLibrary } from "./assets.js";
import { createStore } from "./store.js";
import { EditorScene } from "./editor-scene.js";
import { PlayScene } from "./play-scene.js";
import { mountPalette } from "./palette.js";
import { mountToolbar } from "./toolbar.js";
import { exportCollision, exportComposite, exportProject, loadProjectFile, readMapFile } from "./exporters.js";

const lib = await loadLibrary();
const store = createStore();

const game = new Engine({
  canvasElementId: "game",
  width: 960,
  height: 640,
  backgroundColor: Color.fromHex("#0c0c0c"),
  antialiasing: false,
  pixelArt: true,
});

const editor = new EditorScene(store, lib);
const play = new PlayScene(store, lib);
game.addScene("edit", editor);
game.addScene("play", play);
await game.start();
game.goToScene("edit");

// Switch scenes when the mode changes.
store.subscribe(() => {
  const target = store.state.mode === "play" ? "play" : "edit";
  if (game.currentSceneName !== target) game.goToScene(target);
});

mountPalette(document.getElementById("palette")!, store, lib);
mountToolbar(document.getElementById("toolbar")!, store, {
  onLoadMap: async (file) => {
    const { dataUrl, w, h } = await readMapFile(file);
    store.update({ baseMapDataUrl: dataUrl, mapW: w, mapH: h, placements: store.state.placements });
    document.getElementById("hint")!.textContent = `Map ${w}×${h}. Pick an asset and click to place. Delete removes. Toggle Mode to play-test.`;
  },
  onLoadProject: (file) => loadProjectFile(store, file),
  onExportCollision: () => exportCollision(store, lib),
  onExportComposite: () => exportComposite(store, lib),
  onExportProject: () => exportProject(store),
});
```

- [ ] **Step 2: Build + run the dev server**

Run:
```bash
cd app && npm run build && npm run dev
```
Expected: build passes; dev server starts.

- [ ] **Step 3: Manual verification checklist (in the browser)**

Open `http://localhost:5173` and confirm:
- Palette shows the 10 assets with thumbnails.
- "Load Map" → pick `output/map-demo/map.png` (or any PNG) → it appears as the background.
- Click an asset, then click the map → the asset drops with its feet at the cursor.
- Click a placed asset → outline appears; drag → it moves; `Delete` → it's removed.
- "Collision: on" → red footprint ellipses appear at asset bases (pond fills, tree small base).
- Wheel zooms.
- "Mode: Play" → the knight appears; WASD walks it; it is blocked by placed solid assets, walks behind tall ones, and over the base map freely. "Mode: Edit" returns with placements intact.
- "Export Collision" downloads `collision.json` + `collision.png`; "Export Map PNG" downloads the composite; "Export Project" downloads `project.json`.
- "Load Project" with the exported `project.json` restores the scene.

Fix any issues found (most likely Excalibur API mismatches in the scenes) and re-verify.

- [ ] **Step 4: Commit**

```bash
git add app/src/main.ts
git commit -m "feat(app): wire scenes, palette, toolbar, exports"
```

---

## Task 16: Headless collision sim test (`tests/sheet/collision-sim.test.ts`)

A Node test (no browser) that walks a virtual player into colliders using the same `isSolid` used by the Play scene — guards the collision behavior in CI.

**Files:**
- Create: `tests/sheet/collision-sim.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/sheet/collision-sim.test.ts
import { describe, it, expect } from "vitest";
import { colliders, isSolid } from "../../src/sheet/scene-collision.js";

const lookup = { rock: { w: 60, h: 60, footprint: 1.0 } };
// one solid rock centered at feet (200,200): footprint 1.0 => ellipse rx=30, ry=30, cy=170
const ellipses = colliders([{ assetId: "rock", x: 200, y: 200 }], lookup);

const FOOT = 64 * 0.9 * 0.25;
function walk(dx: number, dy: number, sx: number, sy: number, steps = 600): { x: number; y: number } {
  let x = sx, y = sy;
  const dt = 1 / 60, SPEED = 70;
  for (let i = 0; i < steps; i++) {
    const len = Math.hypot(dx, dy), step = SPEED * dt;
    const nx = x + (dx / len) * step, ny = y + (dy / len) * step;
    if (!isSolid(ellipses, nx, y + FOOT)) x = nx;
    if (!isSolid(ellipses, x, ny + FOOT)) y = ny;
  }
  return { x, y };
}

describe("collision sim", () => {
  it("blocks a player walking into a solid rock", () => {
    const end = walk(0, 1, 200, 100); // walk south toward the rock from above
    expect(end.y).toBeLessThan(170); // stopped before the ellipse (cy=170)
  });
  it("lets a player cross open space", () => {
    const end = walk(1, 0, 400, 400, 300); // far from the rock
    expect(end.x).toBeGreaterThan(400 + 100); // moved freely
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/sheet/collision-sim.test.ts`
Expected: PASS.

- [ ] **Step 3: Full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all suites pass.

- [ ] **Step 4: Commit**

```bash
git add tests/sheet/collision-sim.test.ts
git commit -m "test: headless collision sim for placed colliders"
```

---

## Done

The app is complete: load a base map, place/move/delete pre-defined assets, see + export generated collision (JSON + mask PNG), export a composited map and a re-loadable project, and play-test by walking the character with collision + y-sort. Pure logic is unit-tested and shared with the CLI.
