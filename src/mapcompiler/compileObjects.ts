import type { BuildingObject, BridgeObject, PropObject, CompiledObject, TileCoord } from "./types.js";

function rectTiles(x: number, y: number, w: number, h: number): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) tiles.push([tx, ty]);
  return tiles;
}

export function buildingTiles(b: BuildingObject): TileCoord[] {
  return rectTiles(b.footprint.x, b.footprint.y, b.footprint.w, b.footprint.h);
}
export function doorTile(b: BuildingObject): TileCoord {
  return [b.entrance.x, b.entrance.y];
}

/** Flatten all object layers into a uniform CompiledObject list (footprint/door/bridge/prop). */
export function compileObjects(
  buildings: BuildingObject[], bridges: BridgeObject[], props: PropObject[],
): CompiledObject[] {
  const out: CompiledObject[] = [];
  for (const b of buildings) {
    out.push({ id: b.id, kind: "building", name: b.name, tiles: buildingTiles(b),
      meta: { entrance: b.entrance, activities: b.activities ?? [] } });
    out.push({ id: `${b.id}__door`, kind: "door", name: `${b.name} door`, tiles: [doorTile(b)],
      meta: { buildingId: b.id, direction: b.entrance.direction } });
  }
  for (const br of bridges) out.push({ id: br.id, kind: "bridge", tiles: br.tiles, meta: { connects: br.connects ?? [] } });
  for (const p of props) out.push({ id: p.id, kind: "prop", name: p.name, tiles: [[p.x, p.y]], meta: { tags: p.tags ?? [] } });
  return out;
}
