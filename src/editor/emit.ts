import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Metadata describing how the tileset PNG is sliced into a grid. The editor
 * HTML reads this at runtime to build the SpriteSheet palette, so the field
 * names must stay in sync with template.html's `__TILESET_META__` consumer.
 */
export type TilesetMeta = {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  name?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Render the standalone in-browser tilemap editor. We inline the tileset PNG as
 * a data URL (so the HTML is self-contained — no sibling image file needed) and
 * inject the slicing meta as JSON. The `.replace(/</g, "<")` guards against
 * a stray "<" inside the JSON prematurely closing the <script> tag, exactly like
 * src/preview/emit.ts does for the manifest.
 */
export function emitEditor(
  outDir: string,
  pngBuffer: Buffer,
  meta: TilesetMeta,
): string {
  const templatePath = join(__dirname, "template.html");
  const template = readFileSync(templatePath, "utf8");

  const imageDataUrl = "data:image/png;base64," + pngBuffer.toString("base64");

  const html = template
    .replace("__TILESET_SRC__", imageDataUrl)
    .replace("__TILESET_META__", JSON.stringify(meta).replace(/</g, "\\u003c"));

  const outPath = join(outDir, "editor.html");
  writeFileSync(outPath, html, "utf8");
  return outPath;
}
