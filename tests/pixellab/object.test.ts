import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { generateObject } from "../../src/pixellab/object.js";
import type { PixelLabClient } from "../../src/pixellab/client.js";

async function pngB64(size: number, rgb: { r: number; g: number; b: number }): Promise<string> {
  const buf = await sharp({
    create: { width: size, height: size, channels: 4, background: { ...rgb, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

function makeClient(postResponse: unknown): { client: PixelLabClient; post: ReturnType<typeof vi.fn> } {
  const post = vi.fn(async (_p: string, _b: unknown) => postResponse);
  const get = vi.fn(async () => {
    throw new Error("get() should not be called — pixflux is synchronous");
  });
  return { client: { post, get } as unknown as PixelLabClient, post };
}

describe("generateObject", () => {
  it("requests pixflux with no_background and returns a PNG sprite", async () => {
    const img = await pngB64(32, { r: 10, g: 200, b: 10 });
    const { client, post } = makeClient({ image: { type: "base64", base64: img, format: "png" } });

    const result = await generateObject(client, { description: "an oak tree", size: 64 });

    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/create-image-pixflux");
    expect(body).toMatchObject({
      description: "an oak tree",
      image_size: { width: 64, height: 64 },
      no_background: true,
    });

    expect(result.pngBase64.startsWith("data:")).toBe(false);
    const md = await sharp(Buffer.from(result.pngBase64, "base64")).metadata();
    expect(md.format).toBe("png");
    expect(md.channels).toBe(4); // has alpha
  });

  it("throws when no image is returned", async () => {
    const { client } = makeClient({ image: undefined });
    await expect(generateObject(client, { description: "x" })).rejects.toThrow(/no image/i);
  });
});
