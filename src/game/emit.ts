import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Manifest } from "../types.js";
import type { MapMeta } from "../pixellab/map.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** A placed object sprite: rendered as its own y-sorted actor over the base map. */
export type ObjectPlacement = {
  png: Buffer;
  x: number; // top-left in map/world coords
  y: number;
  w: number;
  h: number;
  shadow?: boolean; // draw a contact shadow under it (grounds tall props)
};

/**
 * Emit a self-contained, runnable game.html (Excalibur from esm.sh — no bundler).
 *
 * The base map is the background; each ObjectPlacement becomes its OWN actor so
 * we can y-sort it against the character (walk behind a tree's canopy). The
 * character walks with WASD; collision comes from the base-footprint mask. All
 * images are inlined as data URLs so the file is portable.
 */
export function emitGame(
  outDir: string,
  mapPng: Buffer,
  mapMeta: MapMeta,
  charPng: Buffer,
  manifest: Manifest,
  collisionPng?: Buffer,
  objects: ObjectPlacement[] = [],
): string {
  const templatePath = join(__dirname, "template.html");
  const template = readFileSync(templatePath, "utf8");

  const mapSrc = "data:image/png;base64," + mapPng.toString("base64");
  const charSrc = "data:image/png;base64," + charPng.toString("base64");
  // Empty string => no collision layer (template treats it as none).
  const collisionSrc = collisionPng
    ? "data:image/png;base64," + collisionPng.toString("base64")
    : "";
  const objectsJson = objects.map((o) => ({
    src: "data:image/png;base64," + o.png.toString("base64"),
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    shadow: o.shadow ?? false,
  }));

  const html = template
    .replace("__MAP_SRC__", mapSrc)
    .replace("__CHAR_SRC__", charSrc)
    .replace("__COLLISION_SRC__", collisionSrc)
    .replace("__MAP_META__", JSON.stringify(mapMeta).replace(/</g, "\\u003c"))
    .replace("__OBJECTS_JSON__", JSON.stringify(objectsJson).replace(/</g, "\\u003c"))
    .replace("__MANIFEST_JSON__", JSON.stringify(manifest).replace(/</g, "\\u003c"));

  const outPath = join(outDir, "game.html");
  writeFileSync(outPath, html, "utf8");
  return outPath;
}
