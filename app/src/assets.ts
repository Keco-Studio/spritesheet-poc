import { ImageSource } from "excalibur";
import { parseManifest, toAssetLookup, type AssetManifest, type AssetEntry } from "../../src/sheet/manifest-schema.js";
import type { AssetLookup } from "../../src/sheet/scene-collision.js";

export type LoadedLibrary = {
  manifest: AssetManifest;
  lookup: AssetLookup;
  images: Record<string, ImageSource>; // assetId -> ImageSource
  entry: (id: string) => AssetEntry;
};

/** Fetch /assets/manifest.json, validate it, and load every asset image. */
export async function loadLibrary(): Promise<LoadedLibrary> {
  const res = await fetch("/assets/manifest.json");
  if (!res.ok) throw new Error(`failed to load asset manifest: ${res.status}`);
  const manifest = parseManifest(await res.json());

  const images: Record<string, ImageSource> = {};
  for (const a of manifest.assets) images[a.id] = new ImageSource(`/assets/${a.file}`);
  await Promise.all(Object.values(images).map((img) => img.load()));

  const byId = new Map(manifest.assets.map((a) => [a.id, a]));
  return {
    manifest,
    lookup: toAssetLookup(manifest),
    images,
    entry: (id) => {
      const e = byId.get(id);
      if (!e) throw new Error(`unknown asset id: ${id}`);
      return e;
    },
  };
}
