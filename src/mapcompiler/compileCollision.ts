import type { TerrainLegend, CompiledObject } from "./types.js";

export interface CollisionResult { collision: boolean[][]; walkable: boolean[][]; }

/**
 * collision = !legend[terrain].walkable, then object overlays in this order:
 *   bridge → false (clears underlying water)
 *   building footprint → true
 *   door → false
 * Unknown terrain keys are treated as blocked (defensive).
 */
export function compileCollision(
  terrain: string[][], legend: Record<string, TerrainLegend>, objects: CompiledObject[],
): CollisionResult {
  const h = terrain.length, w = terrain[0]?.length ?? 0;
  const collision: boolean[][] = terrain.map((row) =>
    row.map((k) => !(legend[k]?.walkable ?? false)),
  );
  const set = (tx: number, ty: number, blocked: boolean) => {
    if (ty >= 0 && ty < h && tx >= 0 && tx < w) collision[ty][tx] = blocked;
  };
  for (const o of objects) if (o.kind === "bridge") for (const [x, y] of o.tiles) set(x, y, false);
  for (const o of objects) if (o.kind === "building") for (const [x, y] of o.tiles) set(x, y, true);
  for (const o of objects) if (o.kind === "door") for (const [x, y] of o.tiles) set(x, y, false);
  const walkable = collision.map((row) => row.map((c) => !c));
  return { collision, walkable };
}
