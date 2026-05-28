import sharp from "sharp";
import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";
import { waitForJob } from "./poll.js";

type CreateCharacterStartResponse = { background_job_id: string };

/**
 * Returns the south-facing sprite as a raw base64 PNG (no data: prefix), resized to `size`×`size`.
 *
 * create-character-v3 persists the character and returns storage URLs rather than
 * inline base64, and the returned PNG is the model's native resolution (often >64px)
 * regardless of the requested image_size. We resize to `size` here so downstream
 * animation frames come back at the right resolution.
 */
export async function generateBaseSprite(
  client: PixelLabClient,
  description: string,
  size: number,
): Promise<string> {
  const start = await client.post<CreateCharacterStartResponse>(
    "/create-character-v3",
    { description, image_size: { width: size, height: size } },
  );

  const job = await waitForJob(client, start.background_job_id);
  const last = job.last_response as
    | { storage_urls?: Record<string, string> }
    | undefined;
  const southUrl = last?.storage_urls?.south;
  if (!southUrl) {
    throw new PixelLabError(
      `create-character-v3 completed but no south storage_url found`,
      undefined,
      JSON.stringify(job.last_response).slice(0, 500),
    );
  }

  const res = await fetch(southUrl);
  if (!res.ok) {
    throw new PixelLabError(
      `failed to fetch south sprite from ${southUrl}`,
      res.status,
      await res.text(),
    );
  }
  const original = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(original)
    .resize(size, size, { kernel: "nearest" })
    .png()
    .toBuffer();
  return resized.toString("base64");
}
