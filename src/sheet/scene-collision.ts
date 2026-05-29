// Pure, Node-free: safe to bundle into the browser (no sharp/fs imports).
import { footprintEllipse, pointInEllipse, type Rect, type Ellipse } from "./footprint.js";

/** A placed asset. (x,y) is the FEET point (bottom-center) in map coords. */
export type Placement = { assetId: string; x: number; y: number };
export type AssetDim = { w: number; h: number; footprint: number };
export type AssetLookup = Record<string, AssetDim>;

export function placementRect(p: Placement, a: AssetDim): Rect {
  return { x: p.x - a.w / 2, y: p.y - a.h, w: a.w, h: a.h };
}

export function placementEllipse(p: Placement, a: AssetDim): Ellipse {
  return footprintEllipse(placementRect(p, a), a.footprint);
}

export function colliders(placements: Placement[], lookup: AssetLookup): Ellipse[] {
  return placements
    .filter((p) => lookup[p.assetId])
    .map((p) => placementEllipse(p, lookup[p.assetId]));
}

export function isSolid(ellipses: Ellipse[], x: number, y: number): boolean {
  return ellipses.some((e) => pointInEllipse(e, x, y));
}

export type CollisionExport = {
  mapW: number;
  mapH: number;
  placements: Array<Placement & { footprint: number }>;
  colliders: Ellipse[];
};

export function buildCollisionExport(
  mapW: number,
  mapH: number,
  placements: Placement[],
  lookup: AssetLookup,
): CollisionExport {
  const known = placements.filter((p) => lookup[p.assetId]);
  return {
    mapW,
    mapH,
    placements: known.map((p) => ({ ...p, footprint: lookup[p.assetId].footprint })),
    colliders: known.map((p) => placementEllipse(p, lookup[p.assetId])),
  };
}
