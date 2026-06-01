import type { NavGraph, NavNode, NavEdge } from "./types.js";

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

export function buildNavigationGraph(walkable: boolean[][], movementCost: number[][]): NavGraph {
  const h = walkable.length, w = walkable[0]?.length ?? 0;
  const nodes: NavNode[] = [];
  const edges: NavEdge[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!walkable[y][x]) continue;
      nodes.push({ id: `${x},${y}`, x, y, walkable: true, cost: movementCost[y][x] });
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && walkable[ny][nx]) {
          edges.push({ from: `${x},${y}`, to: `${nx},${ny}`, cost: movementCost[ny][nx] });
        }
      }
    }
  }
  return { nodes, edges };
}
