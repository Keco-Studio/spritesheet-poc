# Sprite Sheet Generator POC — Design

**Date:** 2026-05-28
**Status:** Approved (pending written-spec review)

## Goal

A Node CLI that turns a JSON character config into a PixelLab-generated sprite sheet ready to use in Excalibur, with a self-contained HTML preview that animates the result live.

This is POC #1 in the `sheet-poc` directory; an authoring UI and additional export targets are out of scope.

## User Story

A developer writes a config describing a character and the actions it should perform. They run `npm run gen -- character.json`. After a couple of minutes of progress output, they get:

- `spritesheet.png` — a grid sheet (rows = actions, cols = frames).
- `spritesheet.json` — manifest describing the layout.
- `preview.html` — opens in any browser, plays each action in a loop with Excalibur.

## Scope

**In scope**
- Single character per run.
- Single direction (south-facing) per character.
- N actions, each with its own animation prompt and frame count.
- 64×64 frames.
- Grid layout (one row per action).
- Excalibur-compatible JSON + working HTML preview.

**Out of scope**
- Multi-character batching, multi-direction (4 or 8), reference-image style transfer, frame editing, hot-reload, GUI, non-Excalibur export targets.

## Config Format

```json
{
  "name": "knight",
  "description": "armored knight with a sword and red cape",
  "size": 64,
  "actions": [
    { "name": "idle",   "prompt": "standing still, breathing",  "frames": 4 },
    { "name": "walk",   "prompt": "walking forward",            "frames": 8 },
    { "name": "attack", "prompt": "swinging sword overhead",    "frames": 6 }
  ]
}
```

Validation (zod):
- `name`: non-empty string, kebab-case-safe (used in output paths).
- `description`: non-empty string.
- `size`: must equal `64` for this POC.
- `actions`: 1–8 entries; `name` unique per config; `frames` integer 4–16.

## CLI

```
npm run gen -- <config.json> [--out ./output] [--open]
```

- `--out` (default `./output`) — base output directory. Files land in `<out>/<character.name>/`.
- `--open` — runs `open <path>` on `preview.html` (macOS) after writing.

Exits non-zero on any error with a one-line message + relevant context (offending field, HTTP status, etc.).

## Architecture

```
src/
  cli.ts              # entrypoint: parse args, load env+config, orchestrate
  types.ts            # shared Manifest type (used by CLI and preview)
  config.ts           # load + validate config (zod)
  pixellab/
    client.ts         # fetch wrapper: auth header, JSON, error mapping
    generate.ts       # createCharacterV3 → south-facing 64x64 base PNG
    animate.ts        # animateWithTextV3 → frame array per action
    poll.ts           # poll /background-jobs/{id} until completed/failed
  sheet/
    pack.ts           # compose grid PNG via sharp; pad short rows
    manifest.ts       # build spritesheet.json
  preview/
    emit.ts           # copy template, inline manifest, write preview.html
    template.html     # static Excalibur preview (CDN import)
examples/
  knight.json         # known-good reference config
```

### Data flow

1. Load `.env` and config; create `<out>/<name>/`.
2. **Generate base sprite**: call `create-character-v3` with `description` and `image_size: 64×64`. Poll until done. Extract the south-facing frame.
3. **Generate each action's frames** (sequential):
   - For each action, call `animate-with-text-v3` with `first_frame = base sprite`, `action = action.prompt`, `frame_count = action.frames`.
   - Poll until done. Extract frames array.
4. **Pack sheet**: build a `cols × rows` grid where `cols = max(frames)` across actions and `rows = actions.length`. Short rows leave trailing cells transparent.
5. **Write manifest** (`spritesheet.json`).
6. **Emit preview** (`preview.html`) with the manifest inlined.
7. Print output paths; optionally open the preview.

Sequential per-action calls are intentional — PixelLab jobs take 30–180s each, and parallelizing risks rate-limiting for marginal gain on a POC.

### Manifest schema

