import { describe, it, expect } from "vitest";
import { parseManifest, toAssetLookup } from "../../src/core/manifest-schema.js";

const good = {
  assets: [
    { id: "tree", name: "Tree", file: "tree.png", footprint: 0.3, w: 40, h: 60 },
    { id: "pond", name: "Pond", file: "pond.png", footprint: 1.0, w: 80, h: 50 },
  ],
};

describe("parseManifest", () => {
  it("accepts a valid manifest", () => {
    expect(parseManifest(good).assets).toHaveLength(2);
  });
  it("rejects footprint out of range", () => {
    expect(() => parseManifest({ assets: [{ ...good.assets[0], footprint: 2 }] })).toThrow();
  });
  it("rejects a missing file field", () => {
    expect(() => parseManifest({ assets: [{ id: "x", name: "X", footprint: 0.5, w: 1, h: 1 }] })).toThrow();
  });
});
describe("toAssetLookup", () => {
  it("maps id -> {w,h,footprint}", () => {
    expect(toAssetLookup(parseManifest(good)).tree).toEqual({ w: 40, h: 60, footprint: 0.3 });
  });
});
