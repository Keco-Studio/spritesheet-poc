# src/mapcompiler — vendored

These modules are a **one-time copy** of the pure compiler from the sibling
`ai-map-compiler` repo (`src/compiler/*` + `src/game/Pathfinding.ts`). That repo is
the source of truth. `Pathfinding.ts`'s import of `./types.js` was adjusted for the
flat layout here. Do not edit these to add features — port changes from
`ai-map-compiler` instead. The only sheet-poc-original file here is
`grid-collision.ts`.
