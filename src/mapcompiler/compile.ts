import type { MapIR, CompiledMap } from "./types.js";
import { normalizeMapIR } from "./normalizeMapIR.js";
import { rasterizeLayers } from "./rasterizeLayers.js";
import { compileObjects } from "./compileObjects.js";
import { compileCollision } from "./compileCollision.js";
import { compileMovementCost } from "./compileMovementCost.js";
import { buildNavigationGraph } from "./buildNavigationGraph.js";
import { validateMap } from "./validateMap.js";

export function compile(mapIR: MapIR): CompiledMap {
  const map = normalizeMapIR(mapIR);
  const terrain = rasterizeLayers(map);
  const objects = compileObjects(map.layers.buildings, map.layers.bridges, map.layers.props);
  const { collision, walkable } = compileCollision(terrain, map.legend, objects);
  const movementCost = compileMovementCost(terrain, map.legend);
  const navGraph = buildNavigationGraph(walkable, movementCost);

  const compiled: CompiledMap = {
    mapId: map.mapId, name: map.name, tileSize: map.tileSize, width: map.width, height: map.height,
    terrain, collision, walkable, movementCost, objects,
    pois: map.layers.poi, spawns: map.layers.spawns, navGraph,
    validation: { ok: true, errors: [], warnings: [] },
  };
  compiled.validation = validateMap(compiled);
  return compiled;
}
