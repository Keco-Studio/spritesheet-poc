# Agent-Friendly Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo legible and safe for an LLM agent — add an entry point + captured PixelLab knowledge, and turn the implicit pure/Node split into an explicit, test-enforced `src/core/` boundary.

**Architecture:** Four tasks. (1) Add `CLAUDE.md`, `README.md`, `docs/pixellab-notes.md` — no code change. (2) Move the four pure modules `src/sheet/*` → `src/core/*` and rewrite every importer. (3) Add a vitest guard that fails if any `src/core/` file imports Node/`sharp`. (4) Split the 317-line `src/buildmap-cli.ts` into `src/buildmap/{spec,build-sprite,build-inpaint}.ts` + a thin CLI. No behavior changes.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), `tsx` CLIs, `sharp`, `zod`, `vitest`, Vite + Excalibur (the `app/`).

**Verification gates used throughout:**
- `npm run typecheck` → `tsc --noEmit`, expect no errors.
- `npm test` → `vitest run`, expect all suites pass.
- `cd app && npm run build` → `tsc --noEmit && vite build`, expect success (proves the app's cross-imports resolve and bundle).
- `npm run buildmap examples/grass-map.json` → reuses the per-spec cache (no `PIXELLAB_API_KEY` needed), expect it to emit the game without API calls.

---

## Task 1: Context layer (docs only)

No code, no behavior. Three files an agent reads on entry. Verify by content, then commit.

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`
- Create: `docs/pixellab-notes.md`

- [ ] **Step 1: Create `docs/pixellab-notes.md`** (captured tribal knowledge — currently only in personal memory)

````markdown
# PixelLab API Notes

Hard-won behavior of the PixelLab v2 API (`https://api.pixellab.ai/v2`), as used by
this repo. Client: `src/pixellab/client.ts` (`createClient(apiKey)` → `{post, get}`;
throws `PixelLabError` on non-2xx).

## Endpoints

### `/create-image-pixflux` — `src/pixellab/map.ts`, `src/pixellab/object.ts`
- **Synchronous.** One POST returns the finished image inline.
- Image comes back as **base64 PNG** (strip any `data:image/png;base64,` prefix).
- **Size cap: ≤ 400px** per side.
- `object.ts` passes `no_background: true` for transparent sprites, then runs
  `removeFlatBackground` as a safety net.

### `/create-tileset` — `src/pixellab/tileset.ts`
- **Asynchronous.** Poll the job; it resolves when `last_response.type === "message_done"`
  (the `status` field never flips to `"completed"`, so do **not** use a generic
  `waitForJob` that waits on `status`).
- Returns **raw RGBA bytes**, decoded with
  `sharp(buf, { raw: { width, height, channels: 4 } }).png()`.

### `/inpaint` — `src/pixellab/inpaint.ts`
- **Synchronous.**
- **Size cap: ≤ 200px** per side (tighter than pixflux). Callers must guard this.
- `text_guidance_scale`: **max 10** (16 → HTTP 422). The default of 3 is too low for
  discrete objects — **use 8**.
- Mask: **white = regenerate**, black = keep.
- **Name the background in the prompt** (e.g. `"...on a green grass background, top-down"`)
  or the box fills with a dark backdrop instead of blending into the map.

## Gotcha: baked gray backdrop on characters/animations
PixelLab bakes a **flat opaque gray `(128,128,128)`** backdrop into character and
animation frames (it is not transparent). `src/sheet/transparency.ts`
`removeFlatBackground()` removes it with a border BFS flood-fill: it samples the
corner color and clears alpha only on the connected border region, so interior
shadow grays are preserved.
````

- [ ] **Step 2: Create `README.md`** (human-facing overview + quickstart)

````markdown
# sheet-poc

Pixel-art game-asset tooling built on the PixelLab API and Excalibur.js. Generates
sprite sheets, maps, and tilesets; composes a walkable top-down scene with
collision; and includes a browser editor for placing assets and generating
collision.

## Setup

```bash
npm install
echo "PIXELLAB_API_KEY=sk-..." > .env   # required for generation; cached runs work offline
```

## CLIs (root, run with `tsx`)

| Command | What it does |
| --- | --- |
| `npm run gen <spec.json>` | Generate a character sprite sheet. |
| `npm run map <spec.json>` | Generate a map + drop a WASD-walkable character into it. |
| `npm run buildmap <spec.json>` | Spec-driven world builder (objects + footprint collision + y-sort). Per-spec cache; re-runs cost no credits. |
| `npm run assets` | Generate the fixed asset library into `app/public/assets/`. |
| `npm run tileset <spec.json>` | Tileset editor/generator. |
| `npm test` | Run the vitest suite. |
| `npm run typecheck` | `tsc --noEmit`. |

Example specs live in `examples/`.

## Browser editor (`app/`)

A Vite app: load a base map, place library assets, see live footprint collision,
play-test (walk the knight), and export collision JSON+PNG, a composited map, and a
re-loadable project.

```bash
cd app
npm install
npm run dev      # editor at the printed localhost URL
npm run build    # tsc --noEmit && vite build
```

## Layout

See `CLAUDE.md` for the full directory map and invariants. In short:
`src/core/` (pure, browser-safe) · `src/sheet/` (Node-only imaging) ·
`src/pixellab/` (API) · `src/game|editor|preview/` (HTML emitters) · `app/` (editor).
````

- [ ] **Step 3: Create `CLAUDE.md`** (agent entry point — a map, not a manual)

````markdown
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
````

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md docs/pixellab-notes.md
git commit -m "docs: add CLAUDE.md, README, and PixelLab API notes"
```

---

## Task 2: Extract pure core into `src/core/`

Move the four pure modules out of `src/sheet/` and rewrite every importer. `git mv`
preserves history. After this task, `src/core/` = browser-safe, `src/sheet/` =
Node-only. **Only `mask.ts`, `buildmap-cli.ts`, the six `app/src` files, `app/tsconfig.json`,
and five test files import these modules** — `asset-lib-cli.ts` and `map-cli.ts` only
import `transparency` (which stays in `src/sheet/`), so they are NOT touched.

**Files:**
- Move: `src/sheet/footprint.ts` → `src/core/footprint.ts`
- Move: `src/sheet/scene-collision.ts` → `src/core/scene-collision.ts`
- Move: `src/sheet/manifest-schema.ts` → `src/core/manifest-schema.ts`
- Move: `src/sheet/project-model.ts` → `src/core/project-model.ts`
- Modify: `src/sheet/mask.ts:2`
- Modify: `src/buildmap-cli.ts:12`
- Modify: `app/src/assets.ts:2-3`, `app/src/collision-canvas.ts:1,4`, `app/src/editor-scene.ts:4`, `app/src/exporters.ts:3-4`, `app/src/play-scene.ts:5-6`, `app/src/store.ts:1`
- Modify: `app/tsconfig.json` (`include`)
- Move: `tests/sheet/{footprint,scene-collision,manifest-schema,project-model,collision-sim}.test.ts` → `tests/core/`, updating their import paths

- [ ] **Step 1: Move the four modules with `git mv`**

```bash
mkdir -p src/core
git mv src/sheet/footprint.ts src/core/footprint.ts
git mv src/sheet/scene-collision.ts src/core/scene-collision.ts
git mv src/sheet/manifest-schema.ts src/core/manifest-schema.ts
git mv src/sheet/project-model.ts src/core/project-model.ts
```

The four files' **internal** imports are already relative within the set
(`scene-collision.ts` → `./footprint.js`, `manifest-schema.ts` → `./scene-collision.js`),
so they stay correct after moving together. No edits inside the moved files.

- [ ] **Step 2: Fix `src/sheet/mask.ts` Rect import**

In `src/sheet/mask.ts`, line 2 currently reads:

```ts
import type { Rect } from "./footprint.js";
```

Change it to:

```ts
import type { Rect } from "../core/footprint.js";
```

- [ ] **Step 3: Fix `src/buildmap-cli.ts` footprint import**

In `src/buildmap-cli.ts`, line 12 currently reads:

```ts
import { footprintEllipse } from "./sheet/footprint.js";
```

Change it to:

```ts
import { footprintEllipse } from "./core/footprint.js";
```

(This import is removed entirely in Task 4 when `buildSprite` moves out, but keep the
repo green between tasks.)

- [ ] **Step 4: Fix the six `app/src` import paths**

Replace `../../src/sheet/` with `../../src/core/` in these import lines:

`app/src/assets.ts`:
```ts
import { parseManifest, toAssetLookup, type AssetManifest, type AssetEntry } from "../../src/core/manifest-schema.js";
import type { AssetLookup } from "../../src/core/scene-collision.js";
```
`app/src/collision-canvas.ts`:
```ts
import type { Ellipse } from "../../src/core/footprint.js";
import { colliders } from "../../src/core/scene-collision.js";
```
`app/src/editor-scene.ts`:
```ts
import { colliders } from "../../src/core/scene-collision.js";
```
`app/src/exporters.ts`:
```ts
import { buildCollisionExport } from "../../src/core/scene-collision.js";
import { serializeProject, parseProject, type Project } from "../../src/core/project-model.js";
```
`app/src/play-scene.ts`:
```ts
import { colliders, isSolid } from "../../src/core/scene-collision.js";
import type { Ellipse } from "../../src/core/footprint.js";
```
`app/src/store.ts`:
```ts
import type { Placement } from "../../src/core/scene-collision.js";
```

- [ ] **Step 5: Point `app/tsconfig.json` at the new dir**

`app/tsconfig.json` currently ends with:

```json
  "include": ["src", "../src/sheet"]
```

Change it to:

```json
  "include": ["src", "../src/core"]
```

(The app no longer imports anything from `../src/sheet`; it only needs `../src/core`.)

- [ ] **Step 6: Relocate the five tests and fix their import paths**

```bash
mkdir -p tests/core
git mv tests/sheet/footprint.test.ts tests/core/footprint.test.ts
git mv tests/sheet/scene-collision.test.ts tests/core/scene-collision.test.ts
git mv tests/sheet/manifest-schema.test.ts tests/core/manifest-schema.test.ts
git mv tests/sheet/project-model.test.ts tests/core/project-model.test.ts
git mv tests/sheet/collision-sim.test.ts tests/core/collision-sim.test.ts
```

In each moved file, change the import source from `../../src/sheet/<name>.js` to
`../../src/core/<name>.js` (depth is unchanged — `tests/core/` is the same level as
`tests/sheet/`). Specifically:
- `tests/core/footprint.test.ts`: `../../src/core/footprint.js`
- `tests/core/scene-collision.test.ts`: `../../src/core/scene-collision.js`
- `tests/core/manifest-schema.test.ts`: `../../src/core/manifest-schema.js`
- `tests/core/project-model.test.ts`: `../../src/core/project-model.js`
- `tests/core/collision-sim.test.ts`: `../../src/core/scene-collision.js`

- [ ] **Step 7: Typecheck the root**

Run: `npm run typecheck`
Expected: no errors (all moved-module importers now resolve).

- [ ] **Step 8: Run the test suite**

Run: `npm test`
Expected: all suites pass, including the relocated `tests/core/*` files.

- [ ] **Step 9: Build the app**

Run: `cd app && npm install && npm run build && cd ..`
Expected: `tsc --noEmit` clean and `vite build` succeeds — proves the app's
`../../src/core/*` imports resolve and bundle.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: extract pure browser-safe modules into src/core/"
```

---

## Task 3: Enforce the boundary with a guard test

A vitest test that reads every file in `src/core/` and fails if any imports
`node:*`, `fs`, `sharp`, or uses `require(`. This makes the pure boundary a failing
test rather than a convention.

**Files:**
- Create: `tests/core/no-node-imports.test.ts`

- [ ] **Step 1: Write the guard test**

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CORE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "core");

// Patterns that would pull a Node/sharp dependency into a browser-bundled file.
const FORBIDDEN: Array<[string, RegExp]> = [
  ["node: import", /from\s+["']node:/],
  ["fs import", /from\s+["']fs["']/],
  ["sharp import", /from\s+["']sharp["']/],
  ["require()", /\brequire\s*\(/],
];

describe("src/core stays browser-safe", () => {
  const files = readdirSync(CORE_DIR).filter((f) => f.endsWith(".ts"));

  it("finds core files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} has no Node/sharp imports`, () => {
      const src = readFileSync(join(CORE_DIR, file), "utf8");
      for (const [label, pattern] of FORBIDDEN) {
        expect(pattern.test(src), `${file} must not contain a ${label}`).toBe(false);
      }
    });
  }
});
```

- [ ] **Step 2: Run the guard — expect PASS**

Run: `npm test -- no-node-imports`
Expected: PASS (the four core files import only `zod` and each other).

- [ ] **Step 3: Prove the guard actually catches a leak**

Temporarily add this line to the top of `src/core/footprint.ts`:

```ts
import { readFileSync } from "node:fs";
```

Run: `npm test -- no-node-imports`
Expected: FAIL on `footprint.ts has no Node/sharp imports` ("must not contain a node: import").

Then **remove** that line again and re-run:

Run: `npm test -- no-node-imports`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/core/no-node-imports.test.ts
git commit -m "test: guard that src/core stays free of Node/sharp imports"
```

---

## Task 4: Split `src/buildmap-cli.ts`

Pull the spec schema + helpers, the sprite builder, and the inpaint builder into
`src/buildmap/`. The CLI keeps only arg parsing, character loading, caching, and
orchestration. **Behavior is identical** — same functions, same order. The one
substitution: `buildInpaint`'s size guard used the CLI-local `die()`; in the module
it `throw`s instead, and `main()`'s existing `catch` prints the message and exits 1
(same user-visible result).

**Files:**
- Create: `src/buildmap/spec.ts`
- Create: `src/buildmap/build-sprite.ts`
- Create: `src/buildmap/build-inpaint.ts`
- Modify: `src/buildmap-cli.ts` (slim down to orchestration)

- [ ] **Step 1: Create `src/buildmap/spec.ts`**

```ts
import { z } from "zod";
import type { Rect } from "../core/footprint.js";

// ---- spec schema -----------------------------------------------------------
const FeatureSchema = z.object({
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]), // [x, y, w, h]
  prompt: z.string().min(1),
  collides: z.boolean().optional().default(true),
  /** Inpaint text-guidance strength; higher = more literal object. Default 7. */
  guidance: z.number().optional(),
  /** Fraction of the object's HEIGHT (from the bottom) that is solid — the base
   * footprint. 0.4 suits tall props (tree trunk/rock base, walk behind the top);
   * use 1.0 for flat props like water that block fully. */
  footprint: z.number().min(0.05).max(1).optional().default(0.4),
});
export const SpecSchema = z.object({
  base: z.string().min(1), // base terrain prompt, e.g. "flat green grass field, top-down"
  size: z.number().int().min(16).max(400).optional().default(256), // pixflux range
  seed: z.number().int().optional(),
  /** Short background phrase appended to inpaint prompts so the box fills correctly. */
  background: z.string().optional().default("green grass"),
  features: z.array(FeatureSchema).max(20).default([]),
});
export type Spec = z.infer<typeof SpecSchema>;

