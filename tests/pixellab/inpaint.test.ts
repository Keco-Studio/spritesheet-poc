import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { inpaint } from "../../src/pixellab/inpaint.js";
import type { PixelLabClient } from "../../src/pixellab/client.js";

async function pngB64(size: number): Promise<string> {
  const buf = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

function makeClient(postResponse: unknown): { client: PixelLabClient; post: ReturnType<typeof vi.fn> } {
  const post = vi.fn(async (_p: string, _b: unknown) => postResponse);
  const get = vi.fn(async () => {
    throw new Error("get() should not be called — /inpaint is synchronous");
  });
  return { client: { post, get } as unknown as PixelLabClient, post };
}

describe("inpaint", () => {
  it("posts the source + mask and returns the edited image", async () => {
    const base = await pngB64(64);
    const mask = await pngB64(64);
    const edited = await pngB64(64);
    const { client, post } = makeClient({ image: { type: "base64", base64: edited, format: "png" } });

    const result = await inpaint(client, {
      baseImagePng: base,
      maskPng: mask,
      description: "an oak tree",
      size: 64,
    });

    expect(result.pngBase64.startsWith("data:")).toBe(false);
    const md = await sharp(Buffer.from(result.pngBase64, "base64")).metadata();
    expect(md.format).toBe("png");

    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/inpaint");
    expect(body).toMatchObject({
      description: "an oak tree",
      image_size: { width: 64, height: 64 },
      inpainting_image: { type: "base64", base64: base },
      mask_image: { type: "base64", base64: mask },
    });
  });

  it("rejects sizes over the 200px sync /inpaint cap", async () => {
    const { client } = makeClient({ image: { base64: "x" } });
    await expect(
      inpaint(client, { baseImagePng: "a", maskPng: "b", description: "x", size: 320 }),
    ).rejects.toThrow(/16\.\.200/);
  });

  it("throws when no image is returned", async () => {
    const { client } = makeClient({ image: undefined });
    await expect(
      inpaint(client, { baseImagePng: "a", maskPng: "b", description: "x", size: 64 }),
    ).rejects.toThrow(/no image/i);
  });
});
