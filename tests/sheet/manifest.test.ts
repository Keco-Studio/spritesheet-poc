import { describe, it, expect } from "vitest";
import { buildManifest } from "../../src/sheet/manifest.js";

describe("buildManifest", () => {
  it("single direction: row per action", () => {
    const m = buildManifest(64, ["south"], [
      { name: "idle", frames: 4 },
      { name: "walk", frames: 8 },
      { name: "attack", frames: 6 },
    ]);
    expect(m.rows).toBe(3);
    expect(m.columns).toBe(8);
    expect(m.directions).toEqual(["south"]);
    expect(m.actions.idle.rowByDirection).toEqual({ south: 0 });
    expect(m.actions.walk.rowByDirection).toEqual({ south: 1 });
    expect(m.actions.attack.rowByDirection).toEqual({ south: 2 });
  });

  it("4 directions × 2 actions: row = dirIdx * actions.length + actionIdx", () => {
    const m = buildManifest(64, ["south", "east", "north", "west"], [
      { name: "idle", frames: 4 },
      { name: "walk", frames: 8 },
    ]);
    expect(m.rows).toBe(8);
    expect(m.actions.idle.rowByDirection).toEqual({ south: 0, east: 2, north: 4, west: 6 });
    expect(m.actions.walk.rowByDirection).toEqual({ south: 1, east: 3, north: 5, west: 7 });
  });
});