export type Mode = "sprite" | "inpaint";

export type ObjPlace = { spriteB64: string; x: number; y: number; w: number; h: number; shadow: boolean };
export type BuiltMap = { mapB64: string; collisionB64: string; objects: ObjPlace[] };

/** Tiny stable hash so an unchanged (spec, mode) reuses the cached map (no credits). */
export function hashSpec(spec: Spec, mode: Mode): string {
  const s = JSON.stringify({ spec, mode });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export function rectOf(f: Spec["features"][number], size: number): Rect {
  const [x, y, w, h] = f.rect;
  const cx = Math.max(0, Math.min(size, Math.round(x)));
  const cy = Math.max(0, Math.min(size, Math.round(y)));
  return { x: cx, y: cy, w: Math.max(1, Math.min(size - cx, Math.round(w))), h: Math.max(1, Math.min(size - cy, Math.round(h))) };
}
```

- [ ] **Step 2: Create `src/buildmap/build-sprite.ts`**

```ts
import sharp from "sharp";
import { generateMap } from "../pixellab/map.js";
import { generateObject } from "../pixellab/object.js";
import { footprintEllipse, type Rect } from "../core/footprint.js";
import type { PixelLabClient } from "../pixellab/client.js";
import { rectOf, type Spec, type BuiltMap, type ObjPlace } from "./spec.js";

/**
 * Crop a sprite to its non-transparent content. Generated sprites often have
 * transparent padding inside their frame, so the frame's bottom ≠ the object's
 * visual base. Trimming makes the placement rect match the real object, so
 * collision, y-sort feet, and the contact shadow all align to what you see.
 */
async function trimToContent(
  spritePng: Buffer,
  w: number,
  h: number,
): Promise<{ png: Buffer; dx: number; dy: number; w: number; h: number }> {
  const { data } = await sharp(spritePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return { png: spritePng, dx: 0, dy: 0, w, h }; // fully transparent: leave as-is
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const png = await sharp(spritePng).extract({ left: x0, top: y0, width: cw, height: ch }).png().toBuffer();
  return { png, dx: x0, dy: y0, w: cw, h: ch };
}

/**
 * Stamp an object's BASE FOOTPRINT into the collision buffer as a solid ELLIPSE
 * at the object's feet (bottom-center). Height = `footprint` × the object's
 * height, width = the object's width. This is the classic top-down "feet
 * collider": guaranteed present (unlike a thin trunk's alpha), tight (not the
 * whole box), and a clean full ellipse for flat props (footprint 1.0 = pond).
 */
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

/** Turn a size×size 0/255 buffer into a black/white PNG (white = blocked). */
function collisionToPng(collision: Uint8Array, size: number): Promise<Buffer> {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = collision[i];
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  return sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

/**
 * SPRITE mode (default, recommended): each feature is generated as a transparent
 * object sprite (pixflux no_background), emitted as a separate placement (not
 * composited) so the game can y-sort it against the character, and its base
 * footprint OR'd into the collision layer — clean edges, pixel-accurate collision.
 */
export async function buildSprite(client: PixelLabClient, spec: Spec): Promise<BuiltMap> {
  console.log(`▸ generating base: "${spec.base}" (${spec.size}×${spec.size})...`);
  const base = await generateMap(client, { description: spec.base, size: spec.size, seed: spec.seed });

  const collision = new Uint8Array(spec.size * spec.size);
  const objects: ObjPlace[] = [];
  let solidCount = 0;

  for (let i = 0; i < spec.features.length; i++) {
    const f = spec.features[i];
    const rect = rectOf(f, spec.size);
    console.log(`▸ object ${i + 1}/${spec.features.length}: "${f.prompt}" @ [${f.rect.join(",")}]...`);
    const genSize = Math.max(32, Math.min(128, Math.max(rect.w, rect.h)));
    const obj = await generateObject(client, {
      description: f.prompt,
      size: genSize,
      seed: spec.seed,
      textGuidanceScale: f.guidance ?? 8,
    });
    const resized = await sharp(Buffer.from(obj.pngBase64, "base64"))
      .resize(rect.w, rect.h, { kernel: "nearest" })
      .png()
      .toBuffer();
    // Trim transparent padding so the placement matches the visible object.
    const t = await trimToContent(resized, rect.w, rect.h);
    const placed: Rect = { x: rect.x + t.dx, y: rect.y + t.dy, w: t.w, h: t.h };
    objects.push({ spriteB64: t.png.toString("base64"), x: placed.x, y: placed.y, w: placed.w, h: placed.h, shadow: f.collides });
    if (f.collides) {
      stampFootprint(collision, spec.size, placed, f.footprint);
      solidCount++;
    }
  }

  const collisionPng = await collisionToPng(collision, spec.size);
  console.log(`  done (${solidCount}/${spec.features.length} features solid, base-footprint collision)`);
  return { mapB64: base.pngBase64, collisionB64: collisionPng.toString("base64"), objects };
}
```

- [ ] **Step 3: Create `src/buildmap/build-inpaint.ts`**

```ts
import { generateMap } from "../pixellab/map.js";
import { inpaint } from "../pixellab/inpaint.js";
import { rectsToMaskPng, type Rect } from "../sheet/mask.js";
import type { PixelLabClient } from "../pixellab/client.js";
import { rectOf, type Spec, type BuiltMap } from "./spec.js";

/**
 * INPAINT mode: sequentially regenerate each feature's rect via /inpaint, using
 * the rules learned from testing — guidance 8 and the feature's background named
 * in the prompt (so the box fills with grass, not a dark backdrop). Collision is
 * the feature rect (inpaint fills the whole box, so there is no alpha to trace).
 * Capped at 200px by sync /inpaint; expect a faint box-seam at each feature.
 */
export async function buildInpaint(client: PixelLabClient, spec: Spec): Promise<BuiltMap> {
  if (spec.size > 200) {
    throw new Error(`inpaint mode requires "size" <= 200 (sync /inpaint cap); spec has ${spec.size}`);
  }
  console.log(`▸ generating base: "${spec.base}" (${spec.size}×${spec.size})...`);
  const base = await generateMap(client, { description: spec.base, size: spec.size, seed: spec.seed });
  let mapB64 = base.pngBase64;
  const collisionRects: Rect[] = [];

  for (let i = 0; i < spec.features.length; i++) {
    const f = spec.features[i];
    const rect = rectOf(f, spec.size);
    const prompt = `${f.prompt}, on a ${spec.background} background, top-down`;
    console.log(`▸ inpaint ${i + 1}/${spec.features.length}: "${prompt}" @ [${f.rect.join(",")}]...`);
    const maskB64 = (await rectsToMaskPng(spec.size, [rect])).toString("base64");
    const res = await inpaint(client, {
      baseImagePng: mapB64,
      maskPng: maskB64,
      description: prompt,
      size: spec.size,
      seed: spec.seed,
      textGuidanceScale: f.guidance ?? 8, // 8 works; default 3 is too low
    });
    mapB64 = res.pngBase64;
    if (f.collides) collisionRects.push(rect);
  }

  const collisionPng = await rectsToMaskPng(spec.size, collisionRects); // white = blocked
  console.log(`  done (${collisionRects.length}/${spec.features.length} features solid)`);
  // Inpaint bakes objects into the map image, so there are no separate props.
  return { mapB64, collisionB64: collisionPng.toString("base64"), objects: [] };
}
```

- [ ] **Step 4: Replace `src/buildmap-cli.ts` with the thin orchestrator**

Overwrite the whole file with:

```ts
import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { removeFlatBackground } from "./sheet/transparency.js";
import { emitGame, type ObjectPlacement } from "./game/emit.js";
import type { Manifest } from "./types.js";
import { SpecSchema, hashSpec, type Spec, type Mode, type BuiltMap } from "./buildmap/spec.js";
import { buildSprite } from "./buildmap/build-sprite.js";
import { buildInpaint } from "./buildmap/build-inpaint.js";

type Args = { specPath: string; characterDir: string; outDir: string; open: boolean; mode: Mode };

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let specPath: string | undefined;
  let characterDir = "./output/knight";
  let outDir = "./output/buildmap";
  let open = false;
  let mode: Mode = "sprite";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--character") characterDir = args[++i];
    else if (a === "--out") outDir = args[++i];
    else if (a === "--mode") {
      const m = args[++i];
      if (m !== "sprite" && m !== "inpaint") die('--mode must be "sprite" or "inpaint"');
      mode = m;
    } else if (a === "--open") open = true;
    else if (!a.startsWith("--")) specPath = a;
    else die(`unknown arg: ${a}`);
  }
  if (!specPath) {
    die("usage: buildmap <spec.json> [--mode sprite|inpaint] [--character DIR] [--out DIR] [--open]");
  }
  return { specPath, characterDir, outDir, open, mode };
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function loadCharacter(dir: string): { pngPath: string; manifest: Manifest } {
  const charDir = resolve(dir);
  const pngPath = join(charDir, "spritesheet.png");
  const manifestPath = join(charDir, "spritesheet.json");
  if (!existsSync(pngPath) || !existsSync(manifestPath)) {
    die(`character not found in ${charDir} (need spritesheet.png + spritesheet.json).`);
  }
  return { pngPath, manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest };
}

async function main(): Promise<void> {
  const { specPath, characterDir, outDir, open, mode } = parseArgs(process.argv);

  const spec: Spec = SpecSchema.parse(JSON.parse(readFileSync(resolve(specPath), "utf8")));
  const out = resolve(outDir);
  const cacheDir = join(out, ".cache");
  mkdirSync(cacheDir, { recursive: true });

  const character = loadCharacter(characterDir);
  const cachePath = join(cacheDir, `map-${hashSpec(spec, mode)}.json`);

  let built: BuiltMap | null = existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, "utf8")) as BuiltMap)
    : null;

  if (built) {
    console.log(`▸ using cached map for this spec+mode (${cachePath})`);
  } else {
    const apiKey = process.env.PIXELLAB_API_KEY;
    if (!apiKey) die("PIXELLAB_API_KEY missing (populate .env)");
    const client = createClient(apiKey);
    console.log(`▸ mode: ${mode}`);
    built = mode === "inpaint" ? await buildInpaint(client, spec) : await buildSprite(client, spec);
    writeFileSync(cachePath, JSON.stringify(built));
  }

  const mapPng = Buffer.from(built.mapB64, "base64");
  const collisionPng = Buffer.from(built.collisionB64, "base64");
  const charPng = await removeFlatBackground(readFileSync(character.pngPath));
  const placements: ObjectPlacement[] = built.objects.map((o) => ({
    png: Buffer.from(o.spriteB64, "base64"),
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    shadow: o.shadow,
  }));

  writeFileSync(join(out, "map.png"), mapPng);
  writeFileSync(join(out, "collision.png"), collisionPng);
  const gamePath = emitGame(
    out,
    mapPng,
    { width: spec.size, height: spec.size },
    charPng,
    character.manifest,
    collisionPng,
    placements,
  );
  console.log(
    `▸ wrote ${out}/{map.png, collision.png, game.html} ` +
      `(${spec.features.length} features, ${placements.length} props)`,
  );

  if (open) {
    spawn("open", [gamePath], { stdio: "ignore", detached: true }).unref();
  }
}

