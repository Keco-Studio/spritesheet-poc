import sharp from "sharp";
import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";

export type TilesetMeta = {
  width: number; // full sheet pixel width
  height: number; // full sheet pixel height
  tileWidth: number; // individual tile px (16 or 32)
  tileHeight: number;
  columns: number; // width / tileWidth
  rows: number; // height / tileHeight
  tilesetId: string;
  name?: string; // e.g. "grass -> sand path" from last_response.tileset_name
};

export type TilesetResult = {
  pngBase64: string; // full tileset sheet re-encoded as PNG, base64 (NO "data:" prefix)
  meta: TilesetMeta;
};

export type TilesetOptions = {
  lowerDescription: string;
  upperDescription: string;
  transitionDescription?: string;
  tileSize?: 16 | 32; // default 16
  view?: "low top-down" | "high top-down"; // default "high top-down"
  transitionSize?: number; // default 0
  seed?: number;
};

type StartResponse = {
  background_job_id: string;
  tileset_id: string;
  status: "processing";
};

type TilesetImage = { base64: string; width?: number; height?: number };

type TilesetJob = {
  status: "processing" | "completed" | "failed";
  error?: string;
  last_response?: {
    type?: string;
    progress?: number;
    tileset_name?: string;
    image?: TilesetImage;
    [key: string]: unknown;
  };
};

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 6 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generate a top-down terrain tileset (lower terrain blending into upper terrain) and
 * return it as a single PNG sheet plus tile-grid metadata.
 *
 * Two PixelLab quirks make this endpoint NOT poll-compatible with waitForJob:
 *
 *   1. The top-level job `status` field stays "processing" indefinitely and effectively
 *      never flips to "completed" for tilesets. The real completion signal is
 *      last_response.type === "message_done" with last_response.image.base64 present, so
 *      we run our own poll loop instead of reusing waitForJob (which would time out).
 *
 *   2. last_response.image.base64 is RAW RGBA bytes — NOT a PNG and NOT a storage_url like
 *      characters/animations return. For 16px tiles the sheet is 128x128 => 65536 bytes.
 *      We decode with sharp's raw input ({ raw: { width, height, channels: 4 } }) and
 *      re-encode to PNG. Dimensions come from image.width/height when present; otherwise
 *      the sheet is square so we infer width = height = round(sqrt(byteLength / 4)).
 *
 * The GET /tilesets/{id} endpoint is unreliable (423 then 404 as the job is GC'd), so we
 * always pull the image from the background job's last_response.
 */
export async function generateTileset(
  client: PixelLabClient,
  opts: TilesetOptions,
): Promise<TilesetResult> {
  const tileSize = opts.tileSize ?? 16;
  const view = opts.view ?? "high top-down";

  const body: Record<string, unknown> = {
    lower_description: opts.lowerDescription,
    upper_description: opts.upperDescription,
    tile_size: { width: tileSize, height: tileSize },
    view,
  };
  if (opts.transitionDescription !== undefined) {
    body.transition_description = opts.transitionDescription;
  }
  if (opts.transitionSize !== undefined) {
    body.transition_size = opts.transitionSize;
  }
  if (opts.seed !== undefined) {
    body.seed = opts.seed;
  }

  const start = await client.post<StartResponse>("/create-tileset", body);

  const job = await waitForTilesetJob(client, start.background_job_id);
  const image = job.last_response?.image;
  if (!image?.base64) {
    throw new PixelLabError(
      `create-tileset job completed but no image returned`,
      undefined,
      JSON.stringify(job.last_response).slice(0, 500),
    );
  }

  const rawBuffer = Buffer.from(image.base64, "base64");
  let width = image.width;
  let height = image.height;
  if (width === undefined || height === undefined) {
    // No dims in the response — the sheet is square, so infer from the byte length.
    const side = Math.round(Math.sqrt(rawBuffer.length / 4));
    console.warn(
      `create-tileset response missing image dimensions; inferring ${side}x${side} from ${rawBuffer.length} raw RGBA bytes`,
    );
    width = side;
    height = side;
  }

  const png = await sharp(rawBuffer, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

  const meta: TilesetMeta = {
    width,
    height,
    tileWidth: tileSize,
    tileHeight: tileSize,
    columns: width / tileSize,
    rows: height / tileSize,
    tilesetId: start.tileset_id,
    name: job.last_response?.tileset_name,
  };

  return { pngBase64: png.toString("base64"), meta };
}

/**
 * Tileset-specific poll loop. Resolves on last_response.type === "message_done" with an
 * image present (the top-level status never flips to "completed" — see module JSDoc).
 */
async function waitForTilesetJob(
  client: PixelLabClient,
  jobId: string,
): Promise<TilesetJob> {
  const start = Date.now();
  while (true) {
    const job = await client.get<TilesetJob>(`/background-jobs/${jobId}`);
    if (job.last_response?.type === "message_done" && job.last_response.image?.base64) {
      return job;
    }
    if (job.status === "failed") {
      throw new PixelLabError(
        `tileset job ${jobId} failed: ${job.error ?? "unknown"}`,
        undefined,
        JSON.stringify(job.last_response).slice(0, 500),
      );
    }
    if (Date.now() - start > TIMEOUT_MS) {
      throw new PixelLabError(
        `tileset job ${jobId} timed out after ${TIMEOUT_MS}ms`,
        undefined,
        JSON.stringify(job.last_response).slice(0, 500),
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
