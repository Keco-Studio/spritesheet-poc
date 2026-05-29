import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { generateTileset } from "../../src/pixellab/tileset.js";
import type { PixelLabClient } from "../../src/pixellab/client.js";

/**
 * Build a raw-RGBA base64 string for a width x height square, every byte = fill.
 * This mirrors what the real /create-tileset job returns in
 * last_response.image.base64 — RAW RGBA bytes (NOT a PNG, NOT a storage_url).
 */
function rawRgbaBase64(width: number, height: number, fill = 0xff): string {
  return Buffer.alloc(width * height * 4, fill).toString("base64");
}

/**
 * Hand-rolled fake PixelLabClient. post() returns a fixed create-tileset
 * response; get() pops the next queued background-job response. Both are
 * vi.fn() so callers can assert on arguments.
 */
function makeClient(opts: {
  postResponse?: unknown;
  getResponses: unknown[];
}): PixelLabClient {
  const getQueue = [...opts.getResponses];
  const post = vi.fn(async (_path: string, _body: unknown) => {
    return (
      opts.postResponse ?? {
        background_job_id: "job1",
        tileset_id: "ts1",
        status: "processing",
      }
    );
  });
  const get = vi.fn(async (_path: string) => {
    if (getQueue.length === 0) {
      throw new Error("fake client: get() called more times than queued");
    }
    return getQueue.shift();
  });
  // The PixelLabClient signatures are generic; the fake erases generics, so cast.
  return { post, get } as unknown as PixelLabClient;
}

describe("generateTileset", () => {
  it("happy path: decodes raw RGBA to a PNG and builds meta", async () => {
    const client = makeClient({
      postResponse: { background_job_id: "job1", tileset_id: "ts1", status: "processing" },
      getResponses: [
        // message_done returned on the FIRST poll to avoid real 3s waits.
        {
          status: "processing",
          last_response: {
            type: "message_done",
            tileset_name: "grass -> sand",
            progress: 1,
            image: { type: "base64", base64: rawRgbaBase64(4, 4), width: 4, height: 4 },
          },
        },
      ],
    });

    const result = await generateTileset(client, {
      lowerDescription: "grass",
      upperDescription: "sand path",
    });

    // pngBase64 must be a bare base64 string with no data: prefix.
    expect(result.pngBase64).not.toMatch(/^data:/);
    const meta = await sharp(Buffer.from(result.pngBase64, "base64")).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(4);
    expect(meta.height).toBe(4);

    expect(result.meta.tilesetId).toBe("ts1");
    expect(result.meta.tileWidth).toBe(16);
    expect(result.meta.tileHeight).toBe(16);
    expect(result.meta.width).toBe(4);
    expect(result.meta.height).toBe(4);
    expect(result.meta.columns).toBe(result.meta.width / result.meta.tileWidth);
    expect(result.meta.rows).toBe(result.meta.height / result.meta.tileHeight);
    expect(result.meta.name).toBe("grass -> sand");
  });

  it("sends the expected create-tileset request body for default opts", async () => {
    const client = makeClient({
      getResponses: [
        {
          status: "processing",
          last_response: {
            type: "message_done",
            image: { type: "base64", base64: rawRgbaBase64(4, 4), width: 4, height: 4 },
          },
        },
      ],
    });

    await generateTileset(client, {
      lowerDescription: "grass",
      upperDescription: "sand path",
    });

    expect(client.post).toHaveBeenCalledTimes(1);
    const [path, body] = (client.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/create-tileset");
    expect(body).toMatchObject({
      lower_description: "grass",
      upper_description: "sand path",
      tile_size: { width: 16, height: 16 },
      view: "high top-down",
    });
  });

  it("infers square dimensions when image width/height are absent", async () => {
    const client = makeClient({
      getResponses: [
        {
          status: "processing",
          last_response: {
            type: "message_done",
            // 64 raw bytes => 64/4 = 16 px => sqrt(16) = 4x4 square, no width/height.
            image: { type: "base64", base64: rawRgbaBase64(4, 4) },
          },
        },
      ],
    });

    const result = await generateTileset(client, {
      lowerDescription: "grass",
      upperDescription: "sand path",
    });

    expect(result.meta.width).toBe(4);
    expect(result.meta.height).toBe(4);
    const meta = await sharp(Buffer.from(result.pngBase64, "base64")).metadata();
    expect(meta.width).toBe(4);
    expect(meta.height).toBe(4);
  });

  it("ignores a non-done last_response before a done one (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      const client = makeClient({
        getResponses: [
          // First poll: still processing, no image yet.
          { status: "processing", last_response: { type: "message", progress: 0.5 } },
          // Second poll: done with image.
          {
            status: "processing",
            last_response: {
              type: "message_done",
              tileset_name: "grass -> sand",
              image: { type: "base64", base64: rawRgbaBase64(4, 4), width: 4, height: 4 },
            },
          },
        ],
      });

      const promise = generateTileset(client, {
        lowerDescription: "grass",
        upperDescription: "sand path",
      });

      // Drive the 3s poll sleep(s) to completion without real waits.
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(client.get).toHaveBeenCalledTimes(2);
      expect(result.meta.width).toBe(4);
      expect(result.meta.name).toBe("grass -> sand");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when the job status is failed", async () => {
    const client = makeClient({
      getResponses: [{ status: "failed" }],
    });

    await expect(
      generateTileset(client, {
        lowerDescription: "grass",
        upperDescription: "sand path",
      }),
    ).rejects.toThrow();
  });
});
