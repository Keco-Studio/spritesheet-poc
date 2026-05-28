import { describe, it, expect } from "vitest";
import { buildManifest } from "../../src/sheet/manifest.js";

describe("buildManifest", () => {
  it("rows match action order, columns = max frames", () => {
    const m = buildManifest(64, [
      { name: "idle", frames: 4 },
      { name: "walk", frames: 8 },
      { name: "attack", frames: 6 },
    ]);
    expect(m).toEqual({
      image: "spritesheet.png",
      frameSize: 64,
      columns: 8,
      rows: 3,
      actions: {
        idle:   { row: 0, frameCount: 4, durationMs: 100 },
        walk:   { row: 1, frameCount: 8, durationMs: 100 },
        attack: { row: 2, frameCount: 6, durationMs: 100 },
      },
    });
  });
});
