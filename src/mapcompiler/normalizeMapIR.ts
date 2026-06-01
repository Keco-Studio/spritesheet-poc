import type { MapIR, MapLayers } from "./types.js";

/** A MapIR whose optional layers are all present (possibly empty) arrays. */
export type NormalizedMapIR = MapIR & { layers: Required<MapLayers> };

export function normalizeMapIR(map: MapIR): NormalizedMapIR {
  const L = map.layers;
  return {
    ...map,
    layers: {
      base_terrain: L.base_terrain,
      water: L.water ?? [],
      mountains: L.mountains ?? [],
      cliffs: L.cliffs ?? [],
      roads: L.roads ?? [],
      bridges: L.bridges ?? [],
      village_ground: L.village_ground ?? [],
      farm: L.farm ?? [],
      vegetation: L.vegetation ?? [],
      buildings: L.buildings ?? [],
      props: L.props ?? [],
      poi: L.poi ?? [],
      spawns: L.spawns ?? [],
    },
  };
}
