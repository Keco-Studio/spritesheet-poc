import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { removeFlatBackground } from "../../src/sheet/transparency.js";

/** Build an 8x8 RGBA raw image from a per-pixel painter, return as PNG. */
async function makePng(paint: (x: number, y: number) => [number, number, number]): Promise<Buffer> {
  const w = 8, h = 8;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = paint(x, y);
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3];
}

const GRAY: [number, number, number] = [128, 128, 128];
const RED: [number, number, number] = [200, 30, 30];

describe("removeFlatBackground", () => {
  it("clears border-connected background and keeps the subject opaque", async () => {
    // gray everywhere except a 2x2 red block at (3,3)-(4,4)
    const png = await makePng((x, y) =>
      x >= 3 && x <= 4 && y >= 3 && y <= 4 ? RED : GRAY,
    );
    const out = await removeFlatBackground(png);

    expect(await alphaAt(out, 0, 0)).toBe(0); // corner bg cleared
    expect(await alphaAt(out, 7, 7)).toBe(0); // opposite corner cleared
    expect(await alphaAt(out, 3, 3)).toBe(255); // red subject kept
    expect(await alphaAt(out, 4, 4)).toBe(255);
  });

  it("preserves a gray pixel fully enclosed by the subject (not border-connected)", async () => {
    // red ring (rows/cols 2..5) with a single gray pixel trapped at (3,3)
    const png = await makePng((x, y) => {
      const inRing = x >= 2 && x <= 5 && y >= 2 && y <= 5;
      if (!inRing) return GRAY; // outer background
      if (x === 3 && y === 3) return GRAY; // trapped interior gray
      return RED;
    });
    const out = await removeFlatBackground(png);

    expect(await alphaAt(out, 0, 0)).toBe(0); // outer bg cleared
    expect(await alphaAt(out, 3, 3)).toBe(255); // enclosed gray survives (flood fill can't reach it)
    expect(await alphaAt(out, 2, 2)).toBe(255); // ring kept
  });
});
