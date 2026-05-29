import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";

type Base64Image = { type?: "base64"; base64: string; format?: string };
type PixfluxResponse = { image?: Base64Image };

export type MapMeta = {
  width: number;
  height: number;
};

export type MapResult = {
  /** Full map image as a PNG, base64 (NO "data:" prefix). */
  pngBase64: string;
  meta: MapMeta;
};

export type MapOptions = {
  description: string;
  /** Square map size in px. PixelLab pixflux clamps to 16..400. Default 320. */
  size?: number;
  /** Weakly-guiding camera view; "high top-down" reads best as a walkable map. */
  view?: "low top-down" | "high top-down" | "side";
  seed?: number;
  textGuidanceScale?: number;
};

const MIN = 16;
const MAX = 400;

/**
 * Generate a whole top-down map image in a single call.
 *
 * Unlike the character/tileset endpoints, /create-image-pixflux is SYNCHRONOUS:
 * it returns the finished image inline (`image.base64`, a real PNG — already
 * base64, not raw RGBA) with no background job to poll. We strip any accidental
 * data: prefix and pass the bytes straight through.
 */
export async function generateMap(
  client: PixelLabClient,
  opts: MapOptions,
): Promise<MapResult> {
  const size = clamp(opts.size ?? 320);

  const res = await client.post<PixfluxResponse>("/create-image-pixflux", {
    description: opts.description,
    image_size: { width: size, height: size },
    text_guidance_scale: opts.textGuidanceScale ?? 8,
    view: opts.view ?? "high top-down",
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
  });

  const b64 = res.image?.base64;
  if (!b64) {
    throw new PixelLabError(
      `create-image-pixflux returned no image`,
      undefined,
      JSON.stringify(res).slice(0, 500),
    );
  }

  return {
    pngBase64: stripDataUrl(b64),
    meta: { width: size, height: size },
  };
}

function clamp(n: number): number {
  return Math.max(MIN, Math.min(MAX, Math.round(n)));
}

function stripDataUrl(s: string): string {
  const i = s.indexOf(",");
  return i >= 0 && s.startsWith("data:") ? s.slice(i + 1) : s;
}
