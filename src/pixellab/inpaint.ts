import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";

type Base64Image = { type?: "base64"; base64: string; format?: string };
type InpaintResponse = { image?: Base64Image };

export type InpaintOptions = {
  /** Source image to edit, base64 PNG (NO "data:" prefix). */
  baseImagePng: string;
  /** Mask, base64 PNG (NO "data:" prefix). WHITE = regenerate, BLACK = keep. */
  maskPng: string;
  /** What to draw in the masked (white) region. */
  description: string;
  /** Square size in px. Sync /inpaint is capped at 200. */
  size: number;
  seed?: number;
  textGuidanceScale?: number;
};

export type InpaintResult = {
  /** Full edited image as a PNG, base64 (NO "data:" prefix). */
  pngBase64: string;
};

const MAX = 200;

/**
 * Edit a region of an image via PixelLab's /inpaint.
 *
 * Like pixflux, /inpaint is SYNCHRONOUS — the finished image comes back inline
 * (no background job). The mask is a black/white image the SAME size as the
 * source: white pixels get regenerated to match `description`, black pixels are
 * preserved. Sync /inpaint is limited to 200x200 (use the async /inpaint-v3 Pro
 * endpoint for larger images).
 */
export async function inpaint(
  client: PixelLabClient,
  opts: InpaintOptions,
): Promise<InpaintResult> {
  if (opts.size > MAX || opts.size < 16) {
    throw new PixelLabError(`inpaint size must be 16..${MAX}, got ${opts.size}`);
  }

  const res = await client.post<InpaintResponse>("/inpaint", {
    description: opts.description,
    image_size: { width: opts.size, height: opts.size },
    inpainting_image: { type: "base64", base64: opts.baseImagePng },
    mask_image: { type: "base64", base64: opts.maskPng },
    text_guidance_scale: opts.textGuidanceScale ?? 3,
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
  });

  const b64 = res.image?.base64;
  if (!b64) {
    throw new PixelLabError(
      `inpaint returned no image`,
      undefined,
      JSON.stringify(res).slice(0, 500),
    );
  }
  return { pngBase64: stripDataUrl(b64) };
}

function stripDataUrl(s: string): string {
  const i = s.indexOf(",");
  return i >= 0 && s.startsWith("data:") ? s.slice(i + 1) : s;
}
