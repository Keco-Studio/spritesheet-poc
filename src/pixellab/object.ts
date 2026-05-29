import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";
import { removeFlatBackground } from "../sheet/transparency.js";

type Base64Image = { type?: "base64"; base64: string; format?: string };
type PixfluxResponse = { image?: Base64Image };

export type ObjectOptions = {
  description: string;
  /** Square generation size in px (16..400). */
  size?: number;
  seed?: number;
  textGuidanceScale?: number;
};

export type ObjectResult = {
  /** Transparent object sprite as a PNG, base64 (NO "data:" prefix). */
  pngBase64: string;
};

const MIN = 16;
const MAX = 400;

/**
 * Generate a single discrete prop (tree, rock, pond...) as a transparent sprite
 * via pixflux with `no_background: true`. Inpaint blends terrain; for crisp
 * standalone objects to composite onto a map, a transparent sprite is far
 * cleaner. We also run the flood-fill background remover as a safety net in case
 * any flat backdrop survives.
 */
export async function generateObject(
  client: PixelLabClient,
  opts: ObjectOptions,
): Promise<ObjectResult> {
  const size = clamp(opts.size ?? 64);

  const res = await client.post<PixfluxResponse>("/create-image-pixflux", {
    description: opts.description,
    image_size: { width: size, height: size },
    text_guidance_scale: opts.textGuidanceScale ?? 8,
    view: "high top-down",
    no_background: true,
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
  });

  const b64 = res.image?.base64;
  if (!b64) {
    throw new PixelLabError(
      `create-image-pixflux (object) returned no image`,
      undefined,
      JSON.stringify(res).slice(0, 500),
    );
  }

  const clean = await removeFlatBackground(Buffer.from(stripDataUrl(b64), "base64"));
  return { pngBase64: clean.toString("base64") };
}

function clamp(n: number): number {
  return Math.max(MIN, Math.min(MAX, Math.round(n)));
}

function stripDataUrl(s: string): string {
  const i = s.indexOf(",");
  return i >= 0 && s.startsWith("data:") ? s.slice(i + 1) : s;
}
