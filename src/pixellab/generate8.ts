import sharp from "sharp";
import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";
import { waitForJob } from "./poll.js";
import { DIRECTIONS_8 } from "../types.js";

type StartResponse = { background_job_id: string };

/**
 * Generate 8 directional base sprites. Async (job-based) — last_response.storage_urls
 * maps direction name to a PNG URL. We fetch each, resize to size×size (nearest), and
 * return as raw base64 PNGs (no data: prefix).
 */
export async function generate8Directions(
  client: PixelLabClient,
  description: string,
  size: number,
): Promise<Record<string, string>> {
  const start = await client.post<StartResponse>(
    "/create-character-with-8-directions",
    { description, image_size: { width: size, height: size } },
  );

  const job = await waitForJob(client, start.background_job_id);
  const urls = (job.last_response as { storage_urls?: Record<string, string> } | undefined)
    ?.storage_urls;
  if (!urls) {
    throw new PixelLabError(
      `8-direction job completed but no storage_urls`,
      undefined,
      JSON.stringify(job.last_response).slice(0, 500),
    );
  }

  const out: Record<string, string> = {};
  for (const dir of DIRECTIONS_8) {
    const url = urls[dir];
    if (!url) throw new PixelLabError(`8-direction response missing url for ${dir}`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new PixelLabError(
        `failed to fetch ${dir} from ${url}`,
        res.status,
        await res.text(),
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(buf).resize(size, size, { kernel: "nearest" }).png().toBuffer();
    out[dir] = resized.toString("base64");
  }
  return out;
}
