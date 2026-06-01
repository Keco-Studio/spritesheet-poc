import { describe, it, expect } from "vitest";
import { worldToTile, isWalkableAt, type Grid } from "../../src/mapcompiler/grid-collision.js";

describe("worldToTile", () => {
  it("floors world pixels to a tile index", () => {
    expect(worldToTile(0, 16)).toBe(0);
    expect(worldToTile(15.9, 16)).toBe(0);
    expect(worldToTile(16, 16)).toBe(1);
    expect(worldToTile(33, 16)).toBe(2);
  });
});

describe("isWalkableAt", () => {
  const grid: Grid = {
    width: 3, height: 2, tileSize: 16,
    walkable: [[true, false, true], [true, true, false]],
  };
  it("is true on a walkable tile", () => { expect(isWalkableAt(grid, 8, 8)).toBe(true); });      // tile (0,0)
  it("is false on a blocked tile", () => { expect(isWalkableAt(grid, 24, 8)).toBe(false); });     // tile (1,0)
  it("is false out of bounds", () => {
    expect(isWalkableAt(grid, -1, 8)).toBe(false);
    expect(isWalkableAt(grid, 48, 8)).toBe(false);   // x tile 3 (>= width)
    expect(isWalkableAt(grid, 8, 32)).toBe(false);   // y tile 2 (>= height)
  });
});
