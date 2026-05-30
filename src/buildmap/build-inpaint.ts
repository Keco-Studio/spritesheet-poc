import { generateMap } from "../pixellab/map.js";
import { inpaint } from "../pixellab/inpaint.js";
import { rectsToMaskPng, type Rect } from "../sheet/mask.js";
import type { PixelLabClient } from "../pixellab/client.js";
import { rectOf, type Spec, type BuiltMap } from "./spec.js";

/**
 * INPAINT mode: sequentially regenerate each feature's rect via /inpaint, using
 * the rules learned from testing — guidance 8 and the feature's background named
 * in the prompt (so the box fills with grass, not a dark backdrop). Collision is
 * the feature rect (inpaint fills the whole box, so there is no alpha to trace).
 * Capped at 200px by sync /inpaint; expect a faint box-seam at each feature.
 */
export async function buildInpaint(client: PixelLabClient, spec: Spec): Promise<BuiltMap> {
  if (spec.size > 200) {
    throw new Error(`inpaint mode requires "size" <= 200 (sync /inpaint cap); spec has ${spec.size}`);
  }
  console.log(`▸ generating base: "${spec.base}" (${spec.size}×${spec.size})...`);
  const base = await generateMap(client, { description: spec.base, size: spec.size, seed: spec.seed });
  let mapB64 = base.pngBase64;
  const collisionRects: Rect[] = [];

  for (let i = 0; i < spec.features.length; i++) {
    const f = spec.features[i];
    const rect = rectOf(f, spec.size);
    const prompt = `${f.prompt}, on a ${spec.background} background, top-down`;
    console.log(`▸ inpaint ${i + 1}/${spec.features.length}: "${prompt}" @ [${f.rect.join(",")}]...`);
    const maskB64 = (await rectsToMaskPng(spec.size, [rect])).toString("base64");
    const res = await inpaint(client, {
      baseImagePng: mapB64,
      maskPng: maskB64,
      description: prompt,
      size: spec.size,
      seed: spec.seed,
      textGuidanceScale: f.guidance ?? 8, // 8 works; default 3 is too low
    });
    mapB64 = res.pngBase64;
    if (f.collides) collisionRects.push(rect);
  }

  const collisionPng = await rectsToMaskPng(spec.size, collisionRects); // white = blocked
  console.log(`  done (${collisionRects.length}/${spec.features.length} features solid)`);
  // Inpaint bakes objects into the map image, so there are no separate props.
  return { mapB64, collisionB64: collisionPng.toString("base64"), objects: [] };
}
