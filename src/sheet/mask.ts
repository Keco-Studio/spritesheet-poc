import sharp from "sharp";
import type { Rect } from "./footprint.js";
export type { Rect };

/**
 * Build a `size`x`size` black PNG with the given rects filled white.
 *
 * Used two ways:
 *  - inpaint mask: one white rect = the region to regenerate (black = keep).
 *  - collision layer: every solid feature's rect stamped white (= blocked).
 */
export async function rectsToMaskPng(size: number, rects: Rect[]): Promise<Buffer> {
  const overlays = rects
    .map((r) => clampRect(r, size))
    .filter((r) => r.w > 0 && r.h > 0)
    .map((r) => ({
      input: {
        create: { width: r.w, height: r.h, channels: 4 as const, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      },
      left: r.x,
      top: r.y,
    }));

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}

function clampRect(r: Rect, size: number): Rect {
  const x = Math.max(0, Math.min(size, Math.round(r.x)));
  const y = Math.max(0, Math.min(size, Math.round(r.y)));
  const w = Math.max(0, Math.min(size - x, Math.round(r.w)));
  const h = Math.max(0, Math.min(size - y, Math.round(r.h)));
  return { x, y, w, h };
}
