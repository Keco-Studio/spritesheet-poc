import type { CompiledMap, TileCoord } from "./types.js";

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

/**
 * Smallest per-step cost among walkable tiles. Scaling the Manhattan heuristic by
 * this keeps it ADMISSIBLE when roads cost < 1 (real roads 0.8) — without it A* can
 * return a non-optimal path and fail the "roads preferred" criterion.
 */
function minStepCost(map: CompiledMap): number {
  let min = Infinity;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (map.walkable[y][x]) min = Math.min(min, map.movementCost[y][x]);
  return Number.isFinite(min) ? min : 1;
}

/** A* over the walkable grid. Returns [] if no route (or start/goal blocked). */
export function findPath(map: CompiledMap, start: TileCoord, goal: TileCoord): TileCoord[] {
  const { walkable, movementCost, width: w, height: h } = map;
  const [sx, sy] = start, [gx, gy] = goal;
  const inBounds = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h;
  if (!inBounds(sx, sy) || !inBounds(gx, gy) || !walkable[sy][sx] || !walkable[gy][gx]) return [];

  const hw = minStepCost(map);
  const heuristic = (ax: number, ay: number, bx: number, by: number) =>
    hw * (Math.abs(ax - bx) + Math.abs(ay - by)); // admissible Manhattan
  const key = (x: number, y: number) => y * w + x;
  const gScore = new Map<number, number>();
  const came = new Map<number, number>();
  const open = new Map<number, number>(); // key -> fScore
  gScore.set(key(sx, sy), 0);
  open.set(key(sx, sy), heuristic(sx, sy, gx, gy));

  while (open.size) {
    let curKey = -1, curF = Infinity;
    for (const [k, f] of open) if (f < curF) { curF = f; curKey = k; }
    const cx = curKey % w, cy = Math.floor(curKey / w);
    if (cx === gx && cy === gy) {
      const path: TileCoord[] = [];
      let k: number | undefined = curKey;
      while (k !== undefined) { path.push([k % w, Math.floor(k / w)]); k = came.get(k); }
      return path.reverse();
    }
    open.delete(curKey);
    const cg = gScore.get(curKey)!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny) || !walkable[ny][nx]) continue;
      const nk = key(nx, ny);
      const tentative = cg + movementCost[ny][nx];
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        came.set(nk, curKey);
        gScore.set(nk, tentative);
        open.set(nk, tentative + heuristic(nx, ny, gx, gy));
      }
    }
  }
  return [];
}
