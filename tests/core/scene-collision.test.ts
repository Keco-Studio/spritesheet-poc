import { describe, it, expect } from "vitest";
import { placementRect, colliders, isSolid, buildCollisionExport } from "../../src/core/scene-collision.js";

const lookup = {
  tree: { w: 40, h: 60, footprint: 0.3 },
  pond: { w: 80, h: 50, footprint: 1.0 },
};

describe("placementRect", () => {
  it("reconstructs the rect from feet (bottom-center) + asset size", () => {
    expect(placementRect({ assetId: "tree", x: 100, y: 200 }, lookup.tree)).toEqual({ x: 80, y: 140, w: 40, h: 60 });
  });
});
describe("colliders", () => {
  it("makes one ellipse per known, placed asset", () => {
    const cs = colliders([{ assetId: "tree", x: 100, y: 200 }], lookup);
    expect(cs).toHaveLength(1);
    expect(cs[0].cx).toBe(100);
  });
  it("skips placements whose assetId is unknown", () => {
    expect(colliders([{ assetId: "ghost", x: 0, y: 0 }], lookup)).toHaveLength(0);
  });
});
describe("isSolid", () => {
  it("is true inside a collider and false outside", () => {
    const cs = colliders([{ assetId: "pond", x: 100, y: 100 }], lookup);
    expect(isSolid(cs, 100, 90)).toBe(true);
    expect(isSolid(cs, 300, 300)).toBe(false);
  });
});
describe("buildCollisionExport", () => {
  it("includes dims, placements with footprint, and colliders", () => {
    const out = buildCollisionExport(256, 256, [{ assetId: "tree", x: 100, y: 200 }], lookup);
    expect(out).toMatchObject({ mapW: 256, mapH: 256 });
    expect(out.placements[0]).toEqual({ assetId: "tree", x: 100, y: 200, footprint: 0.3 });
    expect(out.colliders).toHaveLength(1);
  });
});