```ts
type Manifest = {
  image: "spritesheet.png";
  frameSize: number;          // 64
  columns: number;            // max frames across actions
  rows: number;               // actions.length
  actions: Record<string, {
    row: number;
    frameCount: number;
    durationMs: number;       // per-frame duration; default 100ms
  }>;
};
```

Defined once in `src/types.ts`, imported by both the CLI and the preview's bundled script so the schema can't drift.

### Preview

`preview.html` is a single static file that:
- Imports `excalibur` via `https://esm.sh/excalibur@<pinned>`.
- Loads `spritesheet.png` (sibling file) and `spritesheet.json` (inlined as a `<script type="application/json">` block to avoid CORS issues when opened via `file://`).
- Creates an `ImageSource` → `SpriteSheet.fromImageSource({ grid: { columns, rows, spriteWidth: 64, spriteHeight: 64 } })`.
- For each action, builds `Animation.fromSpriteSheet(sheet, [0..frameCount-1].map(c => row*columns + c), durationMs)` and places it on screen with a text label.
- Plays all animations side-by-side in a single Excalibur scene at a comfortable scale (e.g., 2×).

## Dependencies

- `zod` — config validation
- `sharp` — image decode/compose/encode
- `dotenv` — load `.env`
- `tsx` — run TS directly
- `vitest` — unit tests
- `typescript` — types
- `excalibur` — only loaded by `preview.html` (CDN); not bundled by the CLI

## Error Handling

Boundary-only validation. Internal helpers trust their inputs.

| Condition | Behavior |
|---|---|
| `PIXELLAB_API_KEY` missing | Exit 1 with hint to populate `.env`. |
| Config fails zod validation | Exit 1; print which field. |
| API returns non-2xx | Exit 1; print HTTP status and response body. No retry on 4xx. |
| Job poll: `status: "failed"` | Exit 1; print the job's error message. |
| Job poll: 5 min elapsed | Exit 1; print job id for manual inspection. |
| One action fails mid-run | Stop. Don't write a partial sheet. User re-runs after fixing. |

Polling interval: 3 seconds (per PixelLab's "2–5s" guidance).

## Progress Output

```
▸ knight: generating base sprite... done (12s)
▸ knight/idle:   animating (4 frames)... done (38s)
▸ knight/walk:   animating (8 frames)... done (71s)
▸ knight/attack: animating (6 frames)... done (54s)
▸ packing sheet 8×3 @ 64px... done
▸ wrote output/knight/{spritesheet.png, spritesheet.json, preview.html}
```

## Output Layout

```
output/knight/
  spritesheet.png      # 512x192 = (8 cols * 64) x (3 rows * 64)
  spritesheet.json
  preview.html
```

## Testing

POC-appropriate: light unit tests on pure logic, manual verification for the rest.

**Unit tests (vitest):**
- `config.ts` — valid configs pass; missing fields, duplicate action names, out-of-range `frames`, and `size != 64` all fail with clear messages.
- `sheet/pack.ts` — given fake 64×64 PNG buffers (each a solid color), the packed sheet has correct dimensions and each cell lands at the expected pixel offset. Read back with sharp and sample pixel centers.
- `sheet/manifest.ts` — given an action list, manifest has correct row indices, `columns = max(frames)`, and durations populated.

**Not unit-tested:**
- PixelLab client (mocking the API would test the mock).
- `preview.html` (verified by opening it).

**Manual acceptance:**
1. `npm run gen -- examples/knight.json --open` succeeds.
2. The sheet PNG opens and the grid looks coherent.
3. The preview HTML plays all animations in a loop with no browser console errors.

## Risks / Open Questions

- **PixelLab style consistency between base and animated frames.** `animate-with-text-v3` takes the base as `first_frame` so identity should hold, but artifacts are possible. Acceptable for a POC.
- **Excalibur API surface.** `SpriteSheet.fromImageSource` + `Animation.fromSpriteSheet` are stable as of Excalibur 0.30+; we'll pin the CDN version in `preview.html`.
- **Cost / rate limits.** Each run is one character call + N animation calls. A 3-action knight is ~4 API jobs. Not addressed in code; user manages by re-running deliberately.
