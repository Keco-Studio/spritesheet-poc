import sharp from "sharp";
import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";
import { waitForJob } from "./poll.js";

type StartResponse = { background_job_id: string };

/**
 * Returns `frameCount` base64 PNG strings (no data: prefix), each resized to `size`×`size`.
 *
 * animate-with-text-v3 sometimes returns `frameCount + 1` images (the input frame echoed
 * back as image[0], followed by the new frames). We drop any leading frames and resize
 * defensively in case the model returns at a non-matching resolution.
 */
export async function animateAction(
  client: PixelLabClient,
  firstFrameBase64: string,
  action: string,
  frameCount: number,
  size: number,
): Promise<string[]> {
  const start = await client.post<StartResponse>("/animate-with-text-v3", {
    first_frame: { type: "base64", base64: firstFrameBase64 },
    action,
    frame_count: frameCount,
  });

  const job = await waitForJob(client, start.background_job_id);
  const images = job.last_response?.images;
  if (!Array.isArray(images) || images.length === 0) {
    throw new PixelLabError(
      `animate-with-text-v3 completed but no images returned`,
      undefined,
      JSON.stringify(job.last_response).slice(0, 500),
    );
  }

  const trimmed = images.slice(images.length - frameCount);
  return Promise.all(
    trimmed.map(async (img) => {
      const raw = stripDataUrl(img.base64);
      const buf = Buffer.from(raw, "base64");
      const resized = await sharp(buf).resize(size, size, { kernel: "nearest" }).png().toBuffer();
      return resized.toString("base64");
    }),
  );
}

function stripDataUrl(s: string): string {
  const i = s.indexOf(",");
  return i >= 0 && s.startsWith("data:") ? s.slice(i + 1) : s;
}