main().catch((err) => {
  if (err instanceof PixelLabError) {
    console.error(`error: ${err.message}`);
    if (err.body) console.error(err.body.slice(0, 1000));
  } else {
    console.error(err instanceof Error ? err.message : String(err));
  }
  process.exit(1);
});
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (`src/buildmap-cli.ts` no longer imports `sharp`, `zod`,
`generateMap`, `generateObject`, `inpaint`, `rectsToMaskPng`, `Rect`, or
`footprintEllipse` — those now live in `src/buildmap/*`.)

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: all suites pass (no test imports `buildmap-cli`; the guard and core tests
are unaffected).

- [ ] **Step 7: Behavior smoke via cache (no API key)**

Run: `npm run buildmap examples/grass-map.json`
Expected: if a cached map exists for this spec it prints `▸ using cached map…` and
writes `output/buildmap/{map.png, collision.png, game.html}` with no API calls. If no
cache exists and no `PIXELLAB_API_KEY` is set, it exits with
`PIXELLAB_API_KEY missing (populate .env)` — that is the same behavior as before the
split, confirming the orchestration path is intact.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: split buildmap-cli into buildmap/{spec,build-sprite,build-inpaint}"
```

---

## Done

After Task 4: `src/core/` is an explicit, test-enforced browser-safe boundary; the
app and CLIs import from it; `buildmap-cli` is a thin orchestrator; and an agent has
`CLAUDE.md` + `README.md` + `docs/pixellab-notes.md` to work from. Finish with
`superpowers:finishing-a-development-branch`.
