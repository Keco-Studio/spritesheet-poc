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
