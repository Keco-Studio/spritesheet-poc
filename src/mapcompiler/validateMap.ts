import type { CompiledMap, ValidationReport, ValidationIssue, TileCoord } from "./types.js";

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

function inBounds(m: CompiledMap, x: number, y: number): boolean {
  return x >= 0 && x < m.width && y >= 0 && y < m.height;
}
function neighbors(m: CompiledMap, x: number, y: number): TileCoord[] {
  return DIRS.map(([dx, dy]) => [x + dx, y + dy] as TileCoord).filter(([nx, ny]) => inBounds(m, nx, ny));
}
function adjacentWalkable(m: CompiledMap, x: number, y: number): boolean {
  return neighbors(m, x, y).some(([nx, ny]) => m.walkable[ny][nx]);
}
function isWater(m: CompiledMap, x: number, y: number): boolean {
  return inBounds(m, x, y) && m.terrain[y][x] === "water";
}

/** BFS flood of walkable tiles reachable from a start; returns a Set of "x,y". */
function reachable(m: CompiledMap, sx: number, sy: number): Set<string> {
  const seen = new Set<string>();
  if (!inBounds(m, sx, sy) || !m.walkable[sy][sx]) return seen;
  const q: TileCoord[] = [[sx, sy]];
  seen.add(`${sx},${sy}`);
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [nx, ny] of neighbors(m, x, y)) {
      const k = `${nx},${ny}`;
      if (!seen.has(k) && m.walkable[ny][nx]) { seen.add(k); q.push([nx, ny]); }
    }
  }
  return seen;
}

export function validateMap(m: CompiledMap): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 7. Bounds (objects, pois, spawns)
  for (const p of m.pois)
    if (!inBounds(m, p.x, p.y)) errors.push({ rule: "objects_inside_bounds", severity: "error",
      message: `POI ${p.id} at (${p.x},${p.y}) is out of bounds`, objectId: p.id, tile: [p.x, p.y] });
  for (const s of m.spawns)
    if (!inBounds(m, s.x, s.y)) errors.push({ rule: "objects_inside_bounds", severity: "error",
      message: `Spawn ${s.id} at (${s.x},${s.y}) is out of bounds`, objectId: s.id, tile: [s.x, s.y] });
  for (const o of m.objects)
    for (const [x, y] of o.tiles)
      if (!inBounds(m, x, y)) { errors.push({ rule: "objects_inside_bounds", severity: "error",
        message: `Object ${o.id} has a tile (${x},${y}) out of bounds`, objectId: o.id, tile: [x, y] }); break; }

  // 1. Spawn walkability
  for (const s of m.spawns)
    if (inBounds(m, s.x, s.y) && !m.walkable[s.y][s.x])
      errors.push({ rule: "spawns_are_walkable", severity: "error",
        message: `Spawn ${s.id} is placed on a blocked tile at (${s.x},${s.y})`, objectId: s.id, tile: [s.x, s.y] });

  // 2. POI walkable or adjacent to walkable
  for (const p of m.pois)
    if (inBounds(m, p.x, p.y) && !m.walkable[p.y][p.x] && !adjacentWalkable(m, p.x, p.y))
      errors.push({ rule: "pois_walkable_or_adjacent", severity: "error",
        message: `POI ${p.id} at (${p.x},${p.y}) is blocked and has no walkable neighbour`, objectId: p.id, tile: [p.x, p.y] });

  // 3. POI reachability from the first spawn
  const first = m.spawns[0];
  if (first && inBounds(m, first.x, first.y)) {
    const reach = reachable(m, first.x, first.y);
    const near = (x: number, y: number) =>
      reach.has(`${x},${y}`) || neighbors(m, x, y).some(([nx, ny]) => reach.has(`${nx},${ny}`));
    for (const p of m.pois)
      if (inBounds(m, p.x, p.y) && !near(p.x, p.y))
        errors.push({ rule: "pois_reachable", severity: "error",
          message: `POI ${p.id} is not reachable from spawn ${first.id}`, objectId: p.id, tile: [p.x, p.y] });
  } else if (m.pois.length) {
    warnings.push({ rule: "pois_reachable", severity: "warning", message: "no valid spawn to check POI reachability from" });
  }

  // 4. Building entrances
  for (const o of m.objects) {
    if (o.kind !== "building") continue;
    const entrance = o.meta?.entrance as { x: number; y: number } | undefined;
    if (!entrance) { errors.push({ rule: "building_entrances", severity: "error",
      message: `Building ${o.id} has no entrance`, objectId: o.id }); continue; }
    if (!inBounds(m, entrance.x, entrance.y) || !m.walkable[entrance.y][entrance.x])
      errors.push({ rule: "building_entrances", severity: "error",
        message: `Building ${o.id} entrance (${entrance.x},${entrance.y}) is not walkable`, objectId: o.id, tile: [entrance.x, entrance.y] });
    else {
      const connects = neighbors(m, entrance.x, entrance.y).some(([nx, ny]) => {
        const t = m.terrain[ny][nx];
        return m.walkable[ny][nx] && (t === "road" || t === "plaza" || t === "grass" || t === "village_ground");
      });
      if (!connects) warnings.push({ rule: "building_entrances", severity: "warning",
        message: `Building ${o.id} entrance is not adjacent to road/plaza/grass`, objectId: o.id, tile: [entrance.x, entrance.y] });
    }
  }

  // 5. Bridge validity: touches water AND has an adjacent non-water walkable tile
  for (const o of m.objects) {
    if (o.kind !== "bridge") continue;
    const touchesWater = o.tiles.some(([x, y]) =>
      neighbors(m, x, y).some(([nx, ny]) => isWater(m, nx, ny)) || isWater(m, x, y));
    const landSide = o.tiles.some(([x, y]) =>
      neighbors(m, x, y).some(([nx, ny]) => m.walkable[ny][nx] && !isWater(m, nx, ny)));
    if (!touchesWater) errors.push({ rule: "bridges_cross_water", severity: "error",
      message: `Bridge ${o.id} does not touch water`, objectId: o.id });
    if (!landSide) errors.push({ rule: "bridges_cross_water", severity: "error",
      message: `Bridge ${o.id} does not connect to walkable land`, objectId: o.id });
  }

  // 5b. Bridge walkability: every tile of a bridge must be walkable after collision compilation
  for (const o of m.objects) {
    if (o.kind !== "bridge") continue;
    for (const [x, y] of o.tiles) {
      if (inBounds(m, x, y) && !m.walkable[y][x]) {
        errors.push({ rule: "bridges_are_walkable", severity: "error",
          message: `Bridge ${o.id} tile (${x},${y}) is blocked (overlapped by a building or other blocker)`,
          objectId: o.id, tile: [x, y] });
      }
    }
  }

  // 6. River crossing: if any water exists, require at least one valid bridge
  const hasWater = m.terrain.some((row) => row.some((t) => t === "water"));
  const hasBridge = m.objects.some((o) => o.kind === "bridge");
  if (hasWater && !hasBridge)
    warnings.push({ rule: "river_crossing_exists", severity: "warning", message: "map has water but no bridges" });

  return { ok: errors.length === 0, errors, warnings };
}
