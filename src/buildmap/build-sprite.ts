import sharp from "sharp";
import { generateMap } from "../pixellab/map.js";
import { generateObject } from "../pixellab/object.js";
import { footprintEllipse, type Rect } from "../core/footprint.js";
import type { PixelLabClient } from "../pixellab/client.js";
import { rectOf, type Spec, type BuiltMap, type ObjPlace } from "./spec.js";

/**
 * Crop a sprite to its non-transparent content. Generated sprites often have
 * transparent padding inside their frame, so the frame's bottom ≠ the object's
 * visual base. Trimming makes the placement rect match the real object, so
 * collision, y-sort feet, and the contact shadow all align to what you see.
 */
async function trimToContent(
  spritePng: Buffer,
  w: number,
  h: number,
): Promise<{ png: Buffer; dx: number; dy: number; w: number; h: number }> {
  const { data } = await sharp(spritePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return { png: spritePng, dx: 0, dy: 0, w, h }; // fully transparent: leave as-is
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const png = await sharp(spritePng).extract({ left: x0, top: y0, width: cw, height: ch }).png().toBuffer();
  return { png, dx: x0, dy: y0, w: cw, h: ch };
}

/**
 * Stamp an object's BASE FOOTPRINT into the collision buffer as a solid ELLIPSE
 * at the object's feet (bottom-center). Height = `footprint` × the object's
 * height, width = the object's width. This is the classic top-down "feet
 * collider": guaranteed present (unlike a thin trunk's alpha), tight (not the
 * whole box), and a clean full ellipse for flat props (footprint 1.0 = pond).
 */
function stampFootprint(collision: Uint8Array, size: number, rect: Rect, footprint: number): void {
  const e = footprintEllipse(rect, footprint);
  const y0 = Math.max(0, Math.floor(e.cy - e.ry));
  const y1 = Math.min(size - 1, Math.ceil(e.cy + e.ry));
  const x0 = Math.max(0, Math.floor(e.cx - e.rx));
  const x1 = Math.min(size - 1, Math.ceil(e.cx + e.rx));
  for (let my = y0; my <= y1; my++) {
    for (let mx = x0; mx <= x1; mx++) {
      const nx = (mx + 0.5 - e.cx) / e.rx, ny = (my + 0.5 - e.cy) / e.ry;
      if (nx * nx + ny * ny <= 1) collision[my * size + mx] = 255;
    }
  }
}

/** Turn a size×size 0/255 buffer into a black/white PNG (white = blocked). */
function collisionToPng(collision: Uint8Array, size: number): Promise<Buffer> {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = collision[i];
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  return sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

/**
 * SPRITE mode (default, recommended): each feature is generated as a transparent
 * object sprite (pixflux no_background), emitted as a separate placement (not
 * composited) so the game can y-sort it against the character, and its base
 * footprint OR'd into the collision layer — clean edges, pixel-accurate collision.
 */
export async function buildSprite(client: PixelLabClient, spec: Spec): Promise<BuiltMap> {
  console.log(`▸ generating base: "${spec.base}" (${spec.size}×${spec.size})...`);
  const base = await generateMap(client, { description: spec.base, size: spec.size, seed: spec.seed });

  const collision = new Uint8Array(spec.size * spec.size);
  const objects: ObjPlace[] = [];
  let solidCount = 0;

  for (let i = 0; i < spec.features.length; i++) {
    const f = spec.features[i];
    const rect = rectOf(f, spec.size);
    console.log(`▸ object ${i + 1}/${spec.features.length}: "${f.prompt}" @ [${f.rect.join(",")}]...`);
    const genSize = Math.max(32, Math.min(128, Math.max(rect.w, rect.h)));
    const obj = await generateObject(client, {
      description: f.prompt,
      size: genSize,
      seed: spec.seed,
      textGuidanceScale: f.guidance ?? 8,
    });
    const resized = await sharp(Buffer.from(obj.pngBase64, "base64"))
      .resize(rect.w, rect.h, { kernel: "nearest" })
      .png()
      .toBuffer();
    // Trim transparent padding so the placement matches the visible object.
    const t = await trimToContent(resized, rect.w, rect.h);
    const placed: Rect = { x: rect.x + t.dx, y: rect.y + t.dy, w: t.w, h: t.h };
    objects.push({ spriteB64: t.png.toString("base64"), x: placed.x, y: placed.y, w: placed.w, h: placed.h, shadow: f.collides });
    if (f.collides) {
      stampFootprint(collision, spec.size, placed, f.footprint);
      solidCount++;
    }
  }

  const collisionPng = await collisionToPng(collision, spec.size);
  console.log(`  done (${solidCount}/${spec.features.length} features solid, base-footprint collision)`);
  return { mapB64: base.pngBase64, collisionB64: collisionPng.toString("base64"), objects };
}
