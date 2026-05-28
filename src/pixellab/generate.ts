import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";
import { waitForJob } from "./poll.js";

type CreateCharacterStartResponse = { background_job_id: string };

type DirectionImages = Record<string, { type: "base64"; base64: string }>;

/**
 * Returns the south-facing 64x64 PNG as a raw base64 string (no data: prefix).
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
  const images = (job.last_response?.images ?? job.last_response) as DirectionImages | undefined;
  const south = images?.south?.base64;
  if (!south) {
    throw new PixelLabError(
      `create-character-v3 completed but no south image found`,
      undefined,
      JSON.stringify(job.last_response).slice(0, 500),
    );
  }
  return stripDataUrl(south);
}

function stripDataUrl(s: string): string {
  const i = s.indexOf(",");
  return i >= 0 && s.startsWith("data:") ? s.slice(i + 1) : s;
}
