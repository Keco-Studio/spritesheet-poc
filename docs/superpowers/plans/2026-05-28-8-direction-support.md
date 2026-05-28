# 8-Direction Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional `directions: 8` support to the sprite sheet generator, producing an 8-direction spritesheet and a 3×3 compass-layout animated preview.

**Architecture:** When `directions: 8` is set, the CLI calls the synchronous `/create-character-with-8-directions` endpoint to get 8 base sprites, then animates each (direction × action) pair, packing them into a mega-sheet with rows = `directions × actions`. The manifest records `rowByDirection` per action instead of a scalar `row`. The preview template branches on `manifest.directions.length` to render either the existing side-by-side layout (length 1) or the new 3×3 compass grid with auto-cycling actions (length 8).

**Tech Stack:** TypeScript, Node.js (ESM), `sharp` (image processing), `zod` (config validation), `vitest` (tests), Excalibur.js 0.30.3 (preview renderer, CDN-loaded), PixelLab API.

---

## File Map

| File | Action | Change |
|---|---|---|
| `src/types.ts` | Modify | Add `directions?: 1 \| 8` to `CharacterConfig`; replace `ActionManifestEntry.row` with `rowByDirection`; add `directions: string[]` to `Manifest`; export `DIRECTIONS_1` and `DIRECTIONS_8` constants |
| `src/config.ts` | Modify | Add `directions` field to Zod schema with `.optional().default(1)` |
| `src/pixellab/generate8.ts` | Create | `generate8Directions()` — calls `/create-character-with-8-directions`, resizes each image to `size×size`, returns `Record<string, string>` |
| `src/sheet/manifest.ts` | Modify | Update `buildManifest` signature to accept `directions` param; compute `rowByDirection` per action |
| `src/cli.ts` | Modify | Branch on `config.directions` to either use existing single-sprite flow or 8-direction flow |
| `src/preview/template.html` | Modify | Branch on `manifest.directions.length` for layout; update 1-dir path to use `rowByDirection["south"]`; add 3×3 compass layout with action cycling for 8-dir path |
| `tests/sheet/manifest.test.ts` | Modify | Replace existing test with two new tests matching new `buildManifest` signature and output shape |

---

## Task 1: Update `src/types.ts` — new constants, updated types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Replace the contents of `src/types.ts`**

Replace the entire file with:

```ts
export const DIRECTIONS_1 = ["south"] as const;
export const DIRECTIONS_8 = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;

export type ActionSpec = {
  name: string;
  prompt: string;
  frames: number;
};

export type CharacterConfig = {
  name: string;
  description: string;
  size: 64;
  directions?: 1 | 8;
  actions: ActionSpec[];
};

export type ActionManifestEntry = {
  frameCount: number;
  durationMs: number;
  rowByDirection: Record<string, number>;
};

export type Manifest = {
  image: "spritesheet.png";
  frameSize: number;
  columns: number;
  rows: number;
  directions: string[];
  actions: Record<string, ActionManifestEntry>;
};
```

