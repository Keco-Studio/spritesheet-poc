import type { TerrainShape } from "./types.js";
import type { NormalizedMapIR } from "./normalizeMapIR.js";
import { tileInRect, tileInPolygon, tileInEllipse, tileInPolylineBuffer } from "./shapes.js";

/** Legend key a shape paints with. */
function key(s: TerrainShape): string {
  return s.terrain ?? s.type;
}

function paintShape(terrain: string[][], width: number, height: number, s: TerrainShape): void {
  const k = key(s);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      switch (s.shape) {
        case "rect":
          hit = tileInRect(x, y, { x: s.x ?? 0, y: s.y ?? 0, w: s.w ?? 0, h: s.h ?? 0 });
          break;
        case "polygon":
          hit = !!s.points && tileInPolygon(x, y, s.points);
          break;
        case "ellipse": {
          const rx = (s.w ?? 0) / 2, ry = (s.h ?? 0) / 2;
          hit = tileInEllipse(x, y, { cx: (s.x ?? 0) + rx, cy: (s.y ?? 0) + ry, rx, ry });
          break;
        }
        case "polyline_buffer":
          hit = !!s.points && tileInPolylineBuffer(x, y, s.points, s.width ?? 1);
          break;
      }
      if (hit) terrain[y][x] = k;
    }
  }
}

/**
 * Paint the terrain grid in render order. Buildings/bridges/doors/props/poi/spawns
 * are objects, not terrain — they are handled by the collision compiler, NOT here.
 */
export function rasterizeLayers(map: NormalizedMapIR): string[][] {
  const { width, height } = map;
  const terrain: string[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "grass"),
  );
  const order: TerrainShape[][] = [
    map.layers.base_terrain,
    map.layers.mountains,
    map.layers.cliffs,
    map.layers.water,
    map.layers.vegetation,
    map.layers.farm,
    map.layers.village_ground,
    map.layers.roads,
  ];
  for (const layer of order) for (const s of layer) paintShape(terrain, width, height, s);
  return terrain;
}
