import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { packSheet } from "../../src/sheet/pack.js";

async function solid(size: number, r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("packSheet", () => {
  it("composes a grid with correct dimensions and pixel offsets", async () => {
    const red = await solid(64, 255, 0, 0);
    const green = await solid(64, 0, 255, 0);
    const blue = await solid(64, 0, 0, 255);
    const yellow = await solid(64, 255, 255, 0);

    const sheet = await packSheet(64, 2, 2, [
      [red, green],
      [blue, yellow],
    ]);

    const img = sharp(sheet);
    const meta = await img.metadata();
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(128);

    const { data } = await img.raw().toBuffer({ resolveWithObject: true });
    expect([data[(32 * 128 + 32) * 4 + 0], data[(32 * 128 + 32) * 4 + 1], data[(32 * 128 + 32) * 4 + 2]]).toEqual([255, 0, 0]);
    expect([data[(32 * 128 + 96) * 4 + 0], data[(32 * 128 + 96) * 4 + 1], data[(32 * 128 + 96) * 4 + 2]]).toEqual([0, 255, 0]);
    expect([data[(96 * 128 + 32) * 4 + 0], data[(96 * 128 + 32) * 4 + 1], data[(96 * 128 + 32) * 4 + 2]]).toEqual([0, 0, 255]);
    expect([data[(96 * 128 + 96) * 4 + 0], data[(96 * 128 + 96) * 4 + 1], data[(96 * 128 + 96) * 4 + 2]]).toEqual([255, 255, 0]);
  });

  it("leaves short rows transparent", async () => {
    const red = await solid(64, 255, 0, 0);
    const sheet = await packSheet(64, 2, 1, [[red]]);
    const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = data[(32 * info.width + 96) * 4 + 3];
    expect(alpha).toBe(0);
  });
});
