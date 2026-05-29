import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { generateMap } from "../../src/pixellab/map.js";
import type { PixelLabClient } from "../../src/pixellab/client.js";

/** A tiny valid PNG (w x h, solid fill) as base64 — what pixflux returns inline. */
async function pngBase64(width: number, height: number): Promise<string> {
  const buf = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

function makeClient(postResponse: unknown): { client: PixelLabClient; post: ReturnType<typeof vi.fn> } {
  const post = vi.fn(async (_path: string, _body: unknown) => postResponse);
  const get = vi.fn(async (_path: string) => {
    throw new Error("get() should not be called — pixflux is synchronous");
  });
  const client = { post, get } as unknown as PixelLabClient;
  return { client, post };
}

describe("generateMap", () => {
  it("returns the inline PNG and clamped square meta (happy path)", async () => {
    const img = await pngBase64(64, 64);
    const { client, post } = makeClient({ image: { type: "base64", base64: img, format: "png" } });

    const result = await generateMap(client, { description: "grass field", size: 256 });

    // image passes through as a valid PNG, no data: prefix
    expect(result.pngBase64.startsWith("data:")).toBe(false);
    const meta = await sharp(Buffer.from(result.pngBase64, "base64")).metadata();
    expect(meta.format).toBe("png");
    expect(result.meta).toEqual({ width: 256, height: 256 });

    // request body shape
    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/create-image-pixflux");
    expect(body).toMatchObject({
      description: "grass field",
      image_size: { width: 256, height: 256 },
      view: "high top-down",
    });
  });

  it("clamps size to the pixflux 16..400 range", async () => {
    const img = await pngBase64(8, 8);
    const { client, post } = makeClient({ image: { base64: img } });

    const tooBig = await generateMap(client, { description: "x", size: 999 });
    expect(tooBig.meta).toEqual({ width: 400, height: 400 });
    expect((post.mock.calls[0][1] as { image_size: { width: number } }).image_size.width).toBe(400);
  });

  it("strips a data: URL prefix if present", async () => {
    const img = await pngBase64(8, 8);
    const { client } = makeClient({ image: { base64: `data:image/png;base64,${img}` } });

    const result = await generateMap(client, { description: "x", size: 64 });
    expect(result.pngBase64).toBe(img);
  });

  it("throws when no image is returned", async () => {
    const { client } = makeClient({ image: undefined });
    await expect(generateMap(client, { description: "x" })).rejects.toThrow(/no image/i);
  });
});
