import { describe, it, expect } from "vitest";
import { colliders, isSolid } from "../../src/core/scene-collision.js";

const lookup = { rock: { w: 60, h: 60, footprint: 1.0 } };
// one solid rock centered at feet (200,200): footprint 1.0 => ellipse rx=30, ry=30, cy=170
const ellipses = colliders([{ assetId: "rock", x: 200, y: 200 }], lookup);

const FOOT = 64 * 0.9 * 0.25;
function walk(dx: number, dy: number, sx: number, sy: number, steps = 600): { x: number; y: number } {
  let x = sx, y = sy;
  const dt = 1 / 60, SPEED = 70;
  for (let i = 0; i < steps; i++) {
    const len = Math.hypot(dx, dy), step = SPEED * dt;
    const nx = x + (dx / len) * step, ny = y + (dy / len) * step;
    if (!isSolid(ellipses, nx, y + FOOT)) x = nx;
    if (!isSolid(ellipses, x, ny + FOOT)) y = ny;
  }
  return { x, y };
}

describe("collision sim", () => {
  it("blocks a player walking into a solid rock", () => {
    const end = walk(0, 1, 200, 100); // walk south toward the rock from above
    expect(end.y).toBeLessThan(170); // stopped before the ellipse (cy=170)
  });
  it("lets a player cross open space", () => {
    const end = walk(1, 0, 400, 400, 300); // far from the rock
    expect(end.x).toBeGreaterThan(400 + 100); // moved freely
  });
});
