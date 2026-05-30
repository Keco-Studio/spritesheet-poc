# Agent-Friendly Refactor — Design

**Date:** 2026-05-30
**Status:** Approved

## Purpose

Make this repository legible and safe for an LLM agent to work in. Today an agent
landing here has no entry point, the hard-won PixelLab API knowledge lives only in
a developer's personal memory (not the repo), and `src/sheet/` silently mixes
browser-safe pure modules with Node-only (`sharp`) modules — so an agent can break
the browser build without any signal.

This is **Approach A** from brainstorming: an explicit, *tool-enforced* boundary
between browser-safe core and Node-only code, plus a context layer, plus splitting
the one oversized CLI. No npm workspaces, no renames beyond the core extraction, no
behavior changes.

## Goal

A clear agent entry point (`CLAUDE.md`), captured tribal knowledge in-repo, and a
pure/Node boundary that fails a test when violated.

## Current state (what we're working with)

- **Two build systems:** root (`src/` + `tsx` CLIs: `gen`, `map`, `buildmap`,
  `assets`, `tileset`) and `app/` (Vite editor, Excalibur as an npm dep).
- **Implicit shared boundary:** `app/src/*` imports pure logic via
  `../../src/sheet/*.js` (Vite `fs.allow: ['..']`). The pure modules
  (`footprint`, `scene-collision`, `manifest-schema`, `project-model`) sit next to
  Node-only ones (`mask`, `transparency`, `pack`, `manifest`, all using `sharp`)
  with only a top-of-file comment marking the difference.
- **Decent boundaries otherwise:** `src/pixellab/` (API), `src/game|editor|preview/`
  (HTML emitters), CLIs at top. 13 test files.
- **One oversized file:** `src/buildmap-cli.ts` (317 lines) does arg parsing, spec
  schema, two build modes, image helpers, and orchestration.
- **No `CLAUDE.md`, no `README.md`.** `.claude/` holds only `settings.local.json`.

## Architecture / changes

### 1. Context layer (no code changes)

- **`CLAUDE.md`** (root) — agent entry point. A map, not a manual:
  - One-paragraph "what this is".
  - The two build systems and the exact command to run each.
  - Directory map (`src/core` pure, `src/sheet` Node-only imaging, `src/pixellab`
    API, `src/game|editor|preview` emitters, `app/` Vite editor).
  - Critical PixelLab gotchas inline (pointer to `docs/pixellab-notes.md`).
  - Key invariants: pure core stays Node-free; collision is manual-movement in
    `preupdate` (not velocity); footprint-ellipse + y-sort model.
  - Test, typecheck, and app-build commands.
- **`README.md`** (root) — human-facing overview + quickstart for each CLI and the
  app.
- **`docs/pixellab-notes.md`** — captured PixelLab API knowledge (currently only in
  personal auto-memory):
  - `/create-image-pixflux`: sync, ≤400px, inline base64 PNG.
  - `/create-tileset`: async, resolves on `message_done`, raw RGBA bytes.
  - `/inpaint`: sync, ≤200px, `text_guidance_scale` max 10 (use 8), white mask =
    regenerate, **name the background** in the prompt.
  - Characters/animations bake a flat opaque gray `(128,128,128)` backdrop →
    `removeFlatBackground` border flood-fill removes it (preserves interior shadow).

### 2. Pure-core extraction

- Create **`src/core/`** and move the pure, browser-safe modules into it:
  - `footprint.ts`, `scene-collision.ts`, `manifest-schema.ts`, `project-model.ts`.
- Node-only imaging stays in **`src/sheet/`**: `mask.ts`, `transparency.ts`,
  `pack.ts`, `manifest.ts`.
- After the move: `src/core/` = browser-safe, `src/sheet/` = Node-only. The
  distinction is now the directory, not a comment.
- Update every importer:
  - `app/src/assets.ts`, `app/src/collision-canvas.ts`, `app/src/exporters.ts`,
    `app/src/editor-scene.ts`, `app/src/store.ts`, `app/src/play-scene.ts` →
    `../../src/core/*.js`.
  - `src/buildmap-cli.ts` (and its new submodules), `src/asset-lib-cli.ts`,
    `src/map-cli.ts` → `./core/*.js`.
  - `src/sheet/mask.ts` imports the `Rect` type → `../core/footprint.js`.
  - Tests under `tests/sheet/` that target moved modules → update import paths (and
    optionally relocate to `tests/core/`; relocation is optional, path update is
    required).
- `app/vite.config.ts` keeps `fs.allow: ['..']` (still resolves `../../src/core`).

### 3. Enforced boundary

- **`tests/core/no-node-imports.test.ts`** (vitest, Node): read every `.ts` under
  `src/core/`, assert none match `from "node:`, `from "fs"`, `from "sharp"`, or
  `require(`. A leak fails the suite. This is what makes the boundary real.

### 4. Split `buildmap-cli.ts`

- `src/buildmap/spec.ts` — `FeatureSchema`, `SpecSchema`, the `Spec` type,
  `hashSpec`, `rectOf`. Pure-ish (zod only).
- `src/buildmap/build-sprite.ts` — `buildSprite` + `trimToContent`,
  `stampFootprint`, `collisionToPng` (uses `sharp`).
- `src/buildmap/build-inpaint.ts` — `buildInpaint`.
- `src/buildmap-cli.ts` — thin orchestrator: `parseArgs`, load spec, dispatch by
  mode, cache, `emitGame`, `--open`. Behavior **identical** to today.
- Shared types (`BuiltMap`, `ObjPlace`) live in `src/buildmap/spec.ts` or a small
  `src/buildmap/types.ts`, imported by both build modules and the CLI.

## Data flow

Unchanged. The same functions are called in the same order; only their file
locations and import paths move. The app still rasterizes the identical ellipses
from `src/core/` that the CLI rasterizes with `sharp`.

## Error handling

The refactor is mechanical (file moves + import rewrites + one file split). The
only failure mode is a missed import path, caught by three gates: `npm run
typecheck`, the existing test suite, and the `app/` build (`tsc --noEmit && vite
build`). No runtime error handling changes.

## Testing

- All 13 existing test files pass after import-path updates.
- New `tests/core/no-node-imports.test.ts` guard passes (and would fail if a Node
  import were added to `src/core/`).
- `npm run typecheck` clean.
- `app/` build clean: `cd app && npm run build` (`tsc --noEmit && vite build`) —
  proves the app's new `../../src/core/*` imports resolve and bundle.
- `buildmap` smoke using its per-spec cache (no `PIXELLAB_API_KEY` needed):
  `npm run buildmap examples/grass-map.json` reuses the cached map and emits the
  game, proving the split changed no behavior.

## Scope guardrails (YAGNI — explicitly out)

- No npm workspaces / monorepo packages (that was Approach B).
- No renaming `src/sheet/` → `src/imaging/`.
- No DRYing the five hand-rolled CLI arg parsers.
- No consolidating the three HTML templates or unifying the esm.sh Excalibur
  version with the app's npm version.
- No behavior changes to generation, collision math, or the app UI.

## Reuse / refactor notes

- The pure-core extraction is the single source of truth the app and CLI already
  share; we are making that boundary explicit and enforced, not inventing it.
- `buildmap` already imports `footprintEllipse` from the pure module; after the
  move it imports from `src/core/footprint.js`.