- [ ] **Step 2: Typecheck to confirm no errors introduced yet (expected: errors in manifest.ts, template, cli.ts — that's fine)**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npm run typecheck 2>&1 | head -40
```

Expected: errors referencing `row`, `buildManifest` arity, etc. — confirming we've broken the old call sites as expected. Do NOT expect clean typecheck here.

---

## Task 2: Update `src/config.ts` — add `directions` to Zod schema

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add `directions` field to `ConfigSchema`**

In `src/config.ts`, change the `ConfigSchema` object definition. The current block:

```ts
const ConfigSchema = z
  .object({
    name: z.string().min(1).regex(/^[a-z0-9-]+$/, "name must be kebab-case"),
    description: z.string().min(1),
    size: z.literal(64),
    actions: z.array(ActionSchema).min(1).max(8),
  })
```

becomes:

```ts
const ConfigSchema = z
  .object({
    name: z.string().min(1).regex(/^[a-z0-9-]+$/, "name must be kebab-case"),
    description: z.string().min(1),
    size: z.literal(64),
    directions: z.union([z.literal(1), z.literal(8)]).optional().default(1),
    actions: z.array(ActionSchema).min(1).max(8),
  })
```

- [ ] **Step 2: Run existing config tests**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npx vitest run tests/config.test.ts 2>&1
```

Expected output: all 6 config tests pass. The `valid` fixture in the test doesn't set `directions`, so the default (`1`) kicks in. The test `expect(parseConfig(valid)).toEqual(valid)` will now fail because `parseConfig` returns `{ ...valid, directions: 1 }` but `valid` has no `directions` key.

If the test fails on this assertion, update the test's `valid` expectation. Look at the test at `tests/config.test.ts` line 4–12; the fixture becomes:

```ts
const valid = {
  name: "knight",
  description: "a knight",
  size: 64,
  directions: 1 as const,
  actions: [
    { name: "idle", prompt: "still", frames: 4 },
    { name: "walk", prompt: "walking", frames: 8 },
  ],
};
```

Then re-run and confirm all 6 tests pass.

- [ ] **Step 3: Confirm all 6 tests pass**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npx vitest run tests/config.test.ts 2>&1
```

Expected: `6 tests passed`.

---

## Task 3: Update `src/sheet/manifest.ts` + tests

**Files:**
- Modify: `src/sheet/manifest.ts`
- Modify: `tests/sheet/manifest.test.ts`

- [ ] **Step 1: Write the new failing manifest tests first**

Replace the entire file `tests/sheet/manifest.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { buildManifest } from "../../src/sheet/manifest.js";

describe("buildManifest", () => {
  it("single direction: row per action", () => {
    const m = buildManifest(64, ["south"], [
      { name: "idle", frames: 4 },
      { name: "walk", frames: 8 },
    ]);
    expect(m.rows).toBe(2);
    expect(m.columns).toBe(8);
    expect(m.directions).toEqual(["south"]);
    expect(m.actions.idle.rowByDirection).toEqual({ south: 0 });
    expect(m.actions.walk.rowByDirection).toEqual({ south: 1 });
  });

  it("8 directions × N actions: row = dirIdx * actions.length + actionIdx", () => {
    const m = buildManifest(64, ["south", "east", "north", "west"], [
      { name: "idle", frames: 4 },
      { name: "walk", frames: 8 },
    ]);
    expect(m.rows).toBe(8);
    expect(m.actions.idle.rowByDirection).toEqual({ south: 0, east: 2, north: 4, west: 6 });
    expect(m.actions.walk.rowByDirection).toEqual({ south: 1, east: 3, north: 5, west: 7 });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (new signature not yet implemented)**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npx vitest run tests/sheet/manifest.test.ts 2>&1
```

Expected: test errors — `buildManifest` called with 3 args but expects 2, or assertion failures on `rowByDirection`.

- [ ] **Step 3: Replace `src/sheet/manifest.ts` with the new implementation**

Replace the entire file:

```ts
import type { Manifest } from "../types.js";

const DEFAULT_DURATION_MS = 100;

export function buildManifest(
  frameSize: number,
  directions: readonly string[],
  actions: Array<{ name: string; frames: number }>,
): Manifest {
  const columns = Math.max(...actions.map((a) => a.frames));
  const rows = directions.length * actions.length;

  const actionMap: Manifest["actions"] = {};
  actions.forEach((action, actionIdx) => {
    const rowByDirection: Record<string, number> = {};
    directions.forEach((dir, dirIdx) => {
      rowByDirection[dir] = dirIdx * actions.length + actionIdx;
    });
    actionMap[action.name] = {
      frameCount: action.frames,
      durationMs: DEFAULT_DURATION_MS,
      rowByDirection,
    };
  });

  return {
    image: "spritesheet.png",
    frameSize,
    columns,
    rows,
    directions: [...directions],
    actions: actionMap,
  };
}
```

- [ ] **Step 4: Run manifest tests to confirm both pass**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npx vitest run tests/sheet/manifest.test.ts 2>&1
```

Expected: `2 tests passed`.

---

## Task 4: Create `src/pixellab/generate8.ts`

**Files:**
- Create: `src/pixellab/generate8.ts`

- [ ] **Step 1: Create the file**

Create `src/pixellab/generate8.ts` with:

```ts
import sharp from "sharp";
import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";
import { DIRECTIONS_8 } from "../types.js";

type Resp = { images: Record<string, { type: "base64"; base64: string }> };

export async function generate8Directions(
  client: PixelLabClient,
  description: string,
  size: number,
): Promise<Record<string, string>> {
  const resp = await client.post<Resp>("/create-character-with-8-directions", {
    description,
    image_size: { width: size, height: size },
  });
  const out: Record<string, string> = {};
  for (const dir of DIRECTIONS_8) {
    const raw = resp.images?.[dir]?.base64;
    if (!raw) throw new PixelLabError(`8-dir response missing ${dir}`);
    const b64 = raw.startsWith("data:") ? raw.split(",")[1] : raw;
    const resized = await sharp(Buffer.from(b64, "base64"))
      .resize(size, size, { kernel: "nearest" })
      .png()
      .toBuffer();
    out[dir] = resized.toString("base64");
  }
  return out;
}
```

- [ ] **Step 2: Typecheck `generate8.ts` only**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npx tsc --noEmit 2>&1 | grep generate8
```

Expected: no errors for `generate8.ts`.

---

## Task 5: Update `src/cli.ts` — branch on `directions`

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add imports for the new symbols at the top of `src/cli.ts`**

After the existing imports, add:

```ts
import { generate8Directions } from "./pixellab/generate8.js";
import { DIRECTIONS_1, DIRECTIONS_8 } from "./types.js";
```

The full import block should become:

```ts
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "./config.js";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { generateBaseSprite } from "./pixellab/generate.js";
import { animateAction } from "./pixellab/animate.js";
import { generate8Directions } from "./pixellab/generate8.js";
import { buildManifest } from "./sheet/manifest.js";
import { packSheet } from "./sheet/pack.js";
import { emitPreview } from "./preview/emit.js";
import { DIRECTIONS_1, DIRECTIONS_8 } from "./types.js";
```

- [ ] **Step 2: Replace the `main()` function body with the branching implementation**

Replace the entire `async function main()` block (lines 44–85 of the original) with:

```ts
async function main(): Promise<void> {
  const { configPath, outDir, open } = parseArgs(process.argv);
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) die("PIXELLAB_API_KEY missing (populate .env)");

  const config = loadConfig(configPath);
  const characterOut = resolve(outDir, config.name);
  mkdirSync(characterOut, { recursive: true });

  const client = createClient(apiKey);
  const dirCount = config.directions ?? 1;
  const directions = dirCount === 8 ? DIRECTIONS_8 : DIRECTIONS_1;

  // Build base sprites: Record<direction, base64>
  let baseSpritesByDir: Record<string, string>;

  if (dirCount === 8) {
    let t = ts();
    console.log(`▸ ${config.name}: generating 8-direction base sprites...`);
    baseSpritesByDir = await generate8Directions(client, config.description, config.size);
    console.log(`  done (${fmt(ts() - t)})`);
  } else {
    let t = ts();
    console.log(`▸ ${config.name}: generating base sprite...`);
    const baseBase64 = await generateBaseSprite(client, config.description, config.size);
    console.log(`  done (${fmt(ts() - t)})`);
    baseSpritesByDir = { south: baseBase64 };
  }

  // Animate every direction × action pair, build rowsFrames in manifest row order.
  // Row index = dirIdx * actions.length + actionIdx
  const totalRows = directions.length * config.actions.length;
  const rowsFrames: Buffer[][] = new Array(totalRows);

  for (let dirIdx = 0; dirIdx < directions.length; dirIdx++) {
    const dir = directions[dirIdx];
    const baseBase64 = baseSpritesByDir[dir];
    for (let actionIdx = 0; actionIdx < config.actions.length; actionIdx++) {
      const action = config.actions[actionIdx];
      const rowIndex = dirIdx * config.actions.length + actionIdx;
      let t = ts();
      console.log(`▸ ${config.name}/${dir}/${action.name}: animating (${action.frames} frames)...`);
      const frames = await animateAction(client, baseBase64, action.prompt, action.frames, config.size);
      console.log(`  done (${fmt(ts() - t)})`);
      rowsFrames[rowIndex] = frames.map((b64) => Buffer.from(b64, "base64"));
    }
  }

  const manifest = buildManifest(
    config.size,
    directions,
    config.actions.map((a) => ({ name: a.name, frames: a.frames })),
  );

  console.log(`▸ packing sheet ${manifest.columns}×${manifest.rows} @ ${config.size}px...`);
  const sheetPng = await packSheet(config.size, manifest.columns, manifest.rows, rowsFrames);
  writeFileSync(join(characterOut, "spritesheet.png"), sheetPng);
  writeFileSync(join(characterOut, "spritesheet.json"), JSON.stringify(manifest, null, 2));

  const previewPath = emitPreview(characterOut, manifest);
  console.log(`▸ wrote ${characterOut}/{spritesheet.png, spritesheet.json, preview.html}`);

  if (open) {
    spawn("open", [previewPath], { stdio: "ignore", detached: true }).unref();
  }
}
```

- [ ] **Step 3: Run typecheck and confirm `cli.ts` is clean**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npm run typecheck 2>&1
```

At this point the only remaining typecheck error should be in `template.html` (it is not typechecked by tsc) and possibly `src/preview/emit.ts` if it references old types — but `emit.ts` just passes `manifest: Manifest` through unchanged, so it should be fine. Expected: 0 errors.

---

## Task 6: Update `src/preview/template.html` — branch on `directions.length`

**Files:**
- Modify: `src/preview/template.html`

- [ ] **Step 1: Replace the `<script type="module">` block**

The current script block runs from line 19 to line 83. Replace the entire `<script type="module">` block (everything between `<script type="module">` and `</script>`) with:

```js
import { Engine, ImageSource, SpriteSheet, Animation, Actor, Vector, Color, Label, Font, TextAlign, FontUnit, Loader } from "https://esm.sh/excalibur@0.30.3";

const manifest = JSON.parse(document.getElementById("manifest").textContent);
document.getElementById("meta").textContent = `frameSize=${manifest.frameSize} grid=${manifest.columns}x${manifest.rows}`;

const SCALE = 3;
const PAD = 16;
const CELL = manifest.frameSize * SCALE;
const actionNames = Object.keys(manifest.actions);

const image = new ImageSource("__IMAGE_SRC__");
const loader = new Loader([image]);

if (manifest.directions.length === 1) {
  // --- 1-direction: side-by-side layout (original behavior) ---
  const cellW = CELL + PAD * 2;
  const labelH = 24;
  const canvasW = Math.max(cellW * actionNames.length, 320);
  const canvasH = CELL + PAD * 2 + labelH;

  document.getElementById("title").textContent = "Sprite Sheet Preview — " + actionNames.join(", ");

  const game = new Engine({
    canvasElementId: "game",
    width: canvasW,
    height: canvasH,
    backgroundColor: Color.fromHex("#2a2a2a"),
    antialiasing: false,
    pixelArt: true,
  });

  await game.start(loader);

  const sheet = SpriteSheet.fromImageSource({
    image,
    grid: {
      columns: manifest.columns,
      rows: manifest.rows,
      spriteWidth: manifest.frameSize,
      spriteHeight: manifest.frameSize,
    },
  });

  actionNames.forEach((name, i) => {
    const a = manifest.actions[name];
    const row = a.rowByDirection["south"];
    const frames = [];
    for (let c = 0; c < a.frameCount; c++) {
      frames.push({ graphic: sheet.getSprite(c, row), duration: a.durationMs });
    }
    const anim = new Animation({ frames });
    anim.scale = new Vector(SCALE, SCALE);

    const actor = new Actor({
      x: PAD + i * cellW + CELL / 2,
      y: PAD + CELL / 2,
      width: CELL,
      height: CELL,
    });
    actor.graphics.use(anim);
    game.add(actor);

    const label = new Label({
      text: name,
      x: PAD + i * cellW + CELL / 2,
      y: PAD + CELL + 18,
      font: new Font({ family: "system-ui", size: 14, unit: FontUnit.Px, color: Color.White, textAlign: TextAlign.Center }),
    });
    game.add(label);
  });

} else {
  // --- 8-direction: 3×3 compass layout with auto-cycling actions ---
  const cellW = CELL + PAD * 2;
  const canvasW = cellW * 3;
  const canvasH = cellW * 3 + 40; // bottom label row

  document.getElementById("title").textContent = "Sprite Sheet Preview";

  const game = new Engine({
    canvasElementId: "game",
    width: canvasW,
    height: canvasH,
    backgroundColor: Color.fromHex("#2a2a2a"),
    antialiasing: false,
    pixelArt: true,
  });

  await game.start(loader);

  const sheet = SpriteSheet.fromImageSource({
    image,
    grid: {
      columns: manifest.columns,
      rows: manifest.rows,
      spriteWidth: manifest.frameSize,
      spriteHeight: manifest.frameSize,
    },
  });

  // compass layout: [gridRow][gridCol] = direction name or null (center)
  const layout = [
    ["north-west", "north",  "north-east"],
    ["west",       null,     "east"],
    ["south-west", "south",  "south-east"],
  ];

  // Pre-build Animation objects for every (direction, actionName) pair
  // animsByDir[dir][actionName] = Animation
  const animsByDir = {};
  for (const dir of manifest.directions) {
    animsByDir[dir] = {};
    for (const actionName of actionNames) {
      const a = manifest.actions[actionName];
      const row = a.rowByDirection[dir];
      const frames = [];
      for (let c = 0; c < a.frameCount; c++) {
        frames.push({ graphic: sheet.getSprite(c, row), duration: a.durationMs });
      }
      const anim = new Animation({ frames });
      anim.scale = new Vector(SCALE, SCALE);
      animsByDir[dir][actionName] = anim;
    }
  }

  // Create one Actor per non-null compass cell
  const actorsByDir = {};
  for (let gridRow = 0; gridRow < 3; gridRow++) {
    for (let gridCol = 0; gridCol < 3; gridCol++) {
      const dir = layout[gridRow][gridCol];
      if (!dir) continue;
      const cx = gridCol * cellW + cellW / 2;
      const cy = gridRow * cellW + cellW / 2;
      const actor = new Actor({ x: cx, y: cy, width: CELL, height: CELL });
      actor.graphics.use(animsByDir[dir][actionNames[0]]);
      game.add(actor);
      actorsByDir[dir] = actor;
    }
  }

  // Bottom label showing current action
  const actionLabel = new Label({
    text: actionNames[0],
    x: canvasW / 2,
    y: cellW * 3 + 24,
    font: new Font({ family: "system-ui", size: 16, unit: FontUnit.Px, color: Color.White, textAlign: TextAlign.Center }),
  });
  game.add(actionLabel);

  // Auto-cycle through actions every 3 seconds
  let currentActionIdx = 0;
  setInterval(() => {
    currentActionIdx = (currentActionIdx + 1) % actionNames.length;
    const nextAction = actionNames[currentActionIdx];
    actionLabel.text = nextAction;
    for (const dir of manifest.directions) {
      actorsByDir[dir].graphics.use(animsByDir[dir][nextAction]);
    }
  }, 3000);
}
```

- [ ] **Step 2: Verify the file is valid HTML (visual inspection)**

Open `src/preview/template.html` and confirm:
- The `__MANIFEST_JSON__` and `__IMAGE_SRC__` placeholders are still present exactly once each (they are inlined by `emit.ts` at runtime).
- Both the `if` (1-direction) and `else` (8-direction) branches are present.
- No syntax errors obvious from reading.

---

## Task 7: Full typecheck + all tests pass

**Files:** none changed

- [ ] **Step 1: Run full typecheck**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npm run typecheck 2>&1
```

Expected: `0 errors`.

- [ ] **Step 2: Run all tests**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && npm test 2>&1
```

Expected: at least 9 tests pass (6 config + 2 manifest + 1 pack short-row + 1 pack pixel offset = 10 total... wait, pack has 2 tests = 10 total). All should be green, 0 failures.

- [ ] **Step 3: If any test fails, diagnose and fix**

Common failure modes:
- Config test `"accepts a valid config"` fails: the `valid` fixture doesn't include `directions`, but `parseConfig` now returns `{ ...valid, directions: 1 }`. Fix: add `directions: 1 as const` to the `valid` fixture in `tests/config.test.ts` (see Task 2 Step 2 for the full updated fixture).
- Manifest test fails: confirm `buildManifest` is being called with 3 args: `(frameSize, directions, actions)`. The test file was replaced in Task 3 Step 1.

---

## Task 8: Delete stale output and commit

**Files:** none changed in source

- [ ] **Step 1: Delete stale output directory (has old manifest format)**

```bash
rm -rf /Users/wooden/Workspace/game-creation-pocs/sheet-poc/output/knight
```

- [ ] **Step 2: Commit**

```bash
cd /Users/wooden/Workspace/game-creation-pocs/sheet-poc && git add src/types.ts src/config.ts src/pixellab/generate8.ts src/sheet/manifest.ts src/cli.ts src/preview/template.html tests/config.test.ts tests/sheet/manifest.test.ts && git -c user.name=dev -c user.email=dev@local commit -m "feat(directions): optional 8-direction generation + compass preview"
```

Expected: commit succeeds, shows changed file count.

---

## Self-Review Notes

**Spec coverage:**
- Task 1: `DIRECTIONS_1`, `DIRECTIONS_8`, updated `CharacterConfig`, `ActionManifestEntry`, `Manifest` ✓
- Task 2: Zod `directions` field with `.optional().default(1)` ✓
- Task 3: `buildManifest` new signature, manifest tests ✓
- Task 4: `generate8Directions` with resize + error check ✓
- Task 5: CLI branches on `dirCount === 8`, progress log format matches spec ✓
- Task 6: Preview 1-dir path updates `a.row` → `a.rowByDirection["south"]`; 8-dir compass layout with 3-second cycling ✓
- Task 7: typecheck + tests ✓
- Task 8: delete stale output + commit ✓

**Type consistency check:**
- `buildManifest(frameSize, directions, actions)` — defined in Task 3, called in Task 5 CLI with same arg order ✓
- `manifest.actions[name].rowByDirection[dir]` — defined in `Manifest` type (Task 1), used in template (Task 6) ✓
- `generate8Directions(client, description, size)` — returns `Record<string, string>`, stored as `baseSpritesByDir` in CLI ✓
- `animateAction(client, baseBase64, action.prompt, action.frames, config.size)` — unchanged signature ✓
- `DIRECTIONS_8` is `readonly string[]`-compatible for `directions` param in `buildManifest` ✓

**Potential issue to watch:** The config test `"accepts a valid config"` — Zod's `.default(1)` means `parseConfig(valid)` returns `{ ...valid, directions: 1 }` but the test fixture `valid` has no `directions` key. The `toEqual` check will fail unless the fixture is updated. Task 2 Step 2 handles this explicitly.
