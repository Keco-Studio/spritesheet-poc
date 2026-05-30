import { z } from "zod";
import type { AssetLookup } from "./scene-collision.js";

export const AssetEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  file: z.string().min(1),
  footprint: z.number().min(0.05).max(1),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export const ManifestSchema = z.object({ assets: z.array(AssetEntrySchema).min(1) });

export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type AssetManifest = z.infer<typeof ManifestSchema>;

export function parseManifest(raw: unknown): AssetManifest {
  return ManifestSchema.parse(raw);
}

export function toAssetLookup(m: AssetManifest): AssetLookup {
  const lookup: AssetLookup = {};
  for (const a of m.assets) lookup[a.id] = { w: a.w, h: a.h, footprint: a.footprint };
  return lookup;
}
