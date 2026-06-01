import type { TerrainLegend } from "./types.js";

export function compileMovementCost(terrain: string[][], legend: Record<string, TerrainLegend>): number[][] {
  return terrain.map((row) => row.map((k) => legend[k]?.movementCost ?? 999));
}
