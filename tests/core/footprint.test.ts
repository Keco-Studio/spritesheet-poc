import { describe, it, expect } from "vitest";
import { footprintEllipse, pointInEllipse } from "../../src/core/footprint.js";

describe("footprintEllipse", () => {
  it("centers a full-footprint ellipse on the rect", () => {
    const e = footprintEllipse({ x: 0, y: 0, w: 100, h: 80 }, 1.0);
    expect(e).toEqual({ cx: 50, cy: 40, rx: 50, ry: 40 });
  });
  it("puts a partial footprint at the base (bottom band)", () => {
    const e = footprintEllipse({ x: 10, y: 20, w: 40, h: 100 }, 0.3);
    expect(e.cx).toBe(30);
    expect(e.rx).toBe(20);
    expect(e.ry).toBe(15);
    expect(e.cy).toBe(20 + 100 - 15);
  });
  it("clamps ry to at least 1", () => {
    expect(footprintEllipse({ x: 0, y: 0, w: 10, h: 10 }, 0).ry).toBe(1);
  });
});
describe("pointInEllipse", () => {
  const e = { cx: 50, cy: 50, rx: 20, ry: 10 };
  it("is true at the center and inside", () => {
    expect(pointInEllipse(e, 50, 50)).toBe(true);
    expect(pointInEllipse(e, 60, 50)).toBe(true);
  });
  it("is false outside", () => {
    expect(pointInEllipse(e, 50, 65)).toBe(false);
    expect(pointInEllipse(e, 75, 50)).toBe(false);
  });
});
