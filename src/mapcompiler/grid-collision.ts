// sheet-poc-original (not vendored): tile-grid collision sampling for walking a CompiledMap.
export interface Grid {
  walkable: boolean[][]; // [y][x] — true = passable
  width: number;
  height: number;
  tileSize: number;
}

/** Floor a world-pixel coordinate to its tile index. */
export function worldToTile(px: number, tileSize: number): number {
  return Math.floor(px / tileSize);
}

/** True if the tile under the given world point is in bounds and walkable. */
export function isWalkableAt(grid: Grid, worldX: number, worldY: number): boolean {
  const tx = worldToTile(worldX, grid.tileSize);
  const ty = worldToTile(worldY, grid.tileSize);
  if (tx < 0 || tx >= grid.width || ty < 0 || ty >= grid.height) return false;
  return grid.walkable[ty][tx];
}
